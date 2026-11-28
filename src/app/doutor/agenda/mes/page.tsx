// 📄 src/app/doutor/agenda/mes/page.tsx
// =============================================================================
// CDC Manager — Médico: a minha agenda, vista mensal
// -----------------------------------------------------------------------------
// Ponto 26 (Giulia, 27/11/2026): "Acrescentar uma vista mensal, com o mesmo
// esquema de cores do dashboard da receção."
// Server Component. Mês em ?mes=YYYY-MM (por omissão, o mês de hoje). Cada dia
// mostra as consultas do médico (nas duas clínicas) como pastilhas com a cor
// do estado — as cores e os rótulos são os de lib/agenda-colors.ts, os mesmos
// da agenda da receção. Carregar num dia abre a vista diária. Tudo filtrado
// pelo doctorId da sessão, como a vista diária.
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import {
  AGENDA_COLORS,
  AGENDA_LEGEND,
  agendaColor,
} from '@/lib/agenda-colors';
import {
  lisbonToUtc,
  todayLisbon,
  workingRangesForDate,
} from '@/lib/availability';
import {
  isMonthKey,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  shortPatientName,
} from '@/lib/month-grid';

export const dynamic = 'force-dynamic';

const MAX_CHIPS = 5;
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default async function DoctorAgendaMonthPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId) return null;

  const today = todayLisbon();
  const month = isMonthKey(mes) ? mes : monthOf(today);
  const weeks = monthGrid(month);
  const firstDate = weeks[0][0].date;
  const lastDate = weeks[weeks.length - 1][6].date;

  await dbConnect();
  const [appts, clinics, doctorDoc] = await Promise.all([
    Appointment.find({
      doctorId,
      startAt: {
        $gte: lisbonToUtc(firstDate, 0),
        $lt: lisbonToUtc(lastDate, 24 * 60),
      },
    })
      .select('startAt status closedAt patientId')
      .sort({ startAt: 1 })
      .lean(),
    getActiveClinics(),
    Doctor.findById(doctorId).select('clinicSchedules exceptions'),
  ]);
  const patients = await Patient.find({
    _id: { $in: [...new Set(appts.map(a => String(a.patientId)))] },
  })
    .select('name')
    .lean();
  const nameOf = new Map(patients.map(p => [String(p._id), p.name]));

  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
  });
  const byDay = new Map<
    string,
    { time: string; name: string; status: string; closed: boolean }[]
  >();
  for (const a of appts) {
    const k = dayFmt.format(a.startAt);
    const list = byDay.get(k) ?? [];
    list.push({
      time: timeFmt.format(a.startAt),
      name: shortPatientName(nameOf.get(String(a.patientId))),
      status: a.status as string,
      closed: !!a.closedAt,
    });
    byDay.set(k, list);
  }
  const worksOn = (d: string) =>
    !!doctorDoc &&
    clinics.some(c => workingRangesForDate(doctorDoc, c, d).length > 0);

  const monthTotal = appts.filter(
    a =>
      monthOf(dayFmt.format(a.startAt)) === month &&
      a.status !== 'cancelled' &&
      a.status !== 'no-show',
  ).length;

  const navBtn = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #D8DEEF',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1B2A6B',
    backgroundColor: '#FFFFFF',
    textDecoration: 'none',
  } as const;
  const isThisMonth = month === monthOf(today);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
            A minha agenda
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '14px',
              color: '#6A7186',
              textTransform: 'capitalize',
            }}
          >
            {monthLabel(month)}
            <span style={{ textTransform: 'none' }}>
              {' '}
              · {monthTotal} consulta{monthTotal === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Link href={`/doutor/agenda?data=${today}`} style={navBtn}>
            Vista diária
          </Link>
          <Link
            href={`/doutor/agenda/mes?mes=${shiftMonth(month, -1)}`}
            style={navBtn}
            aria-label='Mês anterior'
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href='/doutor/agenda/mes'
            style={{
              ...navBtn,
              backgroundColor: isThisMonth ? '#2743A6' : '#FFFFFF',
              color: isThisMonth ? '#FFFFFF' : '#1B2A6B',
            }}
          >
            Este mês
          </Link>
          <Link
            href={`/doutor/agenda/mes?mes=${shiftMonth(month, 1)}`}
            style={navBtn}
            aria-label='Mês seguinte'
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* Legenda: as mesmas cores e rótulos da agenda da receção */}
      <div style={{ display: 'flex', gap: '6px 12px', flexWrap: 'wrap' }}>
        {AGENDA_LEGEND.map(k => (
          <span
            key={k}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '12px',
              color: '#3D4257',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: AGENDA_COLORS[k].bg,
                border: `1.5px solid ${AGENDA_COLORS[k].border}`,
              }}
            />
            {AGENDA_COLORS[k].label}
          </span>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            minWidth: 760,
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEKDAYS.map(w => (
              <div
                key={w}
                style={{
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#6A7186',
                  backgroundColor: '#F4F6FB',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                {w}
              </div>
            ))}
            {weeks.flat().map(cell => {
              const list = byDay.get(cell.date) ?? [];
              const works = worksOn(cell.date);
              const isToday = cell.date === today;
              return (
                <Link
                  key={cell.date}
                  href={`/doutor/agenda?data=${cell.date}`}
                  aria-label={`${cell.date}: ${list.length} marcaç${list.length === 1 ? 'ão' : 'ões'}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minHeight: 112,
                    padding: '6px 7px 8px',
                    borderRight: '1px solid #EEF1F8',
                    borderBottom: '1px solid #EEF1F8',
                    backgroundColor: !cell.inMonth
                      ? '#FAFBFD'
                      : works
                        ? '#FFFFFF'
                        : '#F7F8FB',
                    opacity: cell.inMonth ? 1 : 0.55,
                    textDecoration: 'none',
                    outline: isToday ? '2px solid #2743A6' : 'none',
                    outlineOffset: -2,
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: isToday ? '#2743A6' : works ? '#1B2A6B' : '#9AA1B4',
                    }}
                  >
                    {cell.day}
                    {cell.inMonth && !works && list.length === 0 && (
                      <span style={{ fontSize: '10.5px', fontWeight: 500 }}>
                        sem horário
                      </span>
                    )}
                  </span>
                  {list.slice(0, MAX_CHIPS).map((a, i) => {
                    const c = agendaColor(a.status, a.closed);
                    return (
                      <span
                        key={i}
                        title={`${a.time} · ${a.name} · ${c.label}`}
                        style={{
                          display: 'block',
                          padding: '1px 5px',
                          borderRadius: 4,
                          backgroundColor: c.bg,
                          borderLeft: `3px solid ${c.border}`,
                          color: c.fg,
                          fontSize: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {a.time} {a.name}
                      </span>
                    );
                  })}
                  {list.length > MAX_CHIPS && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#6A7186' }}>
                      + {list.length - MAX_CHIPS} mais
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Carregue num dia para ver as consultas desse dia. Dias a cinzento: sem
        horário de trabalho.
      </p>
    </div>
  );
}
