// 📄 src/app/admin/relatorios/comissoes/pdf/route.ts
// =============================================================================
// CDC Manager — Extrato de pagamento de um médico em PDF (8.ª ronda/14)
// GET ?mes=YYYY-MM&medico=<id>[&clinica=<id>] — só a gestão.
// Mesmas regras de fecho de mês da listagem (lib/commission-accounting.ts).
// Os ajustes manuais só entram sem filtro de clínica.
// =============================================================================

import mongoose from 'mongoose';
import { getVerifiedSession } from '@/lib/get-verified-session';
import Procedure from '@/models/Procedure';
import CommissionAdjustment from '@/models/CommissionAdjustment';
import DoctorPayAdjustment from '@/models/DoctorPayAdjustment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Clinic from '@/models/Clinic';
import Organization from '@/models/Organization';
import { formatCents } from '@/lib/commissions';
import {
  adjustmentsMatch,
  lisbonMonthOf,
  monthBoundsUtc,
  producedProceduresMatch,
} from '@/lib/commission-accounting';
import { processLabel } from '@/lib/domain';
import { payTotals } from '@/lib/pay-statement';
import { renderStatementPdf, type StatementRow } from '@/lib/pay-statement-pdf';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const dateFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

export async function GET(req: Request) {
  const session = await getVerifiedSession(['admin']);
  if (!session?.user?.id) {
    return new Response('Sem permissões.', { status: 401 });
  }
  const url = new URL(req.url);
  const medico = url.searchParams.get('medico') ?? '';
  const clinica = url.searchParams.get('clinica') ?? '';
  const mesParam = url.searchParams.get('mes') ?? '';
  if (!mongoose.isValidObjectId(medico)) {
    return new Response('Profissional inválido.', { status: 400 });
  }
  const now = new Date();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam)
    ? mesParam
    : lisbonMonthOf(now);
  const clinicFilter = mongoose.isValidObjectId(clinica) ? clinica : '';
  const [start, end] = monthBoundsUtc(mes);

  const extra: Record<string, unknown> = {
    doctorId: new mongoose.Types.ObjectId(medico),
  };
  if (clinicFilter) extra.clinicId = new mongoose.Types.ObjectId(clinicFilter);

  const [doctor, clinic, org, procedures, adjustments, manual] =
    await Promise.all([
      Doctor.findById(medico).select('name').lean(),
      clinicFilter ? Clinic.findById(clinicFilter).select('name').lean() : null,
      Organization.findOne().select('name legalName nipc').lean(),
      Procedure.find(producedProceduresMatch(start, end, extra))
        .sort({ executedAt: 1 })
        .lean(),
      CommissionAdjustment.find(adjustmentsMatch(start, end, extra))
        .sort({ effectiveAt: 1 })
        .lean(),
      clinicFilter
        ? []
        : DoctorPayAdjustment.find({
            doctorId: medico,
            month: mes,
            removedAt: null,
          })
            .sort({ createdAt: 1 })
            .lean(),
    ]);
  if (!doctor) return new Response('Profissional não encontrado.', { status: 404 });

  const patientIds = Array.from(
    new Set([
      ...procedures.map(p => String(p.patientId)),
      ...adjustments.map(a => String(a.patientId)),
    ]),
  );
  const patients = await Patient.find({ _id: { $in: patientIds } })
    .select('name processNumber')
    .lean();
  const patientById = new Map(patients.map(p => [String(p._id), p]));

  const rows: (StatementRow & { at: number })[] = [];
  for (const p of procedures) {
    const pat = patientById.get(String(p.patientId));
    const at = (p.executedAt ?? p.createdAt) as Date;
    rows.push({
      at: at.getTime(),
      date: dateFmt.format(at),
      processNumber: pat ? processLabel(pat.processNumber) : '—',
      patientName: pat?.name ?? '(paciente removido)',
      description:
        p.nameSnapshot +
        (p.toothNumbers?.length ? ` (dentes ${p.toothNumbers.join(', ')})` : ''),
      priceCents: p.priceCents,
      costCents: p.costCents ?? 0,
      baseCents: p.commissionBaseCents ?? p.priceCents,
      rule:
        p.commissionMode === 'fixed'
          ? `Fixo ${formatCents(p.commissionFixedCents ?? 0)}`
          : `${Math.round(p.commissionRate * 10000) / 100}%`,
      commissionCents: p.commissionCents,
      isAdjustment: false,
    });
  }
  for (const a of adjustments) {
    const pat = patientById.get(String(a.patientId));
    const at = a.effectiveAt as Date;
    rows.push({
      at: at.getTime(),
      date: dateFmt.format(at),
      processNumber: pat ? processLabel(pat.processNumber) : '—',
      patientName: pat?.name ?? '(paciente removido)',
      description: `ESTORNO: ${a.descriptionSnapshot}`,
      priceCents: a.priceCents,
      costCents: a.costCents,
      baseCents: a.commissionBaseCents,
      rule: a.reason === 'invoice-void' ? 'Nota de crédito' : 'Anulação',
      commissionCents: a.commissionCents,
      isAdjustment: true,
    });
  }
  rows.sort((x, y) => x.at - y.at);

  const totals = payTotals(
    rows.map(r => r.commissionCents),
    manual.map(m => m.amountCents),
  );
  const [y, m] = mes.split('-').map(Number);
  const pdf = await renderStatementPdf({
    organization: org?.name ?? 'Centro Dentário Colombo',
    legalLine:
      [org?.legalName, org?.nipc ? `NIPC ${org.nipc}` : null]
        .filter(Boolean)
        .join(' | ') || null,
    doctorName: doctor.name,
    monthLabel: `${MONTH_NAMES[m - 1]} de ${y}`,
    clinicName: clinic?.name ?? null,
    issuedAtLabel: dateFmt.format(now),
    rows,
    manual: manual.map(x => ({
      description: x.description,
      amountCents: x.amountCents,
    })),
    ...totals,
  });

  const slug = doctor.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="extrato-${slug || 'profissional'}-${mes}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
