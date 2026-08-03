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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon, minToHhmm } from '@/lib/availability';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  'checked-in': 'Em espera',
  'in-progress': 'Em curso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  'no-show': 'Falta',
};
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#FFF4DE', fg: '#8A5A00' },
  confirmed: { bg: '#E4EBFF', fg: '#2743A6' },
  'checked-in': { bg: '#E0F5EA', fg: '#0F7B4D' },
  'in-progress': { bg: '#1B2A6B', fg: '#FFFFFF' },
  completed: { bg: '#EAECF3', fg: '#3D4257' },
  cancelled: { bg: '#F6E4E3', fg: '#B3261E' },
  'no-show': { bg: '#F6E4E3', fg: '#B3261E' },
};
const CLINIC_STYLE: Record<string, { bg: string; fg: string }> = {
  colombo: { bg: '#E4EBFF', fg: '#1B2A6B' },
  buraca: { bg: '#EFE6FA', fg: '#5B2E91' },
};

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

  const [appointments, clinics] = await Promise.all([
    Appointment.find({
      doctorId,
      startAt: { $gte: lisbonToUtc(date, 0), $lt: lisbonToUtc(date, 24 * 60) },
    })
      .sort({ startAt: 1 })
      .lean(),
    getActiveClinics(),
  ]);

  const clinicById = new Map(
    clinics.map(c => [String(c._id), { slug: c.slug, name: c.name }]),
  );
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
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
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
            Sem consultas neste dia.
          </p>
        ) : (
          appointments.map(a => {
            const muted = ['cancelled', 'no-show'].includes(a.status);
            const st =
              STATUS_STYLE[a.status as AppointmentStatus] ??
              STATUS_STYLE.completed;
            const clinic = clinicById.get(String(a.clinicId));
            const cl = CLINIC_STYLE[clinic?.slug ?? ''] ?? {
              bg: '#EAECF3',
              fg: '#3D4257',
            };
            const p = patientById.get(String(a.patientId));
            const rowStyle: React.CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 20px',
              borderBottom: '1px solid #F4F6FB',
              opacity: muted ? 0.55 : 1,
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
                    minWidth: '92px',
                  }}
                >
                  {minToHhmm(utcToLisbonMin(a.startAt))}–
                  {minToHhmm(utcToLisbonMin(a.endAt))}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1B2A6B',
                      textDecoration: muted ? 'line-through' : 'none',
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
                </div>
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
                  {clinic?.slug === 'colombo'
                    ? 'Colombo'
                    : clinic?.slug === 'buraca'
                      ? 'Buraca'
                      : (clinic?.name ?? '—')}
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
                  {STATUS_LABEL[a.status as AppointmentStatus] ?? a.status}
                </span>
              </>
            );
            return muted ? (
              <div key={String(a._id)} style={rowStyle}>
                {content}
              </div>
            ) : (
              <Link
                key={String(a._id)}
                href={`/doutor/consulta/${String(a._id)}`}
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
