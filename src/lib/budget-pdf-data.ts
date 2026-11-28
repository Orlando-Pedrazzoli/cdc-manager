// 📄 src/lib/budget-pdf-data.ts
// =============================================================================
// CDC Manager — Carrega um orçamento e devolve o PDF A4 (27/11/2026)
// Usado pelas duas rotas de impressão:
//   /admin/orcamentos/[id]/pdf   — gestão e receção
//   /doutor/orcamentos/[id]/pdf  — médico com consultas com esse paciente
//                                  (a mesma regra da página de planos)
// A sessão é validada por quem chama; aqui confirma-se só o acesso do médico
// ao paciente do orçamento.
// =============================================================================

import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Clinic from '@/models/Clinic';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import TreatmentPlan from '@/models/TreatmentPlan';
import { logAudit } from '@/lib/audit';
import { budgetNumberLabel } from '@/lib/budgets';
import { documentLogoDataUrl } from '@/lib/document-logo';
import {
  longDatePt,
  placeFromAddress,
  shortDatePt,
} from '@/lib/document-merge';
import {
  budgetPdfFilename,
  budgetPrintRows,
  budgetPrintTotals,
} from '@/lib/budget-print';
import { renderBudgetPdf } from '@/lib/budget-pdf';

export async function budgetPdfResponse(params: {
  planId: string;
  userId: string;
  /** Só para o médico: o seu perfil (tem de ter consultas com o paciente) */
  doctorId?: string | null;
}): Promise<Response> {
  if (!mongoose.isValidObjectId(params.planId))
    return new Response('Orçamento inválido.', { status: 400 });
  await dbConnect();
  const plan = await TreatmentPlan.findById(params.planId).lean();
  if (!plan) return new Response('Orçamento não encontrado.', { status: 404 });

  if (params.doctorId !== undefined) {
    const related =
      params.doctorId &&
      (await Appointment.exists({
        doctorId: params.doctorId,
        patientId: plan.patientId,
      }));
    // sem relação com o paciente: responde como se não existisse
    if (!related)
      return new Response('Orçamento não encontrado.', { status: 404 });
  }

  const [patient, doctor, clinic] = await Promise.all([
    Patient.findById(plan.patientId).select('name processNumber').lean(),
    Doctor.findById(plan.doctorId).select('name fullName licenseNumber').lean(),
    Clinic.findById(plan.clinicId)
      .select('name legalName nipc address phone email')
      .lean(),
  ]);
  if (!patient) return new Response('Paciente não encontrado.', { status: 404 });

  const rows = budgetPrintRows(plan.items ?? []);
  const isDraft = plan.status === 'draft';
  const date = (plan.proposedAt ?? plan.createdAt ?? new Date()) as Date;
  const now = new Date();
  const pdf = await renderBudgetPdf({
    logoDataUrl: await documentLogoDataUrl(),
    clinic: {
      name: clinic?.name ?? 'Centro Dentário Colombo',
      legalName: clinic?.legalName ?? null,
      nipc: clinic?.nipc ?? null,
      address: clinic?.address ?? null,
      phone: clinic?.phone ?? null,
      email: clinic?.email ?? null,
    },
    numberLabel:
      typeof plan.number === 'number' ? budgetNumberLabel(plan.number) : null,
    isDraft,
    title: plan.title,
    patientName: patient.name,
    patientNumber:
      patient.processNumber != null ? String(patient.processNumber) : null,
    doctorName: doctor ? doctor.fullName || doctor.name : null,
    doctorLicense: doctor?.licenseNumber ?? null,
    dateLabel: shortDatePt(date),
    validUntilLabel: plan.validUntil ? shortDatePt(plan.validUntil) : null,
    rows,
    totals: budgetPrintTotals(rows, plan.discountCents),
    notes: plan.notes?.trim() || null,
    issuedAtLabel: `${placeFromAddress(clinic?.address)}, ${longDatePt(now)}`,
  });

  await logAudit({
    userId: params.userId,
    action: 'export',
    entityType: 'TreatmentPlan',
    entityId: String(plan._id),
    patientId: String(plan.patientId),
    summary: `Orçamento impresso (PDF): ${budgetNumberLabel(plan.number)} — ${plan.title}`,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // "inline": abre no visualizador do browser, pronto a imprimir em A4
      'Content-Disposition': `inline; filename="${budgetPdfFilename(plan.number)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
