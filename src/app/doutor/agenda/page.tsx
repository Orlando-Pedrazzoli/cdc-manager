// 📄 src/app/doutor/agenda/page.tsx
// =============================================================================
// CDC Manager — Médico: A minha agenda
// -----------------------------------------------------------------------------
// Server Component. O complemento do dashboard: enquanto "O meu dia" mostra
// HOJE, aqui o médico navega por qualquer data (?data=YYYY-MM-DD, ‹ Hoje ›)
// e vê as suas consultas NAS DUAS clínicas em lista cronológica — com
// badge de clínica, ato e estado, cartões clicáveis para o fluxo da
// consulta. Tudo filtrado pelo doctorId da sessão (RBAC de dados).
// =============================================================================

import Link from 'next/link';
import { ConsultProgress } from '@/components/agenda/ConsultProgress';
import { consultWindow, lateStartMinutes } from '@/lib/consult-window';
import AutoRefresh from '@/components/ui/AutoRefresh';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { clinicBadgeMap } from '@/lib/branding';
import { agendaColor } from '@/lib/agenda-colors';
import {
  lisbonToUtc,
  todayLisbon,
  minToHhmm,
  workingRangesForDate,
} from '@/lib/availability';
import Doctor from '@/models/Doctor';
import { daysFrom, mondayOf, rangesLabel } from '@/lib/doctor-work-days';

export const dynamic = 'force-dynamic';


