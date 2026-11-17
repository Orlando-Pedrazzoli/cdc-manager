// 📄 src/app/admin/relatorios/ocupacao/page.tsx
// =============================================================================
// CDC Manager — Relatório: ocupação da agenda por médico (8.ª ronda/15)
// Só a gestão. As definições e as contas estão em src/lib/occupancy.ts.
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import {
  dateRange,
  lisbonToUtc,
  todayLisbon,
  workingRangesForDate,
} from '@/lib/availability';
import { clinicLabel } from '@/lib/branding';
import {
  doctorOccupancy,
  formatHours,
  type OccAppointment,
  type OccRange,
} from '@/lib/occupancy';
import Appointment from '@/models/Appointment';
import { getActiveClinics } from '@/models/Clinic';
import Doctor from '@/models/Doctor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ocupação por médico' };

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function lisbon(d: Date): { day: string; min: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '20px',
};
const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#6A7186',
  borderBottom: '1px solid #EEF1F8',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '13px',
  color: '#1C2233',
  borderBottom: '1px solid #F3F5FA',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};

function Bar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#8A93A8' }}>—</span>;
  const color = pct >= 70 ? '#1F9D55' : pct >= 40 ? '#D4A300' : '#D92D20';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 70,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#EEF1F8',
          overflow: 'hidden',
        }}
      >
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', backgroundColor: color }} />
      </span>
      <strong>{pct}%</strong>
    </span>
  );
}

export default async function OcupacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return null;
  const sp = await searchParams;

  const today = todayLisbon();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? (sp.mes as string) : today.slice(0, 7);
  const [y, m] = mes.split('-').map(Number);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const firstDay = `${mes}-01`;
  const lastOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  // Só dias que já aconteceram (hoje incluído): o futuro ainda está a encher
  const lastDay = lastOfMonth > today ? today : lastOfMonth;
  const isFuture = firstDay > today;
  const days = isFuture ? [] : dateRange(firstDay, lastDay);

  await dbConnect();
  const [clinics, doctors] = await Promise.all([
    getActiveClinics(),
    Doctor.find({ active: true }).sort({ name: 1 }),
  ]);
  const appts = isFuture
    ? []
    : await Appointment.find({
        doctorId: { $in: doctors.map(d => d._id) },
        startAt: {
          $gte: lisbonToUtc(firstDay, 0),
          $lt: lisbonToUtc(lastDay, 24 * 60),
        },
      })
        .select('doctorId clinicId startAt endAt status rescheduledToId startedAt completedAt')
        .lean();

  const apptsByKey = new Map<string, OccAppointment[]>();
  for (const a of appts) {
    const s = lisbon(a.startAt as Date);
    const e = lisbon(a.endAt as Date);
    const chair =
      a.startedAt && a.completedAt
        ? Math.round(((a.completedAt as Date).getTime() - (a.startedAt as Date).getTime()) / 60_000)
        : null;
    const key = `${String(a.clinicId)}|${String(a.doctorId)}`;
    const list = apptsByKey.get(key) ?? [];
    list.push({
      day: s.day,
      startMin: s.min,
      endMin: e.day === s.day ? e.min : 24 * 60,
      status: a.status,
      rescheduled: !!a.rescheduledToId,
      // tempos absurdos (consulta esquecida aberta) não contam como cadeira
      chairMin: chair != null && chair > 0 && chair <= 8 * 60 ? chair : null,
    });
    apptsByKey.set(key, list);
  }

  const sections = clinics.map(clinic => {
    const rows = doctors
      .map(doctor => {
        const rangesByDay: Record<string, OccRange[]> = {};
        for (const day of days) {
          const r = workingRangesForDate(doctor, clinic, day);
          if (r.length) rangesByDay[day] = r;
        }
        const list = apptsByKey.get(`${String(clinic._id)}|${String(doctor._id)}`) ?? [];
        if (Object.keys(rangesByDay).length === 0 && list.length === 0) return null;
        return { id: String(doctor._id), name: doctor.name, occ: doctorOccupancy(rangesByDay, list) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.occ.pct ?? -1) - (b.occ.pct ?? -1));
    return { clinic, rows };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1150 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <Link href='/admin/relatorios' style={{ fontSize: '13px', fontWeight: 600, color: '#6A7186', textDecoration: 'none' }}>
            ← Relatórios
          </Link>
          <h1 style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
            Ocupação da agenda por médico
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
          <Link href={`/admin/relatorios/ocupacao?mes=${shift(-1)}`} aria-label='Mês anterior' style={{ color: '#1B2A6B', display: 'inline-flex' }}>
            <ChevronLeft size={18} />
          </Link>
          {MONTHS[m - 1]} de {y}
          <Link href={`/admin/relatorios/ocupacao?mes=${shift(1)}`} aria-label='Mês seguinte' style={{ color: '#1B2A6B', display: 'inline-flex' }}>
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
        {isFuture
          ? 'Este mês ainda não começou.'
          : `Dias de ${firstDay.slice(8)}/${firstDay.slice(5, 7)} a ${lastDay.slice(8)}/${lastDay.slice(5, 7)}. `}
        Ocupação = horas com marcação sobre as horas do turno do médico. Tempo de
        cadeira = duração real das consultas concluídas (a marcada, quando o
        início e o fim não ficaram registados). Faltas e cancelamentos não
        contam as marcações remarcadas. Os médicos menos ocupados aparecem primeiro.
      </p>

      {sections.map(({ clinic, rows }) => (
        <section key={String(clinic._id)} style={card}>
          <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1C2233' }}>
            {clinicLabel(clinic)}
          </h2>
          {rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>Sem turnos nem marcações neste período.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>Médico</th>
                    <th style={{ ...th, textAlign: 'left' }}>Ocupação</th>
                    <th style={{ ...th, textAlign: 'left' }}>Por turno</th>
                    <th style={th}>Horas de turno</th>
                    <th style={th}>Horas marcadas</th>
                    <th style={th}>Tempo de cadeira</th>
                    <th style={th}>Marcações</th>
                    <th style={th}>Faltas</th>
                    <th style={th}>Cancel.</th>
                    <th style={th}>Perdidas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600, whiteSpace: 'normal' }}>{r.name}</td>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <Bar pct={r.occ.pct} />
                      </td>
                      <td style={{ ...td, textAlign: 'left', fontSize: '12px', color: '#3D4257' }}>
                        {r.occ.shifts.length === 0
                          ? 'fora da escala'
                          : r.occ.shifts.map(s => (
                              <div key={s.label}>
                                {s.label}: <strong>{s.pct ?? 0}%</strong>{' '}
                                <span style={{ color: '#8A93A8' }}>
                                  ({s.days} dia{s.days === 1 ? '' : 's'})
                                </span>
                              </div>
                            ))}
                      </td>
                      <td style={td}>{formatHours(r.occ.availableMin)}</td>
                      <td style={td}>{formatHours(r.occ.bookedMin)}</td>
                      <td style={td}>{formatHours(r.occ.chairMin)}</td>
                      <td style={td}>{r.occ.appointments}</td>
                      <td style={td}>{r.occ.noShows}</td>
                      <td style={td}>{r.occ.cancellations}</td>
                      <td style={td}>{r.occ.lostPct == null ? '—' : `${r.occ.lostPct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
