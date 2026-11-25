// 📄 src/app/admin/relatorios/acessos/page.tsx
// =============================================================================
// CDC Manager — Gestão: acessos dos médicos às fichas (9.ª ronda, ponto 08)
// -----------------------------------------------------------------------------
// "O sistema guarda quem abriu cada ficha e quando. Um médico que consulte
// dezenas de fichas fora da agenda dele gera um alerta para a gestão."
// (Victor, 17 e 18/11.) Só a gestão. Últimos N dias (?dias=1|7|30), com
// filtro por médico (?medico=<id>) e só fora da agenda (?fora=1).
// Leitura apenas; o registo vem de lib/patient-access-data.ts.
// =============================================================================

import Link from 'next/link';
import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import AuditLog from '@/models/AuditLog';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import User from '@/models/User';
import { patientNameWithProcess } from '@/lib/domain';
import {
  ACCESS_ENTITY,
  ACCESS_OUTSIDE_AGENDA,
  PATIENT_ACCESS_ALERT_THRESHOLD,
} from '@/lib/patient-access';
import { loadOutsideAgendaAccess } from '@/lib/patient-access-data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acessos às fichas' };

const LIMIT = 500;
const DAY_OPTIONS = [1, 7, 30] as const;
const whenFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Lisbon',
});

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '18px 20px',
};
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#8A91A6',
  borderBottom: '1px solid #EEF1F8',
};
const td: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '13px',
  color: '#1C2233',
  borderBottom: '1px solid #F4F6FB',
};
const pill = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  textDecoration: 'none',
  border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
  backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
  color: active ? '#FFFFFF' : '#3A3F4A',
});

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; medico?: string; fora?: string }>;
}) {
  const session = await requireActiveSession(['admin'] as const);
  if (!session?.user?.id) return null;
  const sp = await searchParams;
  const days = (DAY_OPTIONS as readonly number[]).includes(Number(sp.dias))
    ? Number(sp.dias)
    : 7;
  const medico = /^[0-9a-fA-F]{24}$/.test(sp.medico ?? '') ? (sp.medico as string) : null;
  const onlyOutside = sp.fora === '1';
  const href = (o: { dias?: number; medico?: string | null; fora?: boolean }) => {
    const q = new URLSearchParams();
    q.set('dias', String(o.dias ?? days));
    const m = o.medico === undefined ? medico : o.medico;
    if (m) q.set('medico', m);
    if (o.fora ?? onlyOutside) q.set('fora', '1');
    return `/admin/relatorios/acessos?${q.toString()}`;
  };

  await dbConnect();
  const doctors = await Doctor.find({ active: true })
    .select('name')
    .sort({ name: 1 })
    .lean();
  // O registo guarda o utilizador; o filtro é por médico
  const doctorUsers = await User.find({ role: 'doctor', doctorId: { $ne: null } })
    .select('doctorId')
    .lean();
  const doctorByUser = new Map(
    doctorUsers.map(u => [String(u._id), String(u.doctorId)]),
  );
  const userIdsOfDoctor = medico
    ? doctorUsers.filter(u => String(u.doctorId) === medico).map(u => String(u._id))
    : null;

  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const [logs, today] = await Promise.all([
    AuditLog.find({
      action: 'view',
      entityType: ACCESS_ENTITY,
      createdAt: { $gte: since },
      ...(userIdsOfDoctor ? { userId: { $in: userIdsOfDoctor } } : {}),
      ...(onlyOutside ? { changedFields: ACCESS_OUTSIDE_AGENDA } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(LIMIT + 1)
      .select('userId patientId summary changedFields createdAt')
      .lean(),
    loadOutsideAgendaAccess(now),
  ]);
  const more = logs.length > LIMIT;
  const rows = logs.slice(0, LIMIT);
  const patients = await Patient.find({
    _id: { $in: rows.flatMap(l => (l.patientId ? [String(l.patientId)] : [])) },
  })
    .select('name processNumber')
    .lean();
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Acessos dos médicos às fichas
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Quem abriu cada ficha e quando. &quot;Fora da agenda&quot; quer dizer
          que o médico não tem consultas com esse paciente (a ficha abre só
          para leitura). A partir de {PATIENT_ACCESS_ALERT_THRESHOLD} fichas
          fora da agenda num dia, a gestão recebe um aviso.
        </p>
      </div>

      <section style={card}>
        <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#1C2233' }}>
          Hoje, fora da agenda
        </h2>
        {today.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
            Nenhum médico abriu hoje fichas de pacientes com quem não tem consultas.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...today]
              .sort((a, b) => b.patients - a.patients)
              .map(t => {
                const over = t.patients >= PATIENT_ACCESS_ALERT_THRESHOLD;
                return (
                  <li key={`${t.doctorId}-${t.doctorName}`} style={{ fontSize: '14px', color: over ? '#8A1C13' : '#1C2233', fontWeight: over ? 700 : 400 }}>
                    {t.doctorId ? (
                      <Link href={href({ medico: t.doctorId, fora: true, dias: 1 })} style={{ color: 'inherit' }}>
                        {t.doctorName}
                      </Link>
                    ) : (
                      t.doctorName
                    )}
                    : {t.patients} ficha{t.patients === 1 ? '' : 's'}
                    {over ? ' — acima do limite' : ''}
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {DAY_OPTIONS.map(d => (
            <Link key={d} href={href({ dias: d })} style={pill(d === days)}>
              {d === 1 ? 'Últimas 24 h' : `Últimos ${d} dias`}
            </Link>
          ))}
          <Link href={href({ fora: !onlyOutside })} style={pill(onlyOutside)}>
            Só fora da agenda
          </Link>
          {medico && (
            <Link href={href({ medico: null })} style={pill(true)}>
              {doctorName.get(medico) ?? 'Médico'} ✕
            </Link>
          )}
        </div>
        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
            Sem acessos registados neste período.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Quando</th>
                  <th style={th}>Médico</th>
                  <th style={th}>Paciente</th>
                  <th style={th}>Onde</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(l => {
                  const dId = l.userId ? doctorByUser.get(String(l.userId)) : null;
                  const p = l.patientId ? patientById.get(String(l.patientId)) : null;
                  const outside = (l.changedFields ?? []).includes(ACCESS_OUTSIDE_AGENDA);
                  return (
                    <tr key={String(l._id)}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{whenFmt.format(l.createdAt as Date)}</td>
                      <td style={td}>
                        {dId ? (
                          <Link href={href({ medico: dId })} style={{ color: '#1B2A6B', fontWeight: 600 }}>
                            {doctorName.get(dId) ?? 'Médico inativo'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={td}>
                        {p && l.patientId ? (
                          <Link href={`/admin/pacientes/${String(l.patientId)}`} style={{ color: '#1B2A6B' }}>
                            {patientNameWithProcess(p.name, p.processNumber)}
                          </Link>
                        ) : (
                          '(paciente removido)'
                        )}
                      </td>
                      <td style={td}>
                        {outside && (
                          <span style={{ marginRight: 6, padding: '1px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, backgroundColor: '#FFF4D6', color: '#6B5200' }}>
                            Fora da agenda
                          </span>
                        )}
                        {l.summary ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {more && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6A7186' }}>
                A mostrar os {LIMIT} acessos mais recentes. Escolha um médico ou
                um período mais curto para ver os restantes.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
