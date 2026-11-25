// 📄 src/app/admin/orcamentos/page.tsx
// =============================================================================
// CDC Manager — Orçamentos: entregues, pendentes e em curso sem retorno
// (8.ª ronda/12 e 13, Victor 17/11/2026). Ver src/lib/budgets.ts.
// -----------------------------------------------------------------------------
// · Quem entrega orçamentos e a taxa de aceitação por médico (só a gestão)
// · Pendentes há X dias, para a receção ligar
// · Planos em curso sem retorno há mais de 30 dias, para a receção ligar
// Os planos que vieram do Dentoral contam (a clínica trabalhou lá até agora e
// trazem a data de entrega), mas as duas listas de chamadas só olham para os
// orçamentos dos últimos 12 meses: ninguém liga por um orçamento de há anos.
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import {
  BUDGET_PENDING_DAYS,
  BUDGET_PENDING_OPTIONS,
  NO_RETURN_DAYS,
  budgetStatsByDoctor,
  daysSince,
  isInProgressWithoutReturn,
  budgetConversion,
  budgetNumberLabel,
  budgetTicketStats,
  budgetIndicatorsByDoctor,
} from '@/lib/budgets';
import { formatCents } from '@/lib/commissions';
import { patientNameWithProcess } from '@/lib/domain';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import TreatmentPlan from '@/models/TreatmentPlan';
import Procedure from '@/models/Procedure';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orçamentos' };

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const dayFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '20px',
};
const h2: React.CSSProperties = { margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#1C2233' };
const lead: React.CSSProperties = { margin: '0 0 14px', fontSize: '13px', color: '#6A7186' };
const th: React.CSSProperties = {
  textAlign: 'left',
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
  verticalAlign: 'top',
};
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
const LIST_LIMIT = 300;
const MONTH_LIST_LIMIT = 200;
const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  proposed: 'Por responder',
  approved: 'Aceite',
  'in-progress': 'Em execução',
  completed: 'Concluído',
  declined: 'Recusado',
  expired: 'Expirado',
};
const RECENT_DAYS = 365;

