// 📄 src/actions/patient-quick.ts
// =============================================================================
// CDC Manager — Server Actions: ficha rápida do paciente (agenda)
// -----------------------------------------------------------------------------
// 4.ª ronda (Victor, nov. 2026), ponto 05: "clicar no nome do paciente na
// marcação e abrir uma janela com os dados gerais (contacto, alertas, saldo,
// próximas marcações) e a opção de editar a ficha, sem sair da agenda".
//
//   · getPatientQuickViewAction — leitura dos dados gerais num só pedido
//   · updatePatientContactAction — edição rápida do que a receção corrige ao
//     balcão: telemóvel, email e alerta administrativo. O resto edita-se na
//     ficha completa (abre em nova aba; a agenda não se perde).
// RBAC: administração e receção (as mesmas regras de actions/patients.ts).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import User from '@/models/User';
import Appointment from '@/models/Appointment';
import Invoice from '@/models/Invoice';
import Procedure from '@/models/Procedure';
import ClinicalRecord from '@/models/ClinicalRecord';
import Doctor from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { clinicLabel } from '@/lib/branding';
import { logAudit } from '@/lib/audit';
import { phoneField, emailField } from '@/lib/validations/patient';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

async function requireStaff() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para consultar pacientes.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== role) {
    throw new Error('Conta inativa ou permissões alteradas. Inicie sessão novamente.');
  }
  return session.user;
}

const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Lisbon' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Lisbon',
});

export type PatientQuickView = {
  id: string;
  name: string;
  processNumber: number | string;
  age: number | null;
  birthDateLabel: string | null;
  phone: string | null;
  email: string | null;
  nif: string | null;
  /** Alerta administrativo da receção (Patient.notes) */
  adminNote: string | null;
  allergies: string[];
  /** A ficha de anamnese existe e está preenchida */
  hasAnamnesis: boolean;
  dueCents: number;
  unbilledCents: number;
  unbilledCount: number;
  lastVisitLabel: string | null;
  upcoming: { id: string; whenLabel: string; doctorName: string; treatmentName: string; clinicLabel: string; status: string }[];
};

export async function getPatientQuickViewAction(patientId: string): Promise<PatientQuickView | { error: string }> {
  try {
    await requireStaff();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!OBJECT_ID.test(patientId)) return { error: 'Paciente inválido.' };

  const now = new Date();
  const [patient, record, invoices, unbilled, upcoming, lastVisit, clinics] = await Promise.all([
    Patient.findById(patientId).select('name processNumber birthDate phone email nif notes status').lean(),
    ClinicalRecord.findOne({ patientId }).select('allergies questionnaire.completedAt questionnaire.data').lean(),
    Invoice.find({ patientId, status: { $ne: 'voided' } }).select('totalCents paidCents').lean(),
    Procedure.find({ patientId, status: 'completed', invoiceId: null }).select('priceCents').lean(),
    Appointment.find({ patientId, startAt: { $gte: now }, status: { $in: ['pending', 'confirmed', 'checked-in'] } })
      .sort({ startAt: 1 })
      .limit(5)
      .select('startAt doctorId treatmentTypeId clinicId status')
      .lean(),
    Appointment.findOne({ patientId, status: 'completed', startAt: { $lt: now } }).sort({ startAt: -1 }).select('startAt').lean(),
    getActiveClinics(),
  ]);
  if (!patient || patient.status === 'anonymized') return { error: 'Paciente não encontrado.' };

  const doctorIds = [...new Set(upcoming.map(a => String(a.doctorId)).filter(id => OBJECT_ID.test(id)))];
  const treatmentIds = [...new Set(upcoming.map(a => String(a.treatmentTypeId)).filter(id => OBJECT_ID.test(id)))];
  const [doctors, treatments] = await Promise.all([
    doctorIds.length ? Doctor.find({ _id: { $in: doctorIds } }).select('name').lean() : [],
    treatmentIds.length ? TreatmentType.find({ _id: { $in: treatmentIds } }).select('name').lean() : [],
  ]);
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));
  const treatmentName = new Map(treatments.map(t => [String(t._id), t.name]));
  const clinicName = new Map(clinics.map(c => [String(c._id), clinicLabel(c)]));

  let age: number | null = null;
  if (patient.birthDate) {
    const b = new Date(patient.birthDate);
    age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  }
  const questionnaire = (record as { questionnaire?: { completedAt?: Date | null; data?: unknown } | null } | null)?.questionnaire;

  return {
    id: patientId,
    name: patient.name,
    processNumber: patient.processNumber,
    age,
    birthDateLabel: patient.birthDate ? dateFmt.format(new Date(patient.birthDate)) : null,
    phone: (patient.phone as string | null) ?? null,
    email: (patient.email as string | null) ?? null,
    nif: (patient.nif as string | null) ?? null,
    adminNote: (patient.notes as string | null) ?? null,
    allergies: ((record?.allergies as string[] | undefined) ?? []).filter(Boolean),
    hasAnamnesis: !!(questionnaire?.completedAt ?? questionnaire?.data),
    dueCents: invoices.reduce((a, i) => a + (i.totalCents - (i.paidCents ?? i.totalCents)), 0),
    unbilledCents: unbilled.reduce((a, p) => a + p.priceCents, 0),
    unbilledCount: unbilled.length,
    lastVisitLabel: lastVisit ? dateFmt.format(lastVisit.startAt as Date) : null,
    upcoming: upcoming.map(a => ({
      id: String(a._id),
      whenLabel: dateTimeFmt.format(a.startAt as Date),
      doctorName: doctorName.get(String(a.doctorId)) ?? 'Sem médico',
      treatmentName: treatmentName.get(String(a.treatmentTypeId)) ?? '—',
      clinicLabel: clinicName.get(String(a.clinicId)) ?? '',
      status: a.status as string,
    })),
  };
}

const contactSchema = z.object({
  phone: phoneField,
  email: emailField,
  adminNote: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(2000, 'Alerta demasiado longo (máx. 2000)').nullable(),
  ),
});

export async function updatePatientContactAction(
  patientId: string,
  input: { phone: string; email: string; adminNote: string },
): Promise<{ success: true } | { error: string }> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!OBJECT_ID.test(patientId)) return { error: 'Paciente inválido.' };
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const patient = await Patient.findById(patientId).select('phone email notes status').lean();
  if (!patient || patient.status === 'anonymized') return { error: 'Paciente não encontrado.' };

  const next = { phone: parsed.data.phone ?? null, email: parsed.data.email ?? null, notes: parsed.data.adminNote ?? null };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(k => (patient[k] ?? null) !== next[k]);
  if (changed.length === 0) return { success: true };

  await Patient.updateOne({ _id: patientId }, { $set: Object.fromEntries(changed.map(k => [k, next[k]])) });
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Patient',
    entityId: patientId,
    patientId,
    summary: 'Contacto/alerta atualizado na ficha rápida da agenda',
    changedFields: changed,
  });
  revalidatePath('/admin/agenda');
  revalidatePath(`/admin/pacientes/${patientId}`);
  return { success: true };
}
