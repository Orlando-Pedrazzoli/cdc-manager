// 📄 src/app/admin/relatorios/atrasos/page.tsx
// =============================================================================
// CDC Manager — Gestão: atrasos das consultas (respostas de 25/11, A3)
// -----------------------------------------------------------------------------
// "[A barra] termina no horário previsto do agendamento. A partir daí começa
// a contar tempo de atraso. Assim consigo medir quanto tempo de atraso o
// médico teve. A leitura deve permitir filtrar por dia/semana/mês e detalhar
// por paciente ou tratamento." (Victor, 25/11/2026)
//
// Só a gestão. ?periodo=dia|semana|mes · ?dia=AAAA-MM-DD (qualquer dia do
// período) · ?medico=<id> · ?ver=tratamento|paciente (resumo de baixo).
// Leitura apenas: usa as horas que o sistema já regista em cada consulta
// (início real e conclusão). Contas em lib/consult-delays.ts.
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import { patientNameWithProcess } from '@/lib/domain';
import {
  consultDelay,
  delayPeriodRange,
  minutesLabel,
  shiftDelayPeriod,
  summarizeDelays,
  type ConsultDelay,
  type DelayPeriod,
} from '@/lib/consult-delays';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atrasos das consultas' };

const QUERY_LIMIT = 3000;
const DETAIL_LIMIT = 200;
const PERIODS: { key: DelayPeriod; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
];
const dayFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const whenFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Lisbon',
});
const hhmm = new Intl.DateTimeFormat('pt-PT', {
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
const h2: React.CSSProperties = { margin: 0, fontSize: '15px', fontWeight: 700, color: '#1B2A6B' };
const lead: React.CSSProperties = { margin: '4px 0 12px', fontSize: '13px', color: '#6A7186' };
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
const num: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
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
const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

export default async function AtrasosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; dia?: string; medico?: string; ver?: string }>;
}) {
  const session = await requireActiveSession(['admin'] as const);
  if (!session?.user?.id) return null;
  const sp = await searchParams;

  const period: DelayPeriod =
    sp.periodo === 'dia' || sp.periodo === 'mes' ? sp.periodo : 'semana';
  const today = todayLisbon();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? '') ? (sp.dia as string) : today;
  const medico = /^[0-9a-fA-F]{24}$/.test(sp.medico ?? '') ? (sp.medico as string) : null;
  const groupBy: 'tratamento' | 'paciente' = sp.ver === 'paciente' ? 'paciente' : 'tratamento';
  const href = (o: {
    periodo?: DelayPeriod;
    dia?: string;
    medico?: string | null;
    ver?: 'tratamento' | 'paciente';
  }) => {
    const q = new URLSearchParams();
    q.set('periodo', o.periodo ?? period);
    q.set('dia', o.dia ?? day);
    const m = o.medico === undefined ? medico : o.medico;
    if (m) q.set('medico', m);
    if ((o.ver ?? groupBy) === 'paciente') q.set('ver', 'paciente');
    return `/admin/relatorios/atrasos?${q.toString()}`;
  };

  const range = delayPeriodRange(day, period);
  const from = lisbonToUtc(range.from, 0);
  const to = lisbonToUtc(range.to, 0);
  const lastDay = new Date(new Date(`${range.to}T00:00:00Z`).getTime() - 86_400_000);
  const rangeLabel =
    period === 'dia'
      ? dayFmt.format(new Date(`${range.from}T00:00:00Z`))
      : `${dayFmt.format(new Date(`${range.from}T00:00:00Z`))} a ${dayFmt.format(lastDay)}`;

  await dbConnect();
  const [doctors, appts] = await Promise.all([
    Doctor.find({}).select('name active').sort({ name: 1 }).lean(),
    Appointment.find({
      status: 'completed',
      startAt: { $gte: from, $lt: to },
      startedAt: { $ne: null },
      completedAt: { $ne: null },
      ...(medico ? { doctorId: medico } : {}),
    })
      .select(
        'patientId doctorId treatmentTypeId startAt endAt startedAt completedAt checkedInAt isUrgent',
      )
      .sort({ startAt: 1 })
      .limit(QUERY_LIMIT + 1)
      .lean(),
  ]);
  const truncated = appts.length > QUERY_LIMIT;
  const list = truncated ? appts.slice(0, QUERY_LIMIT) : appts;
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));

  const rows = list.flatMap(a => {
    const delay = consultDelay({
      startMs: a.startAt.getTime(),
      endMs: a.endAt.getTime(),
      startedMs: ms(a.startedAt),
      completedMs: ms(a.completedAt),
      checkedInMs: ms(a.checkedInAt),
    });
    return delay ? [{ a, delay }] : [];
  });

  const byDoctor = summarizeDelays(
    rows.map(r => ({ key: r.a.doctorId ? String(r.a.doctorId) : '', delay: r.delay })),
  );
  const byGroup = summarizeDelays(
    rows.map(r => ({
      key: String(groupBy === 'paciente' ? r.a.patientId : r.a.treatmentTypeId),
      delay: r.delay,
    })),
  ).filter(s => s.delayed > 0);
  const total = summarizeDelays(rows.map(r => ({ key: 'total', delay: r.delay })))[0];

  const delayedRows = rows
    .filter(r => r.delay.overrunMin > 0)
    .sort((x, y) => y.delay.overrunMin - x.delay.overrunMin);
  const detail = delayedRows.slice(0, DETAIL_LIMIT);

  const patientIds = [
    ...new Set([
      ...detail.map(r => String(r.a.patientId)),
      ...(groupBy === 'paciente' ? byGroup.slice(0, DETAIL_LIMIT).map(s => s.key) : []),
    ]),
  ];
  const treatmentIds = [...new Set(rows.map(r => String(r.a.treatmentTypeId)))];
  const [patients, treatments] = await Promise.all([
    patientIds.length
      ? Patient.find({ _id: { $in: patientIds } }).select('name processNumber').lean()
      : [],
    treatmentIds.length
      ? TreatmentType.find({ _id: { $in: treatmentIds } }).select('name').lean()
      : [],
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const treatmentName = new Map(treatments.map(t => [String(t._id), t.name]));
  const patientLabel = (id: string) => {
    const p = patientById.get(id);
    return p ? patientNameWithProcess(p.name, p.processNumber) : '(paciente removido)';
  };
  const lateNote = (d: ConsultDelay) =>
    d.lateStartMin > 0
      ? `${d.lateStartMin} min${d.patientLateMin >= d.lateStartMin ? ' (paciente chegou tarde)' : d.patientLateMin > 0 ? ` (paciente: ${d.patientLateMin})` : ''}`
      : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href='/admin/relatorios' style={{ fontSize: '12px', color: '#6A7186', textDecoration: 'none' }}>
          ← Relatórios
        </Link>
        <h1 style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Atrasos das consultas
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186', maxWidth: 820 }}>
          <strong>Atraso</strong> é o tempo que a consulta durou para lá do fim
          marcado na agenda. <strong>Início tardio</strong> é o tempo entre a
          hora marcada e o médico chamar o paciente; aparece à parte, porque
          pode ser o paciente que chegou tarde. Só entram consultas concluídas.
        </p>
      </div>

      <section style={card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {PERIODS.map(p => (
              <Link key={p.key} href={href({ periodo: p.key })} style={pill(p.key === period)}>
                {p.label}
              </Link>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8, fontSize: '13px', fontWeight: 700, color: '#1B2A6B' }}>
              <Link href={href({ dia: shiftDelayPeriod(day, period, -1) })} aria-label='Período anterior' style={{ color: '#1B2A6B', display: 'inline-flex' }}>
                <ChevronLeft size={18} />
              </Link>
              {rangeLabel}
              <Link href={href({ dia: shiftDelayPeriod(day, period, 1) })} aria-label='Período seguinte' style={{ color: '#1B2A6B', display: 'inline-flex' }}>
                <ChevronRight size={18} />
              </Link>
            </span>
            {day !== today && (
              <Link href={href({ dia: today })} style={pill(false)}>
                Hoje
              </Link>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          <Link href={href({ medico: null })} style={pill(!medico)}>
            Todos os médicos
          </Link>
          {doctors
            .filter(d => d.active || String(d._id) === medico)
            .map(d => (
              <Link key={String(d._id)} href={href({ medico: String(d._id) })} style={pill(String(d._id) === medico)}>
                {d.name}
              </Link>
            ))}
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>Por médico</h2>
        <p style={lead}>
          {total
            ? `${total.consults} consulta${total.consults === 1 ? '' : 's'} concluída${total.consults === 1 ? '' : 's'}, ${total.delayed} com atraso (${total.delayedPct ?? 0}%). Atraso total: ${minutesLabel(total.overrunMin)}.`
            : 'Sem consultas concluídas neste período.'}
          {truncated && ` A mostrar as primeiras ${QUERY_LIMIT} consultas do período; escolha um período mais curto para as contas completas.`}
        </p>
        {byDoctor.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Médico</th>
                  <th style={{ ...th, textAlign: 'right' }}>Consultas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Com atraso</th>
                  <th style={{ ...th, textAlign: 'right' }}>% com atraso</th>
                  <th style={{ ...th, textAlign: 'right' }}>Atraso total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Média por atraso</th>
                  <th style={{ ...th, textAlign: 'right' }}>Maior atraso</th>
                  <th style={{ ...th, textAlign: 'right' }}>Início tardio (total)</th>
                </tr>
              </thead>
              <tbody>
                {byDoctor.map(s => (
                  <tr key={s.key || 'sem'}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {s.key ? (
                        <Link href={href({ medico: s.key })} style={{ color: '#1B2A6B' }}>
                          {doctorName.get(s.key) ?? 'Médico removido'}
                        </Link>
                      ) : (
                        'Sem médico'
                      )}
                    </td>
                    <td style={num}>{s.consults}</td>
                    <td style={num}>{s.delayed}</td>
                    <td style={num}>{s.delayedPct == null ? '—' : `${s.delayedPct}%`}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{minutesLabel(s.overrunMin)}</td>
                    <td style={num}>{s.avgOverrunMin == null ? '—' : minutesLabel(s.avgOverrunMin)}</td>
                    <td style={num}>{s.maxOverrunMin > 0 ? minutesLabel(s.maxOverrunMin) : '—'}</td>
                    <td style={num}>{s.lateStartMin > 0 ? minutesLabel(s.lateStartMin) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={h2}>Atraso por {groupBy === 'paciente' ? 'paciente' : 'tratamento'}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <Link href={href({ ver: 'tratamento' })} style={pill(groupBy === 'tratamento')}>
              Por tratamento
            </Link>
            <Link href={href({ ver: 'paciente' })} style={pill(groupBy === 'paciente')}>
              Por paciente
            </Link>
          </div>
        </div>
        <p style={lead}>Só os que tiveram consultas com atraso, do maior atraso para o menor.</p>
        {byGroup.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>Sem atrasos neste período.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{groupBy === 'paciente' ? 'Paciente' : 'Tratamento'}</th>
                  <th style={{ ...th, textAlign: 'right' }}>Consultas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Com atraso</th>
                  <th style={{ ...th, textAlign: 'right' }}>Atraso total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Média por atraso</th>
                  <th style={{ ...th, textAlign: 'right' }}>Maior atraso</th>
                </tr>
              </thead>
              <tbody>
                {byGroup.slice(0, DETAIL_LIMIT).map(s => (
                  <tr key={s.key}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {groupBy === 'paciente' ? (
                        <Link href={`/admin/pacientes/${s.key}`} style={{ color: '#1B2A6B' }}>
                          {patientLabel(s.key)}
                        </Link>
                      ) : (
                        (treatmentName.get(s.key) ?? '(ato removido)')
                      )}
                    </td>
                    <td style={num}>{s.consults}</td>
                    <td style={num}>{s.delayed}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{minutesLabel(s.overrunMin)}</td>
                    <td style={num}>{s.avgOverrunMin == null ? '—' : minutesLabel(s.avgOverrunMin)}</td>
                    <td style={num}>{minutesLabel(s.maxOverrunMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>Consultas com atraso ({delayedRows.length})</h2>
        <p style={lead}>Uma linha por consulta que passou do fim marcado, da mais atrasada para a menos.</p>
        {detail.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>Sem atrasos neste período.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Marcada</th>
                  <th style={th}>Médico</th>
                  <th style={th}>Paciente</th>
                  <th style={th}>Tratamento</th>
                  <th style={th}>Início real</th>
                  <th style={th}>Fim real</th>
                  <th style={{ ...th, textAlign: 'right' }}>Duração (marcada)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Início tardio</th>
                  <th style={{ ...th, textAlign: 'right' }}>Atraso</th>
                </tr>
              </thead>
              <tbody>
                {detail.map(r => (
                  <tr key={String(r.a._id)}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {whenFmt.format(r.a.startAt)}–{hhmm.format(r.a.endAt)}
                      {r.a.isUrgent && (
                        <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, backgroundColor: '#FDE8E8', color: '#9B1C1C' }}>
                          Urgência
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {r.a.doctorId ? (doctorName.get(String(r.a.doctorId)) ?? 'Médico removido') : 'Sem médico'}
                    </td>
                    <td style={td}>
                      <Link href={`/admin/pacientes/${String(r.a.patientId)}`} style={{ color: '#1B2A6B' }}>
                        {patientLabel(String(r.a.patientId))}
                      </Link>
                    </td>
                    <td style={td}>{treatmentName.get(String(r.a.treatmentTypeId)) ?? '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.a.startedAt ? hhmm.format(r.a.startedAt) : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.a.completedAt ? hhmm.format(r.a.completedAt) : '—'}</td>
                    <td style={num}>
                      {r.delay.actualMin} min ({r.delay.plannedMin})
                    </td>
                    <td style={num}>{lateNote(r.delay)}</td>
                    <td style={{ ...num, fontWeight: 700, color: '#B3261E' }}>{minutesLabel(r.delay.overrunMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {delayedRows.length > DETAIL_LIMIT && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6A7186' }}>
                A mostrar as {DETAIL_LIMIT} consultas mais atrasadas de {delayedRows.length}. Os totais acima contam todas.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