const value = (p: { totalCents?: number | null; discountCents?: number | null }) =>
  Math.max(0, (p.totalCents ?? 0) - (p.discountCents ?? 0));

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; dias?: string; semvalor?: string }>;
}) {
  const session = await requireActiveSession(['admin', 'receptionist'] as const);
  if (!session?.user?.id) return null;
  const isAdmin = session.user.role === 'admin';
  const sp = await searchParams;

  const today = todayLisbon();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? (sp.m as string) : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const from = lisbonToUtc(`${month}-01`, 0);
  const to = lisbonToUtc(`${shift(1)}-01`, 0);
  const pendingDays = (BUDGET_PENDING_OPTIONS as readonly number[]).includes(Number(sp.dias))
    ? Number(sp.dias)
    : BUDGET_PENDING_DAYS;
  const now = new Date();
  const nowMs = now.getTime();
  // Muitos "Orçamento livre (Dentoral)" vieram a 0,00 €: a lista de chamadas
  // esconde-os por omissão (Victor, 25/11, G3: "Esconder"). ?semvalor=1 volta
  // a mostrá-los.
  const hideZero = sp.semvalor !== '1';
  const href = (o: { m?: string; dias?: number; hideZero?: boolean }) =>
    `/admin/orcamentos?m=${o.m ?? month}&dias=${o.dias ?? pendingDays}${
      (o.hideZero ?? hideZero) ? '' : '&semvalor=1'
    }`;

  // Só orçamentos entregues nos últimos 12 meses entram nas listas de chamadas
  const recentFrom = new Date(nowMs - RECENT_DAYS * 86_400_000);

  await dbConnect();
  const [doctors, monthPlans, pendingPlans, ongoingPlans] = await Promise.all([
    Doctor.find({ active: true }).select('name').sort({ name: 1 }).lean(),
    isAdmin
      ? TreatmentPlan.find({ proposedAt: { $gte: from, $lt: to } })
          .select(
            'number patientId doctorId title status totalCents discountCents proposedAt approvedAt items.procedureId',
          )
          .sort({ proposedAt: -1 })
          .lean()
      : Promise.resolve([]),
    TreatmentPlan.find({
      status: 'proposed',
      proposedAt: {
        $gte: recentFrom,
        $lte: new Date(nowMs - pendingDays * 86_400_000),
      },
      ...(hideZero
        ? {
            $expr: {
              $gt: [
                {
                  $subtract: [
                    { $ifNull: ['$totalCents', 0] },
                    { $ifNull: ['$discountCents', 0] },
                  ],
                },
                0,
              ],
            },
          }
        : {}),
    })
      .select('number patientId doctorId title totalCents discountCents proposedAt')
      // os mais recentes primeiro: são os que ainda vale a pena ligar
      .sort({ proposedAt: -1 })
      .limit(LIST_LIMIT)
      .lean(),
    TreatmentPlan.find({
      status: { $in: ['approved', 'in-progress'] },
      proposedAt: { $gte: recentFrom },
    })
      .select('number patientId doctorId title status totalCents discountCents approvedAt')
      .sort({ approvedAt: 1 })
      .limit(1000)
      .lean(),
  ]);
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));

  // 13: marcações futuras e última visita dos pacientes com plano em curso
  const ongoingPatientIds = [...new Set(ongoingPlans.map(p => String(p.patientId)))];
  const [futureAgg, lastVisitAgg] = ongoingPatientIds.length
    ? await Promise.all([
        Appointment.distinct('patientId', {
          patientId: { $in: ongoingPatientIds },
          startAt: { $gte: now },
          status: { $in: ['pending', 'confirmed', 'checked-in', 'in-progress'] },
        }),
        Appointment.aggregate<{ _id: unknown; last: Date }>([
          {
            $match: {
              patientId: { $in: ongoingPlans.map(p => p.patientId) },
              status: 'completed',
              startAt: { $lt: now },
            },
          },
          { $group: { _id: '$patientId', last: { $max: '$startAt' } } },
        ]),
      ])
    : [[], []];
  const hasFuture = new Set(futureAgg.map(id => String(id)));
  const lastVisit = new Map(lastVisitAgg.map(r => [String(r._id), r.last.getTime()]));
  const noReturn = ongoingPlans
    .filter(p =>
      isInProgressWithoutReturn(
        {
          status: p.status ?? 'in-progress',
          hasFutureAppointment: hasFuture.has(String(p.patientId)),
          lastVisitMs: lastVisit.get(String(p.patientId)) ?? null,
          approvedMs: p.approvedAt ? (p.approvedAt as Date).getTime() : null,
        },
        nowMs,
      ),
    )
    .slice(0, LIST_LIMIT);

  const patientIds = [
    ...new Set(
      [...pendingPlans, ...noReturn, ...monthPlans.slice(0, MONTH_LIST_LIMIT)].map(
        p => String(p.patientId),
      ),
    ),
  ];
  const patients = patientIds.length
    ? await Patient.find({ _id: { $in: patientIds } })
        .select('name processNumber phone')
        .lean()
    : [];
  const patientById = new Map(patients.map(p => [String(p._id), p]));

  const stats = isAdmin
    ? budgetStatsByDoctor(
        monthPlans.map(p => ({
          doctorId: String(p.doctorId),
          valueCents: value(p),
          proposedMs: p.proposedAt ? (p.proposedAt as Date).getTime() : null,
          approvedMs: p.approvedAt ? (p.approvedAt as Date).getTime() : null,
        })),
        doctors.map(d => String(d._id)),
        from.getTime(),
        to.getTime(),
      ).sort(
        (a, b) =>
          b.presentedN - a.presentedN ||
          (doctorName.get(a.doctorId) ?? '').localeCompare(doctorName.get(b.doctorId) ?? '', 'pt'),
      )
    : [];
  // 9.ª ronda/22: valor já realizado de cada orçamento do mês (atos do plano
  // executados), para a conversão por orçamento e o ticket médio
  const monthProcIds = monthPlans.flatMap(p =>
    (p.items ?? []).flatMap(i => (i.procedureId ? [String(i.procedureId)] : [])),
  );
  const doneProcs = monthProcIds.length
    ? await Procedure.find({
        _id: { $in: monthProcIds },
        status: { $in: ['completed', 'invoiced'] },
      })
        .select('priceCents')
        .lean()
    : [];
  const donePrice = new Map(doneProcs.map(p => [String(p._id), p.priceCents ?? 0]));
  const monthRows = monthPlans.map(p => {
    const doneCents = (p.items ?? []).reduce(
      (s, i) => s + (i.procedureId ? (donePrice.get(String(i.procedureId)) ?? 0) : 0),
      0,
    );
    return { plan: p, valueCents: value(p), doneCents };
  });
  const ticket = budgetTicketStats(
    monthRows.map(r => ({
      valueCents: r.valueCents,
      accepted: !!r.plan.approvedAt,
      doneCents: r.doneCents,
    })),
  );

  // Victor, 25/11 (A11): os mesmos três indicadores, por médico
  const indicatorsByDoctor = budgetIndicatorsByDoctor(
    monthRows.map(r => ({
      doctorId: String(r.plan.doctorId),
      valueCents: r.valueCents,
      accepted: !!r.plan.approvedAt,
      doneCents: r.doneCents,
    })),
  );

  const totalPresented = stats.reduce((s, r) => s + r.presentedN, 0);
  const totalAccepted = stats.reduce((s, r) => s + r.acceptedN, 0);
  const withoutAny = stats.filter(r => r.presentedN === 0).length;

  const patientCell = (patientId: unknown) => {
    const p = patientById.get(String(patientId));
    return (
      <td style={td}>
        {p ? (
          <Link href={`/admin/pacientes/${String(patientId)}`} style={{ fontWeight: 600, color: '#1B2A6B' }}>
            {patientNameWithProcess(p.name, p.processNumber)}
          </Link>
        ) : (
          '(paciente removido)'
        )}
        <div style={{ fontSize: '12px', color: '#6A7186' }}>{p?.phone ?? 'sem telemóvel'}</div>
      </td>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>Orçamentos</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Um orçamento é um plano de tratamento apresentado ao paciente. Aqui vê-se
          quem está por responder e quem começou o tratamento e não voltou.
        </p>
      </div>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <h2 style={h2}>Pendentes há {pendingDays} dias ou mais ({pendingPlans.length})</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {BUDGET_PENDING_OPTIONS.map(d => (
              <Link
                key={d}
                href={href({ dias: d })}
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: d === pendingDays ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                  backgroundColor: d === pendingDays ? '#1B2A6B' : '#FFFFFF',
                  color: d === pendingDays ? '#FFFFFF' : '#1B2A6B',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                {d} dias
              </Link>
            ))}
            <Link
              href={href({ hideZero: !hideZero })}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: hideZero ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                backgroundColor: hideZero ? '#1B2A6B' : '#FFFFFF',
                color: hideZero ? '#FFFFFF' : '#1B2A6B',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
                marginLeft: 8,
              }}
            >
              {hideZero ? 'Mostrar os de 0,00 €' : 'Esconder os de 0,00 €'}
            </Link>
          </div>
        </div>
        <p style={lead}>
          Orçamentos entregues nos últimos 12 meses e ainda sem resposta do paciente.
          Para a receção ligar. Saem da lista quando o paciente aceita, recusa ou
          começa o tratamento.{pendingPlans.length >= LIST_LIMIT ? ` A mostrar os ${LIST_LIMIT} mais recentes.` : ''}
        </p>
        {pendingPlans.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>Nenhum orçamento pendente há tanto tempo.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Paciente</th>
                  <th style={th}>Orçamento</th>
                  <th style={th}>Médico</th>
                  <th style={th}>Entregue</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {pendingPlans.map(p => (
                  <tr key={String(p._id)}>
                    {patientCell(p.patientId)}
                    <td style={td}>
                      {p.number != null ? `n.º ${p.number} · ` : ''}
                      {p.title}
                    </td>
                    <td style={td}>{doctorName.get(String(p.doctorId)) ?? '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {dayFmt.format(p.proposedAt as Date)}
                      <div style={{ fontSize: '12px', color: '#6A7186' }}>
                        há {daysSince((p.proposedAt as Date).getTime(), nowMs)} dias
                      </div>
                    </td>
                    <td style={num}>{formatCents(value(p))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>Em curso sem retorno ({noReturn.length})</h2>
        <p style={lead}>
          Pacientes com plano de tratamento aceite ou em curso (entregue nos últimos
          12 meses), sem nenhuma marcação futura e sem vir à clínica há mais de{' '}
          {NO_RETURN_DAYS} dias. Para a receção ligar.{noReturn.length >= LIST_LIMIT ? ` A mostrar os primeiros ${LIST_LIMIT}.` : ''}
        </p>
        {noReturn.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>Nenhum tratamento em curso sem retorno.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Paciente</th>
                  <th style={th}>Plano</th>
                  <th style={th}>Médico</th>
                  <th style={th}>Última consulta</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {noReturn.map(p => {
                  const last = lastVisit.get(String(p.patientId)) ?? null;
                  return (
                    <tr key={String(p._id)}>
                      {patientCell(p.patientId)}
                      <td style={td}>
                      {p.number != null ? `n.º ${p.number} · ` : ''}
                      {p.title}
                    </td>
                      <td style={td}>{doctorName.get(String(p.doctorId)) ?? '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {last ? (
                          <>
                            {dayFmt.format(new Date(last))}
                            <div style={{ fontSize: '12px', color: '#6A7186' }}>há {daysSince(last, nowMs)} dias</div>
                          </>
                        ) : (
                          'Ainda não veio'
                        )}
                      </td>
                      <td style={num}>{formatCents(value(p))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={h2}>Entrega e aceitação por médico</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 700, color: '#1B2A6B' }}>
              <Link href={href({ m: shift(-1) })} aria-label='Mês anterior' style={{ color: '#1B2A6B', display: 'inline-flex' }}>
                <ChevronLeft size={18} />
              </Link>
              {MONTHS[m - 1]} de {y}
              <Link href={href({ m: shift(1) })} aria-label='Mês seguinte' style={{ color: '#1B2A6B', display: 'inline-flex' }}>
                <ChevronRight size={18} />
              </Link>
            </div>
          </div>
          <p style={lead}>
            Orçamentos apresentados no mês e, desses, os que o paciente aceitou.{' '}
            {totalPresented > 0
              ? `No total: ${totalPresented} apresentados, ${totalAccepted} aceites (${Math.round((totalAccepted / totalPresented) * 100)}%).`
              : 'Nenhum orçamento apresentado neste mês.'}{' '}
            {withoutAny > 0 && `${withoutAny} médico${withoutAny === 1 ? '' : 's'} sem nenhum orçamento entregue.`}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Médico</th>
                  <th style={{ ...th, textAlign: 'right' }}>Apresentados</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor apresentado</th>
                  <th style={{ ...th, textAlign: 'right' }}>Aceites</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor aceite</th>
                  <th style={{ ...th, textAlign: 'right' }}>Aceitação (n.º)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Aceitação (valor)</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(r => (
                  <tr key={r.doctorId} style={r.presentedN === 0 ? { opacity: 0.6 } : undefined}>
                    <td style={{ ...td, fontWeight: 600 }}>{doctorName.get(r.doctorId) ?? '—'}</td>
                    <td style={num}>{r.presentedN}</td>
                    <td style={num}>{formatCents(r.presentedCents)}</td>
                    <td style={num}>{r.acceptedN}</td>
                    <td style={num}>{formatCents(r.acceptedCents)}</td>
                    <td style={num}>{r.rateN == null ? '—' : `${r.rateN}%`}</td>
                    <td style={num}>{r.rateCents == null ? '—' : `${r.rateCents}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 9.ª ronda/22 + respostas de 25/11 (A11): os três indicadores */}
      {isAdmin && (
        <section style={card}>
          <h2 style={h2}>
            Conversão e ticket médio — {MONTHS[m - 1]} de {y}
          </h2>
          <p style={lead}>
            Orçamentos apresentados no mês; cada orçamento conta uma só vez.
            &quot;Feito&quot; é o valor dos tratamentos do orçamento já
            realizados até hoje (num orçamento feito em parte, conta só essa
            parte). Os valores atualizam-se sozinhos à medida que os tratamentos
            são feitos.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 10,
              marginBottom: 10,
            }}
          >
            {(
              [
                [
                  'Taxa de conversão',
                  ticket.conversionN == null ? '—' : `${ticket.conversionN}%`,
                  `${ticket.startedN} de ${ticket.presentedN} orçamento${ticket.presentedN === 1 ? '' : 's'} com tratamento feito`,
                ],
                [
                  'Conversão financeira',
                  ticket.conversionCents == null ? '—' : `${ticket.conversionCents}%`,
                  `${formatCents(ticket.doneCents)} feitos de ${formatCents(ticket.presentedCents)} apresentados`,
                ],
                [
                  'Ticket médio',
                  ticket.avgDoneCents == null ? '—' : formatCents(ticket.avgDoneCents),
                  `valor feito ÷ ${ticket.startedN} orçamento${ticket.startedN === 1 ? '' : 's'} convertido${ticket.startedN === 1 ? '' : 's'}`,
                ],
              ] as const
            ).map(([label, big, sub]) => (
              <div
                key={label}
                style={{
                  border: '1px solid #D8DEEF',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  backgroundColor: '#F4F6FD',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1B2A6B' }}>{label}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>{big}</div>
                <div style={{ fontSize: '12px', color: '#6A7186' }}>{sub}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#6A7186' }}>
            Para referência: ticket médio apresentado{' '}
            <strong>
              {ticket.avgPresentedCents == null ? '—' : formatCents(ticket.avgPresentedCents)}
            </strong>{' '}
            ({ticket.presentedN}) · ticket médio aceite{' '}
            <strong>
              {ticket.avgAcceptedCents == null ? '—' : formatCents(ticket.avgAcceptedCents)}
            </strong>{' '}
            ({ticket.acceptedN} aceite{ticket.acceptedN === 1 ? '' : 's'}).
          </p>
          {indicatorsByDoctor.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Médico</th>
                    <th style={{ ...th, textAlign: 'right' }}>Apresentados</th>
                    <th style={{ ...th, textAlign: 'right' }}>Convertidos</th>
                    <th style={{ ...th, textAlign: 'right' }}>Taxa de conversão</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor apresentado</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor feito</th>
                    <th style={{ ...th, textAlign: 'right' }}>Conversão financeira</th>
                    <th style={{ ...th, textAlign: 'right' }}>Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {indicatorsByDoctor.map(r => (
                    <tr key={r.doctorId}>
                      <td style={{ ...td, fontWeight: 600 }}>{doctorName.get(r.doctorId) ?? '—'}</td>
                      <td style={num}>{r.presentedN}</td>
                      <td style={num}>{r.startedN}</td>
                      <td style={{ ...num, fontWeight: 700 }}>
                        {r.conversionN == null ? '—' : `${r.conversionN}%`}
                      </td>
                      <td style={num}>{formatCents(r.presentedCents)}</td>
                      <td style={num}>{formatCents(r.doneCents)}</td>
                      <td style={{ ...num, fontWeight: 700 }}>
                        {r.conversionCents == null ? '—' : `${r.conversionCents}%`}
                      </td>
                      <td style={{ ...num, fontWeight: 700 }}>
                        {r.avgDoneCents == null ? '—' : formatCents(r.avgDoneCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {monthRows.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
              Nenhum orçamento apresentado neste mês.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>N.º</th>
                    <th style={th}>Apresentado</th>
                    <th style={th}>Paciente</th>
                    <th style={th}>Médico</th>
                    <th style={th}>Estado</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                    <th style={{ ...th, textAlign: 'right' }}>Realizado</th>
                    <th style={{ ...th, textAlign: 'right' }}>Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.slice(0, MONTH_LIST_LIMIT).map(r => {
                    const conv = budgetConversion(r.valueCents, r.doneCents);
                    return (
                      <tr key={String(r.plan._id)}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>
                          {budgetNumberLabel(r.plan.number)}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {r.plan.proposedAt ? dayFmt.format(r.plan.proposedAt as Date) : '—'}
                        </td>
                        {patientCell(r.plan.patientId)}
                        <td style={td}>{doctorName.get(String(r.plan.doctorId)) ?? '—'}</td>
                        <td style={td}>
                          {PLAN_STATUS_LABEL[r.plan.status ?? ''] ?? r.plan.status}
                        </td>
                        <td style={num}>{formatCents(r.valueCents)}</td>
                        <td style={num}>{formatCents(r.doneCents)}</td>
                        <td style={{ ...num, fontWeight: 700 }}>
                          {conv == null ? '—' : `${conv}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {monthRows.length > MONTH_LIST_LIMIT && (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6A7186' }}>
                  A mostrar os {MONTH_LIST_LIMIT} mais recentes de {monthRows.length}. Os
                  totais acima contam todos.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
