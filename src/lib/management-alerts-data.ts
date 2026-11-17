// 📄 src/lib/management-alerts-data.ts
// =============================================================================
// CDC Manager — Avisos da gestão: leitura da base (8.ª ronda/09, 16, 17, 18)
// As contas estão em lib/management-alerts.ts; aqui só se vai buscar os dados.
// Só para Server Components / actions.
// =============================================================================

import Doctor from '@/models/Doctor';
import Employee from '@/models/Employee';
import ExpiryItem from '@/models/ExpiryItem';
import {
  birthdayAlerts,
  contractAlerts,
  expiryAlerts,
  sortAlerts,
  type AlertExpiry,
  type ManagementAlert,
} from '@/lib/management-alerts';

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Hoje, 'YYYY-MM-DD', no fuso de Lisboa */
export const lisbonToday = (now: Date = new Date()) => dayKeyFmt.format(now);
/** As datas destes avisos são gravadas ao meio-dia UTC: o dia é o do ISO */
const isoDay = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

/** Prazos ativos, prontos para as contas e para a página */
export async function loadExpiryItems(filter: { doctorId?: string } = {}) {
  const items = await ExpiryItem.find({
    active: true,
    ...(filter.doctorId ? { scope: 'doctor', doctorId: filter.doctorId } : {}),
  })
    .sort({ expiresAt: 1 })
    .lean();
  const doctorIds = [
    ...new Set(items.map(i => (i.doctorId ? String(i.doctorId) : null)).filter(Boolean)),
  ] as string[];
  const doctors = doctorIds.length
    ? await Doctor.find({ _id: { $in: doctorIds } }).select('name').lean()
    : [];
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));
  return items.map(i => ({
    id: String(i._id),
    scope: i.scope as 'doctor' | 'partner',
    name: i.name,
    doctorId: i.doctorId ? String(i.doctorId) : null,
    doctorName: i.doctorId ? (doctorName.get(String(i.doctorId)) ?? '—') : null,
    company: i.company ?? null,
    contact: i.contact ?? null,
    phone: i.phone ?? null,
    email: i.email ?? null,
    notes: i.notes ?? null,
    expiresIso: isoDay(i.expiresAt) as string,
  }));
}

const toAlertExpiry = (
  rows: Awaited<ReturnType<typeof loadExpiryItems>>,
): AlertExpiry[] =>
  rows.map(r => ({
    id: r.id,
    scope: r.scope,
    name: r.name,
    owner: r.scope === 'doctor' ? r.doctorName : r.company,
    doctorId: r.doctorId,
    expiresIso: r.expiresIso,
  }));

/** Todos os avisos da gestão de hoje, urgentes primeiro */
export async function getManagementAlerts(
  now: Date = new Date(),
): Promise<ManagementAlert[]> {
  const today = lisbonToday(now);
  const [doctors, employees, items] = await Promise.all([
    Doctor.find({ active: true, birthDate: { $ne: null } })
      .select('name birthDate')
      .lean(),
    Employee.find({
      $and: [
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        {
          $or: [
            { birthDate: { $ne: null } },
            { 'contractEndDates.0': { $exists: true } },
          ],
        },
      ],
    })
      .select('name birthDate contractEndDates')
      .lean(),
    loadExpiryItems(),
  ]);
  return sortAlerts([
    ...birthdayAlerts(
      [
        ...doctors.map(d => ({
          id: String(d._id),
          name: d.name,
          type: 'doctor' as const,
          birthIso: isoDay(d.birthDate),
        })),
        ...employees.map(e => ({
          id: String(e._id),
          name: e.name,
          type: 'employee' as const,
          birthIso: isoDay(e.birthDate),
        })),
      ],
      today,
    ),
    ...contractAlerts(
      employees.map(e => ({
        employeeId: String(e._id),
        name: e.name,
        endIsos: (e.contractEndDates ?? [])
          .map(d => isoDay(d as Date))
          .filter((x): x is string => !!x),
      })),
      today,
    ),
    ...expiryAlerts(toAlertExpiry(items), today),
  ]);
}

/** Avisos dos documentos de UM médico (para ele ver no seu painel) */
export async function getDoctorDocumentAlerts(
  doctorId: string,
  now: Date = new Date(),
): Promise<ManagementAlert[]> {
  const items = await loadExpiryItems({ doctorId });
  return sortAlerts(expiryAlerts(toAlertExpiry(items), lisbonToday(now)));
}
