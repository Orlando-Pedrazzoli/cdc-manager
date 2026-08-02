// 📄 src/app/admin/agenda/page.tsx
// =============================================================================
// CDC Manager — Admin: Agenda diária
// -----------------------------------------------------------------------------
// Server Component: /admin/agenda?clinic=colombo|buraca&date=YYYY-MM-DD
// Carrega os médicos que trabalham NESSA clínica NESSE dia (horário efetivo
// já com exceções), as marcações do dia com nomes populados, e entrega tudo
// à AgendaGrid. O seletor de clínica são dois links — a mudança Colombo↔
// Buraca é um clique, e o URL fica partilhável ("vê a agenda da Buraca de
// amanhã": basta enviar o link).
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarPlus } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import TreatmentType from '@/models/TreatmentType';
import Patient from '@/models/Patient';
import {
  workingRangesForDate,
  lisbonToUtc,
  todayLisbon,
  weekdayOf,
  hhmmToMin,
} from '@/lib/availability';
import {
  AgendaGrid,
  type AgendaAppointment,
  type AgendaDoctorColumn,
} from '@/components/agenda/AgendaGrid';
import { AgendaToolbar } from '@/components/agenda/AgendaToolbar';

export const dynamic = 'force-dynamic';

/** Instante UTC → minutos do dia na parede de Lisboa */
function utcToLisbonMin(d: Date): { date: string; min: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    min: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '')
    ? (sp.date as string)
    : todayLisbon();

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === sp.clinic) ??
    clinics.find(c => c.slug === 'colombo') ??
    clinics[0];
  if (!clinic) {
    return <p>Nenhuma clínica configurada — correr o seed.</p>;
  }
  const clinicId = String(clinic._id);

  // Grelha: abertura ao fecho da clínica neste dia da semana
  const weekday = weekdayOf(date);
  const openRanges =
    clinic.openingHours.find(o => o.weekday === weekday)?.ranges ?? [];
  const gridStart = openRanges.length
    ? Math.min(...openRanges.map(r => hhmmToMin(r.start)))
    : 9 * 60;
  const gridEnd = openRanges.length
    ? Math.max(...openRanges.map(r => hhmmToMin(r.end)))
    : 20 * 60;

  // Médicos com horário efetivo nesta clínica neste dia
  const allDoctors = await Doctor.find({
    active: true,
    'clinicSchedules.clinicId': clinic._id,
  });
  const doctorColumns: AgendaDoctorColumn[] = allDoctors
    .map(d => ({
      id: String(d._id),
      name: d.name,
      color: d.color ?? '#2743A6',
      ranges: workingRangesForDate(d, clinic, date),
    }))
    .filter(d => d.ranges.length > 0);

  // Marcações do dia nesta clínica
  const dayStart = lisbonToUtc(date, 0);
  const dayEnd = lisbonToUtc(date, 24 * 60);
  const appts = await Appointment.find({
    clinicId: clinic._id,
    startAt: { $lt: dayEnd },
    endAt: { $gt: dayStart },
  })
    .select('doctorId patientId treatmentTypeId startAt endAt status')
    .lean();

  const [patients, treatments] = await Promise.all([
    Patient.find({ _id: { $in: appts.map(a => a.patientId) } })
      .select('name processNumber')
      .lean(),
    TreatmentType.find().select('name').sort({ name: 1 }).lean(),
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const treatmentById = new Map(treatments.map(t => [String(t._id), t.name]));

  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const gridAppointments: AgendaAppointment[] = appts.map(a => {
    const s = utcToLisbonMin(a.startAt);
    const e = utcToLisbonMin(a.endAt);
    const p = patientById.get(String(a.patientId));
    return {
      id: String(a._id),
      doctorId: a.doctorId ? String(a.doctorId) : null,
      startMin: s.min,
      endMin: e.date === s.date ? e.min : 24 * 60,
      start: hhmm(s.min),
      end: hhmm(e.date === s.date ? e.min : 24 * 60),
      patientLabel: p ? `${p.name}` : '(paciente removido)',
      treatmentName: treatmentById.get(String(a.treatmentTypeId)) ?? '—',
      status: a.status,
    };
  });

  const dateLabel = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Lisbon',
  }).format(lisbonToUtc(date, 12 * 60));

  const href = (c: string, d: string) => `/admin/agenda?clinic=${c}&date=${d}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho + navegação */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Agenda
          </h1>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '13px',
              color: '#6A7186',
              textTransform: 'capitalize',
            }}
          >
            {dateLabel}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {/* Seletor de clínica */}
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #D8DEEF',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            {clinics.map(c => {
              const active = String(c._id) === clinicId;
              return (
                <Link
                  key={c.slug}
                  href={href(c.slug, date)}
                  style={{
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    color: active ? '#FFFFFF' : '#1B2A6B',
                    backgroundColor: active ? '#2743A6' : '#FFFFFF',
                  }}
                >
                  {c.slug === 'colombo' ? 'Colombo' : 'Buraca'}
                </Link>
              );
            })}
          </div>

          {/* Navegação de datas */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Link
              href={href(clinic.slug, shiftDate(date, -1))}
              aria-label='Dia anterior'
              style={navBtnStyle}
            >
              <ChevronLeft size={16} />
            </Link>
            <Link href={href(clinic.slug, todayLisbon())} style={todayBtnStyle}>
              Hoje
            </Link>
            <Link
              href={href(clinic.slug, shiftDate(date, 1))}
              aria-label='Dia seguinte'
              style={navBtnStyle}
            >
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* Nova marcação (client toolbar abre o modal) */}
          <AgendaToolbar
            clinicId={clinicId}
            date={date}
            doctors={doctorColumns.map(d => ({ id: d.id, name: d.name }))}
            treatments={treatments.map(t => ({
              id: String(t._id),
              name: t.name,
            }))}
            buttonLabel={
              <>
                <CalendarPlus size={16} style={{ marginRight: 6 }} />
                Nova marcação
              </>
            }
          />
        </div>
      </div>

      <AgendaGrid
        gridStart={gridStart}
        gridEnd={gridEnd}
        doctors={doctorColumns}
        appointments={gridAppointments}
      />
    </div>
  );
}

const navBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
  textDecoration: 'none',
} as const;

const todayBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 12px',
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
  textDecoration: 'none',
} as const;
