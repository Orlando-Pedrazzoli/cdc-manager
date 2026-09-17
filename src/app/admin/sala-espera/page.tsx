// 📄 src/app/admin/sala-espera/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Gestão de sala de espera (Fase 2, P6)
// -----------------------------------------------------------------------------
// Paridade com o ecrã "Sala de Espera e Atendimentos" do Dentoral:
//   Ordem · Agenda · Deu entrada · Início consulta · Esperou · Fim · Tempo ·
//   Urgência · Médico · Paciente — e no rodapé "Tempo médio de espera" e
//   "Tempo médio das consultas".
// Fonte: timestamps que a máquina de estados já grava (checkedInAt,
// startedAt, completedAt). Por clínica e dia (?clinic=&date=); refresh
// automático a cada 30 s no dia de hoje.
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Siren } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import { defaultClinic } from '@/lib/branding';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { Badge } from '@/components/ui/Badge';
import AutoRefresh from '@/components/ui/AutoRefresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sala de espera' };

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
const hm = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Lisbon',
      }).format(d)
    : '—';
const dur = (ms: number | null) => {
  if (ms == null || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
};
const STATUS_LABEL: Record<string, string> = {
  'checked-in': 'A aguardar',
  'in-progress': 'Em consulta',
  completed: 'Concluída',
  'no-show': 'Falta',
};
const STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  'checked-in': 'warning',
  'in-progress': 'success',
  completed: 'neutral',
  'no-show': 'danger',
};