function utcToLisbonMin(d: Date): number {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

/** date "YYYY-MM-DD" ± dias (aritmética em UTC ao meio-dia — imune a DST) */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function DoctorAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data } = await searchParams;
  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId) return null;

  const today = todayLisbon();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data ?? '')
    ? (data as string)
    : today;
  const isToday = date === today;

  await dbConnect();

  // 9.ª ronda/05: duas semanas (Seg–Dom) a partir da semana do dia escolhido,
  // com os dias de trabalho do médico — mesmo sem marcações
  const stripDays = daysFrom(mondayOf(date), 14);
  const stripStart = lisbonToUtc(stripDays[0], 0);
  const stripEnd = lisbonToUtc(stripDays[stripDays.length - 1], 24 * 60);

  const [appointments, clinics, doctorDoc, stripAppts] = await Promise.all([
    Appointment.find({
      doctorId,
      startAt: { $gte: lisbonToUtc(date, 0), $lt: lisbonToUtc(date, 24 * 60) },
    })
      .sort({ startAt: 1 })
      .lean(),
    getActiveClinics(),
    Doctor.findById(doctorId).select('clinicSchedules exceptions'),
    Appointment.find({
      doctorId,
      status: { $nin: ['cancelled', 'no-show'] },
      startAt: { $gte: stripStart, $lt: stripEnd },
    })
      .select('startAt')
      .lean(),
  ]);

  const lisbonDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const countByDay = new Map<string, number>();
  for (const a of stripAppts) {
    const k = lisbonDay.format(a.startAt);
    countByDay.set(k, (countByDay.get(k) ?? 0) + 1);
  }
  const workOf = (d: string) =>
    doctorDoc
      ? clinics
          .map(c => ({
            clinic: c.name,
            slug: c.slug,
            ranges: workingRangesForDate(doctorDoc, c, d),
          }))
          .filter(w => w.ranges.length > 0)
      : [];
  const strip = stripDays.map(d => {
    const work = workOf(d);
    return {
      date: d,
      work,
      count: countByDay.get(d) ?? 0,
      weekday: new Intl.DateTimeFormat('pt-PT', {
        weekday: 'short',
        timeZone: 'UTC',
      })
        .format(new Date(`${d}T12:00:00Z`))
        .replace('.', ''),
      dayNum: Number(d.slice(8, 10)),
    };
  });
  const workToday = workOf(date);
  const workTodayLabel = workToday
    .map(w => `${w.clinic} ${rangesLabel(w.ranges)}`)
    .join(' · ');

  const clinicById = new Map(
    clinics.map(c => [String(c._id), { slug: c.slug, name: c.name }]),
  );
  const badgeBySlug = clinicBadgeMap(clinics);
  const [patients, treatments] = await Promise.all([
    Patient.find({
      _id: { $in: [...new Set(appointments.map(a => String(a.patientId)))] },
    })
      .select('name processNumber')
      .lean(),
    TreatmentType.find({
      _id: {
        $in: [...new Set(appointments.map(a => String(a.treatmentTypeId)))],
      },
    })
      .select('name')
      .lean(),
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const treatmentById = new Map(treatments.map(t => [String(t._id), t.name]));

  const rawDate = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(lisbonToUtc(date, 12 * 60));
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  const navBtn: React.CSSProperties = {
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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 9.ª ronda/10: o estado ("Chegou") atualiza sozinho, como em "O meu dia" */}
      {isToday && <AutoRefresh intervalMs={20_000} />}
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
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            {dateLabel}
            {isToday ? ' · hoje' : ''}
          </p>
          {/* 9.ª ronda/05: o horário de trabalho do dia, com ou sem marcações */}
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '13px',
              fontWeight: 600,
              color: workToday.length > 0 ? '#0F7B4D' : '#8A91A6',
            }}
          >
            {workToday.length > 0
              ? `Dia de trabalho: ${workTodayLabel}`
              : 'Sem horário de trabalho neste dia'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {/* Ponto 26 (Giulia, 27/11): vista mensal */}
          <Link href={`/doutor/agenda/mes?mes=${date.slice(0, 7)}`} style={navBtn}>
            Vista mensal
          </Link>
          <Link
            href={`/doutor/agenda?data=${shiftDate(date, -1)}`}
            style={navBtn}
            aria-label='Dia anterior'
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href='/doutor/agenda'
            style={{
              ...navBtn,
              backgroundColor: isToday ? '#2743A6' : '#FFFFFF',
              color: isToday ? '#FFFFFF' : '#1B2A6B',
            }}
          >
            Hoje
          </Link>
          <Link
            href={`/doutor/agenda?data=${shiftDate(date, 1)}`}
            style={navBtn}
            aria-label='Dia seguinte'
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* 9.ª ronda/05: os meus dias de trabalho nas próximas duas semanas */}
      <nav
        aria-label='Os meus dias de trabalho'
        className='cdc-workdays'
      >
        {strip.map(d => {
          const selected = d.date === date;
          const working = d.work.length > 0;
          return (
            <Link
              key={d.date}
              href={`/doutor/agenda?data=${d.date}`}
              aria-current={selected ? 'date' : undefined}
              title={
                working
                  ? d.work
                      .map(w => `${w.clinic} ${rangesLabel(w.ranges)}`)
                      .join(' · ')
                  : 'Sem horário de trabalho'
              }
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '8px 10px',
                borderRadius: '10px',
                border: selected
                  ? '2px solid #2743A6'
                  : d.date === today
                    ? '2px solid #B9C3E0'
                    : '1px solid #EEF1F8',
                backgroundColor: working ? '#F1F8F4' : '#F7F8FB',
                color: working ? '#1B2A6B' : '#9AA1B4',
                textDecoration: 'none',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {d.weekday} {d.dayNum}
              </span>
              {working ? (
                d.work.map(w => (
                  <span
                    key={w.slug}
                    style={{
                      fontSize: '11px',
                      lineHeight: 1.3,
                      color: '#3D4257',
                    }}
                  >
                    <strong>{w.clinic}</strong> {rangesLabel(w.ranges)}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '11px' }}>Folga</span>
              )}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: d.count > 0 ? '#2743A6' : '#9AA1B4',
                }}
              >
                {d.count === 0
                  ? 'Sem marcações'
                  : d.count === 1
                    ? '1 marcação'
                    : `${d.count} marcações`}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        {appointments.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '28px 20px',
              fontSize: '14px',
              color: '#6A7186',
            }}
          >
            {workToday.length > 0
              ? `Ainda sem consultas marcadas. Horário de trabalho: ${workTodayLabel}.`
              : 'Sem consultas neste dia.'}
          </p>
        ) : (
          appointments.map(a => {
            // Canceladas (Victor, 12/11/2026): em destaque e com o motivo, para
            // o médico ver de relance quem cancelou e porquê
            const isCancelled = a.status === 'cancelled';
            const muted = a.status === 'no-show';
            // 7.ª ronda/A2: mesmas cores por estado da agenda da receção
            const sc = agendaColor(a.status, !!a.closedAt);
            const st = { bg: sc.bg, fg: sc.fg };
            const clinic = clinicById.get(String(a.clinicId));
            const cl = badgeBySlug[clinic?.slug ?? ''] ?? {
              bg: '#EAECF3',
              fg: '#3D4257',
              label: clinic?.name ?? '—',
            };
            const p = patientById.get(String(a.patientId));
            const rowStyle: React.CSSProperties = {
              padding: '12px 20px',
              borderBottom: '1px solid #F4F6FB',
              opacity: muted ? 0.55 : 1,
              backgroundColor: isCancelled ? '#FDECEA' : undefined,
              borderLeft: `4px solid ${sc.border}`,
              textDecoration: 'none',
            };
            const content = (
              <>
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                    width: 92,
                    flexShrink: 0,
                  }}
                >
                  {minToHhmm(utcToLisbonMin(a.startAt))}–
                  {minToHhmm(utcToLisbonMin(a.endAt))}
                </span>
                <div className='cdc-line-main'>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1B2A6B',
                      textDecoration: muted || isCancelled ? 'line-through' : 'none',
                    }}
                  >
                    {p?.name ?? '(paciente removido)'}
                    {p?.processNumber != null && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#6A7186',
                        }}
                      >
                        Proc. {String(p.processNumber)}
                      </span>
                    )}
                  </p>
                  {a.status === 'in-progress' && (
                    <ConsultProgress
                      {...consultWindow(
                        a.startAt.getTime(),
                        a.endAt.getTime(),
                        a.startedAt ? new Date(a.startedAt).getTime() : null,
                      )}
                      lateStartMin={lateStartMinutes(
                        a.startAt.getTime(),
                        a.startedAt ? new Date(a.startedAt).getTime() : null,
                      )}
                      variant='row'
                    />
                  )}
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '13px',
                      color: '#6A7186',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {treatmentById.get(String(a.treatmentTypeId)) ?? '—'}
                    {a.note ? ` · ${a.note}` : ''}
                  </p>
                  {isCancelled && (
                    <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: '#8A4B00' }}>
                      {a.rescheduledToId
                        ? 'Remarcada'
                        : a.cancelledBy === 'patient'
                          ? 'Paciente cancelou'
                          : 'Cancelada pela clínica'}
                      {a.cancelReason ? ` — ${a.cancelReason}` : ''}
                    </p>
                  )}
                </div>
                <div className='cdc-line-meta'>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: cl.bg,
                      color: cl.fg,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cl.label}
                  </span>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: st.bg,
                      color: st.fg,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {/* "Por fechar" é assunto da receção; para o médico está concluída */}
                    {a.status === 'completed' ? 'Concluída' : sc.label}
                  </span>
                </div>
              </>
            );
            return muted || isCancelled ? (
              <div key={String(a._id)} className='cdc-line' style={rowStyle}>
                {content}
              </div>
            ) : (
              <Link
                key={String(a._id)}
                href={`/doutor/consulta/${String(a._id)}`}
                className='cdc-line'
                style={rowStyle}
              >
                {content}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
