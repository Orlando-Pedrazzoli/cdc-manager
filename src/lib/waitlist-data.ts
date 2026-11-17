// 📄 src/lib/waitlist-data.ts
// =============================================================================
// CDC Manager — Lista de espera: leitura da base (8.ª ronda/10)
// Só para Server Components. As contas estão em lib/waitlist.ts.
// =============================================================================

import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Waitlist from '@/models/Waitlist';
import { patientNameWithProcess } from '@/lib/domain';
import {
  waitlistCandidates,
  type WaitlistPreference,
} from '@/lib/waitlist';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function lisbonParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map(x => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    min: Number(p.hour) * 60 + Number(p.minute),
  };
}

export interface WaitlistRow {
  id: string;
  appointmentId: string;
  doctorId: string | null;
  doctorName: string;
  preference: WaitlistPreference;
  note: string | null;
  patientName: string;
  phone: string | null;
  appointmentDay: string;
  appointmentStartMin: number;
  /** "20/11 às 15:30" */
  appointmentLabel: string;
}

/** Pedidos ativos da clínica cuja marcação ainda está por acontecer */
export async function loadActiveWaitlist(clinicId: string): Promise<WaitlistRow[]> {
  const entries = await Waitlist.find({
    clinicId,
    status: 'active',
    appointmentId: { $ne: null },
  })
    .sort({ createdAt: 1 })
    .limit(300)
    .lean();
  if (entries.length === 0) return [];
  const appts = await Appointment.find({
    _id: { $in: entries.map(e => String(e.appointmentId)) },
    status: { $in: ['pending', 'confirmed'] },
    startAt: { $gte: new Date() },
  })
    .select('startAt doctorId patientId')
    .lean();
  const apptById = new Map(appts.map(a => [String(a._id), a]));
  const [patients, doctors] = await Promise.all([
    Patient.find({ _id: { $in: appts.map(a => String(a.patientId)) } })
      .select('name processNumber phone')
      .lean(),
    Doctor.find({
      _id: {
        $in: appts
          .map(a => (a.doctorId ? String(a.doctorId) : null))
          .filter((x): x is string => !!x),
      },
    })
      .select('name')
      .lean(),
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const doctorById = new Map(doctors.map(d => [String(d._id), d.name]));

  const rows: WaitlistRow[] = [];
  for (const e of entries) {
    const a = apptById.get(String(e.appointmentId));
    if (!a) continue; // marcação já passou, foi cancelada ou concluída
    const p = patientById.get(String(a.patientId));
    const when = lisbonParts(a.startAt as Date);
    const [, m, d] = when.day.split('-');
    rows.push({
      id: String(e._id),
      appointmentId: String(a._id),
      doctorId: a.doctorId ? String(a.doctorId) : null,
      doctorName: a.doctorId
        ? (doctorById.get(String(a.doctorId)) ?? '—')
        : 'Sem médico',
      preference: (e.preference ?? 'any') as WaitlistPreference,
      note: e.note ?? null,
      patientName: p
        ? patientNameWithProcess(p.name, p.processNumber)
        : '(paciente removido)',
      phone: p?.phone ?? null,
      appointmentDay: when.day,
      appointmentStartMin: when.min,
      appointmentLabel: `${d}/${m} às ${when.time}`,
    });
  }
  return rows;
}

/** Pedidos a sugerir no dia aberto na agenda */
export function waitlistForDay(
  rows: WaitlistRow[],
  opts: { dayIso: string; todayIso: string; doctorIds: ReadonlySet<string> },
): WaitlistRow[] {
  // a própria marcação nesse dia e com esse médico não é sugestão para si
  return waitlistCandidates(rows, opts);
}
