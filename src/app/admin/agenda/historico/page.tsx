// 📄 src/app/admin/agenda/historico/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Histórico de marcações apagadas/editadas
// (Fase 2, P7 — paridade com "Consulta de Marcações Apagadas" do Dentoral)
// -----------------------------------------------------------------------------
// Never-delete: as marcações canceladas continuam na base; aqui listam-se
// as CANCELADAS e as REMARCADAS (cancelada + nova ligada) com:
//   Marcação (paciente, hora, ato, médico) · Marcada por/em · Apagada em ·
//   Apagada por · Motivo · Remarcada para (link para a agenda desse dia)
// Filtros: clínica, intervalo de datas (por data de cancelamento), tipo.
// =============================================================================

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import { defaultClinic } from '@/lib/branding';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import TreatmentType from '@/models/TreatmentType';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { Badge } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Histórico de marcações' };

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
const stamp = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Lisbon',
      })
        .format(d)
        .replace(',', '')
    : '—';
const lisbonDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

export default async function HistoricoMarcacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    clinic?: string;
    from?: string;
    to?: string;
    tipo?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const today = todayLisbon();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '')
    ? (sp.to as string)
    : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '')
    ? (sp.from as string)
    : shiftDate(to, -30);
  const tipo =
    sp.tipo === 'canceladas' || sp.tipo === 'remarcadas' ? sp.tipo : 'todas';

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === sp.clinic) ?? defaultClinic(clinics);
  if (!clinic) return null;

  const query: Record<string, unknown> = {
    clinicId: clinic._id,
    status: 'cancelled',
    cancelledAt: {
      $gte: lisbonToUtc(from, 0),
      $lt: lisbonToUtc(shiftDate(to, 1), 0),
    },
  };
  if (tipo === 'remarcadas') query.rescheduledToId = { $ne: null };
  if (tipo === 'canceladas') query.rescheduledToId = null;

  const appts = await Appointment.find(query)
    .select(
      'patientId doctorId treatmentTypeId startAt endAt channel createdByUserId createdAt cancelledAt cancelledBy cancelledByUserId cancelReason rescheduledToId note isUrgent',
    )
    .sort({ cancelledAt: -1 })
    .limit(500)
    .lean();

  const targetIds = appts
    .map(a => a.rescheduledToId)
    .filter((id): id is NonNullable<typeof id> => !!id)
    .map(String);
  const userIds = Array.from(
    new Set(
      appts
        .flatMap(a => [a.createdByUserId, a.cancelledByUserId])
        .filter(Boolean)
        .map(String),
    ),
  );
  const [patients, doctors, users, treatments, targets] = await Promise.all([
    Patient.find({ _id: { $in: appts.map(a => a.patientId) } })
      .select('name processNumber')
      .lean(),
    Doctor.find({}).select('name color').lean(),
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select('name')
          .lean()
      : Promise.resolve([]),
    TreatmentType.find({ _id: { $in: appts.map(a => a.treatmentTypeId) } })
      .select('name')
      .lean(),
    targetIds.length
      ? Appointment.find({ _id: { $in: targetIds } })
          .select('startAt doctorId clinicId')
          .lean()
      : Promise.resolve([]),
  ]);
  const pById = new Map(patients.map(p => [String(p._id), p]));
  const dById = new Map(doctors.map(d => [String(d._id), d]));
  const uById = new Map(users.map(u => [String(u._id), u.name]));
  const tById = new Map(treatments.map(t => [String(t._id), t.name]));
  const targetById = new Map(targets.map(t => [String(t._id), t]));
  const clinicSlugById = new Map(clinics.map(c => [String(c._id), c.slug]));

  const CHANNEL: Record<string, string> = {
    website: 'Site',
    whatsapp: 'WhatsApp',
    phone: 'Telefone',
    'front-desk': 'Balcão',
    doctor: 'Médico',
    system: 'Sistema',
  };

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      clinic: clinic.slug,
      from,
      to,
      tipo,
      ...over,
    });
    return `/admin/agenda/historico?${p.toString()}`;
  };

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
    verticalAlign: 'top',
  };
  const navBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid #D8DEEF',
    borderRadius: '10px',
    padding: '7px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1B2A6B',
    backgroundColor: '#FFFFFF',
    textDecoration: 'none',
  };
  const active: React.CSSProperties = {
    backgroundColor: '#2743A6',
    color: '#FFFFFF',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <Link
          href={`/admin/agenda?clinic=${clinic.slug}`}
          style={{ fontSize: '13px', color: '#6A7186', textDecoration: 'none' }}
        >
          ← Agenda
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginTop: 6,
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
              Marcações apagadas e remarcadas
            </h1>
            <p
              style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}
            >
              {clinic.name} · canceladas entre{' '}
              {from.split('-').reverse().join('/')} e{' '}
              {to.split('-').reverse().join('/')} · {appts.length} registo
              {appts.length === 1 ? '' : 's'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {clinics.map(c => (
              <Link
                key={String(c._id)}
                href={href({ clinic: c.slug })}
                style={{ ...navBtn, ...(c.slug === clinic.slug ? active : {}) }}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <form
        method='get'
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <input type='hidden' name='clinic' value={clinic.slug} />
        <label style={{ fontSize: '12px', color: '#6A7186' }}>
          De
          <br />
          <input type='date' name='from' defaultValue={from} style={navBtn} />
        </label>
        <label style={{ fontSize: '12px', color: '#6A7186' }}>
          Até
          <br />
          <input type='date' name='to' defaultValue={to} style={navBtn} />
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['todas', 'canceladas', 'remarcadas'] as const).map(t => (
            <Link
              key={t}
              href={href({ tipo: t })}
              style={{ ...navBtn, ...(tipo === t ? active : {}) }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Link>
          ))}
        </div>
        <input type='hidden' name='tipo' value={tipo} />
        <button type='submit' style={{ ...navBtn, cursor: 'pointer' }}>
          Aplicar datas
        </button>
      </form>

      <div style={card}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 1100,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Marcação</th>
                <th style={th}>Paciente</th>
                <th style={th}>Médico</th>
                <th style={th}>Marcada por</th>
                <th style={th}>Apagada em</th>
                <th style={th}>Apagada por</th>
                <th style={th}>Motivo</th>
                <th style={th}>Remarcada para</th>
              </tr>
            </thead>
            <tbody>
              {appts.length === 0 && (
                <tr>
                  <td style={{ ...td, color: '#6A7186' }} colSpan={8}>
                    Sem marcações canceladas ou remarcadas neste intervalo.
                  </td>
                </tr>
              )}
              {appts.map(a => {
                const p = pById.get(String(a.patientId));
                const d = a.doctorId ? dById.get(String(a.doctorId)) : null;
                const target = a.rescheduledToId
                  ? targetById.get(String(a.rescheduledToId))
                  : null;
                const isResched = !!a.rescheduledToId;
                return (
                  <tr key={String(a._id)}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>
                        {stamp(a.startAt as Date)}
                        {a.isUrgent && (
                          <Badge variant='danger'>
                            <span style={{ marginLeft: 0 }}>URG</span>
                          </Badge>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6A7186' }}>
                        {tById.get(String(a.treatmentTypeId)) ?? '—'}
                      </div>
                    </td>
                    <td style={td}>
                      <Link
                        href={`/admin/pacientes/${String(a.patientId)}`}
                        style={{
                          color: '#1B2A6B',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        {p?.name ?? '(paciente removido)'}
                      </Link>
                      {p && (
                        <span style={{ color: '#9AA1B4', fontSize: '11px' }}>
                          {' '}
                          · {p.processNumber}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {d?.name ?? (
                        <span style={{ color: '#9AA1B4' }}>Sem médico</span>
                      )}
                    </td>
                    <td style={td}>
                      {a.createdByUserId
                        ? (uById.get(String(a.createdByUserId)) ?? '—')
                        : (CHANNEL[a.channel] ?? a.channel)}
                      <div style={{ fontSize: '11px', color: '#9AA1B4' }}>
                        {stamp(a.createdAt as Date)}
                      </div>
                    </td>
                    <td style={td}>{stamp(a.cancelledAt as Date | null)}</td>
                    <td style={td}>
                      {a.cancelledByUserId
                        ? (uById.get(String(a.cancelledByUserId)) ?? '—')
                        : a.cancelledBy === 'patient'
                          ? 'Paciente'
                          : a.cancelledBy === 'system'
                            ? 'Sistema'
                            : '—'}
                    </td>
                    <td style={{ ...td, maxWidth: 260, whiteSpace: 'normal' }}>
                      {isResched ? (
                        <Badge variant='info'>Remarcada</Badge>
                      ) : (
                        <Badge variant='danger'>Cancelada</Badge>
                      )}
                      {a.cancelReason && a.cancelReason !== 'Remarcada' && (
                        <div style={{ marginTop: 4 }}>{a.cancelReason}</div>
                      )}
                    </td>
                    <td style={td}>
                      {target ? (
                        <Link
                          href={`/admin/agenda?clinic=${clinicSlugById.get(String(target.clinicId)) ?? clinic.slug}&date=${lisbonDate(target.startAt as Date)}`}
                          style={{
                            color: '#2743A6',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          {stamp(target.startAt as Date)} →
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