export default async function SalaEsperaPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '')
    ? (sp.date as string)
    : todayLisbon();
  const isToday = date === todayLisbon();

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === sp.clinic) ?? defaultClinic(clinics);
  if (!clinic) return null;

  const appts = await Appointment.find({
    clinicId: clinic._id,
    startAt: { $gte: lisbonToUtc(date, 0), $lt: lisbonToUtc(date, 24 * 60) },
    status: { $in: ['checked-in', 'in-progress', 'completed', 'no-show'] },
  })
    .select(
      'patientId doctorId treatmentTypeId startAt status isUrgent checkedInAt startedAt completedAt',
    )
    .lean();

  const [patients, doctors, treatments] = await Promise.all([
    Patient.find({ _id: { $in: appts.map(a => a.patientId) } })
      .select('name processNumber')
      .lean(),
    Doctor.find({}).select('name color').lean(),
    TreatmentType.find({ _id: { $in: appts.map(a => a.treatmentTypeId) } })
      .select('name')
      .lean(),
  ]);
  const pById = new Map(patients.map(p => [String(p._id), p]));
  const dById = new Map(doctors.map(d => [String(d._id), d]));
  const tById = new Map(treatments.map(t => [String(t._id), t.name]));

  const now = new Date().getTime();
  const rows = appts
    .map(a => {
      const checkedIn = a.checkedInAt
        ? new Date(a.checkedInAt).getTime()
        : null;
      const started = a.startedAt ? new Date(a.startedAt).getTime() : null;
      const completed = a.completedAt
        ? new Date(a.completedAt).getTime()
        : null;
      // Esperou: entrada → início (ou → agora, se ainda a aguardar)
      const waitMs =
        checkedIn != null
          ? started != null
            ? started - checkedIn
            : a.status === 'checked-in'
              ? now - checkedIn
              : null
          : null;
      const consultMs =
        started != null
          ? completed != null
            ? completed - started
            : a.status === 'in-progress'
              ? now - started
              : null
          : null;
      return {
        id: String(a._id),
        orderKey: checkedIn ?? new Date(a.startAt).getTime(),
        agenda: hm(a.startAt as Date),
        checkedIn: hm(a.checkedInAt as Date | null),
        started: hm(a.startedAt as Date | null),
        completed: hm(a.completedAt as Date | null),
        waitMs,
        consultMs,
        waitLive: a.status === 'checked-in',
        consultLive: a.status === 'in-progress',
        status: a.status,
        isUrgent: !!a.isUrgent,
        patient: pById.get(String(a.patientId)),
        doctor: a.doctorId ? dById.get(String(a.doctorId)) : null,
        treatment: tById.get(String(a.treatmentTypeId)) ?? '—',
      };
    })
    .sort((x, y) => x.orderKey - y.orderKey);

  const waits = rows
    .filter(r => r.waitMs != null && !r.waitLive)
    .map(r => r.waitMs as number);
  const consults = rows
    .filter(r => r.consultMs != null && !r.consultLive)
    .map(r => r.consultMs as number);
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const waitingNow = rows.filter(r => r.status === 'checked-in').length;
  const inConsult = rows.filter(r => r.status === 'in-progress').length;

  const dateLabel = (() => {
    const raw = new Intl.DateTimeFormat('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Lisbon',
    }).format(lisbonToUtc(date, 12 * 60));
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  })();

  const href = (over: { clinic?: string; date?: string }) =>
    `/admin/sala-espera?clinic=${over.clinic ?? clinic.slug}&date=${over.date ?? date}`;

  // --- estilos ---
  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    overflow: 'hidden',
  };
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  };
  const tdNum: React.CSSProperties = {
    ...td,
    fontVariantNumeric: 'tabular-nums',
  };
  const navBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid #D8DEEF',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1B2A6B',
    backgroundColor: '#FFFFFF',
    textDecoration: 'none',
  };
  const kpi = (label: string, value: string, color = '#1B2A6B') => (
    <div
      style={{
        ...card,
        padding: '12px 16px',
        minWidth: 150,
        flex: '1 1 150px',
      }}
    >
      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>{label}</p>
      <p
        style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color }}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {isToday && <AutoRefresh intervalMs={30_000} />}

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
            Sala de espera
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            {clinic.name} · {dateLabel}
            {isToday ? ' · atualiza a cada 30 s' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {clinics.map(c => (
            <Link
              key={String(c._id)}
              href={href({ clinic: c.slug })}
              style={{
                ...navBtn,
                ...(c.slug === clinic.slug
                  ? { backgroundColor: '#2743A6', color: '#FFFFFF' }
                  : {}),
              }}
            >
              {c.name}
            </Link>
          ))}
          <span style={{ width: 8 }} />
          <Link
            href={href({ date: shiftDate(date, -1) })}
            style={navBtn}
            aria-label='Dia anterior'
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href={href({ date: todayLisbon() })}
            style={{
              ...navBtn,
              backgroundColor: isToday ? '#2743A6' : '#FFFFFF',
              color: isToday ? '#FFFFFF' : '#1B2A6B',
            }}
          >
            Hoje
          </Link>
          <Link
            href={href({ date: shiftDate(date, 1) })}
            style={navBtn}
            aria-label='Dia seguinte'
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {kpi(
          'A aguardar agora',
          String(waitingNow),
          waitingNow > 0 ? '#B26A00' : '#1B2A6B',
        )}
        {kpi(
          'Em consulta',
          String(inConsult),
          inConsult > 0 ? '#0F7B4D' : '#1B2A6B',
        )}
        {kpi('Atendimentos do dia', String(rows.length))}
        {kpi('Tempo médio de espera', dur(avg(waits)))}
        {kpi('Tempo médio das consultas', dur(avg(consults)))}
      </div>

      <div style={card}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}
          >
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Agenda</th>
                <th style={th}>Deu entrada</th>
                <th style={th}>Início</th>
                <th style={th}>Esperou</th>
                <th style={th}>Fim</th>
                <th style={th}>Tempo</th>
                <th style={th}>Paciente</th>
                <th style={th}>Ato</th>
                <th style={th}>Médico</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td style={{ ...td, color: '#6A7186' }} colSpan={11}>
                    Sem atendimentos neste dia.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    backgroundColor:
                      r.status === 'checked-in'
                        ? '#FFF9EC'
                        : r.status === 'in-progress'
                          ? '#EDF9F2'
                          : 'transparent',
                  }}
                >
                  <td style={tdNum}>{i + 1}</td>
                  <td style={tdNum}>{r.agenda}</td>
                  <td style={tdNum}>{r.checkedIn}</td>
                  <td style={tdNum}>{r.started}</td>
                  <td
                    style={{
                      ...tdNum,
                      fontWeight: r.waitLive ? 700 : 400,
                      color:
                        r.waitMs != null && r.waitMs > 20 * 60_000
                          ? '#B3261E'
                          : '#1B2A6B',
                    }}
                  >
                    {dur(r.waitMs)}
                    {r.waitLive ? ' …' : ''}
                  </td>
                  <td style={tdNum}>{r.completed}</td>
                  <td
                    style={{ ...tdNum, fontWeight: r.consultLive ? 700 : 400 }}
                  >
                    {dur(r.consultMs)}
                    {r.consultLive ? ' …' : ''}
                  </td>
                  <td style={td}>
                    {r.isUrgent && (
                      <Siren
                        size={13}
                        style={{
                          color: '#B3261E',
                          marginRight: 5,
                          verticalAlign: -2,
                        }}
                      />
                    )}
                    <Link
                      href={`/admin/pacientes/${r.patient ? String(r.patient._id) : ''}`}
                      style={{
                        color: '#1B2A6B',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      {r.patient?.name ?? '(paciente removido)'}
                    </Link>
                    {r.patient && (
                      <span style={{ color: '#9AA1B4', fontSize: '11px' }}>
                        {' '}
                        · {r.patient.processNumber}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', maxWidth: 220 }}>
                    {r.treatment}
                  </td>
                  <td style={td}>
                    {r.doctor ? (
                      <>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor:
                              (r.doctor.color as string) ?? '#C7CEE0',
                            marginRight: 6,
                          }}
                        />
                        {r.doctor.name}
                      </>
                    ) : (
                      <span style={{ color: '#9AA1B4' }}>Sem médico</span>
                    )}
                  </td>
                  <td style={td}>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Esperou = da entrada (check-in) ao início da consulta; a vermelho acima
        de 20 min. As médias só contam atendimentos já iniciados/concluídos.
      </p>
    </div>
  );
}
