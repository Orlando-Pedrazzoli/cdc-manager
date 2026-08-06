// 📄 src/app/admin/dashboard/page.tsx
// =============================================================================
// CDC Manager — Dashboard Admin: a operação do dia
// -----------------------------------------------------------------------------
// Server Component. O ecrã de entrada da gestão: como está o dia AGORA nas
// duas clínicas — marcações e o seu progresso, atos executados e valor, o que
// está POR COBRAR (ponte visível para a Cobrança), recalls por contactar e
// stock a repor. Tudo calculado ao vivo do MongoDB, sem caches.
//
// Notas de implementação:
// · Recalls "por contactar" = status 'due' OU 'scheduled' cuja data já chegou
//   (leitura pura — a promoção lazy scheduled→due acontece só no load de
//   /admin/recalls; aqui apenas CONTAMOS, nunca escrevemos).
// · Stock "a repor" = produtos ativos com minStock > 0 e saldo TOTAL das duas
//   casas abaixo do mínimo (mesma regra do badge "Repor" da StockTable).
// · Badge da clínica: derivado do slug (capitalizado) — 3.ª clínica = zero
//   código, como nas colunas dinâmicas do Stock.
// =============================================================================

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import Recall from '@/models/Recall';
import Product from '@/models/Product';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { formatCents } from '@/lib/commissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const CLINIC_STYLE: Record<string, { bg: string; fg: string }> = {
  colombo: { bg: '#E4EBFF', fg: '#1B2A6B' },
  buraca: { bg: '#EFE6FA', fg: '#5B2E91' },
};

/** "colombo" → "Colombo" (badge dinâmico — sem hardcode por clínica) */
function slugLabel(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export default async function AdminDashboardPage() {
  const session = await auth();
  const firstName = (session?.user?.name ?? '').split(' ')[0];

  await dbConnect();

  const today = todayLisbon();
  const dayStart = lisbonToUtc(today, 0);
  const dayEnd = lisbonToUtc(today, 24 * 60);
  const now = new Date();

  const [
    clinics,
    apptsByClinic,
    patientsTotal,
    executedByClinic,
    toCollect,
    recallsDue,
    stockLow,
  ] = await Promise.all([
    getActiveClinics(),
    // Marcações de hoje agrupadas por clínica × estado
    Appointment.aggregate<{
      _id: { clinicId: mongoose.Types.ObjectId; status: string };
      n: number;
    }>([
      { $match: { startAt: { $gte: dayStart, $lt: dayEnd } } },
      {
        $group: {
          _id: { clinicId: '$clinicId', status: '$status' },
          n: { $sum: 1 },
        },
      },
    ]),
    Patient.countDocuments({ status: 'active' }),
    // Atos executados hoje (nº + valor) POR CLÍNICA — o global soma-se abaixo
    Procedure.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      cents: number;
    }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: dayStart, $lt: dayEnd },
        },
      },
      {
        $group: {
          _id: '$clinicId',
          n: { $sum: 1 },
          cents: { $sum: '$priceCents' },
        },
      },
    ]),
    // Por cobrar (qualquer data): completed sem fatura, por clínica
    Procedure.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      cents: number;
    }>([
      { $match: { status: 'completed', invoiceId: null } },
      {
        $group: {
          _id: '$clinicId',
          n: { $sum: 1 },
          cents: { $sum: '$priceCents' },
        },
      },
    ]),
    // Recalls na fila de contacto (leitura pura — ver nota no topo)
    Recall.countDocuments({
      $or: [{ status: 'due' }, { status: 'scheduled', dueAt: { $lte: now } }],
    }),
    // Produtos ativos com mínimo definido e saldo total abaixo do mínimo
    Product.aggregate<{ n: number }>([
      { $match: { active: true, minStock: { $gt: 0 } } },
      {
        $project: {
          minStock: 1,
          total: { $sum: '$stockCache.quantity' },
        },
      },
      { $match: { $expr: { $lt: ['$total', '$minStock'] } } },
      { $count: 'n' },
    ]),
  ]);

  // Reorganizar agregações
  const perClinic = new Map<
    string,
    { total: number; byStatus: Record<string, number> }
  >();
  for (const row of apptsByClinic) {
    const key = String(row._id.clinicId);
    const entry = perClinic.get(key) ?? { total: 0, byStatus: {} };
    entry.total += row.n;
    entry.byStatus[row._id.status] = row.n;
    perClinic.set(key, entry);
  }
  const executedMap = new Map(executedByClinic.map(r => [String(r._id), r]));
  const executedTotalCents = executedByClinic.reduce((s, r) => s + r.cents, 0);
  const executedTotalN = executedByClinic.reduce((s, r) => s + r.n, 0);
  const collectByClinic = new Map(toCollect.map(r => [String(r._id), r]));
  const collectTotalCents = toCollect.reduce((s, r) => s + r.cents, 0);
  const collectTotalN = toCollect.reduce((s, r) => s + r.n, 0);
  const stockLowN = stockLow[0]?.n ?? 0;

  const rawDate = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date());
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '16px 20px',
  };

  const doneOf = (byStatus: Record<string, number>) =>
    byStatus['completed'] ?? 0;
  const activeOf = (byStatus: Record<string, number>) =>
    (byStatus['pending'] ?? 0) +
    (byStatus['confirmed'] ?? 0) +
    (byStatus['checked-in'] ?? 0) +
    (byStatus['in-progress'] ?? 0) +
    (byStatus['completed'] ?? 0);
  const missedOf = (byStatus: Record<string, number>) =>
    (byStatus['cancelled'] ?? 0) + (byStatus['no-show'] ?? 0);

  // ---------------------------------------------------------------------------
  // KPIs — os acionáveis (Por cobrar, Recalls, Stock) são cartões-link.
  // Paleta de alerta: azul (cobrança), vermelho (recalls), âmbar (stock).
  // ---------------------------------------------------------------------------
  const kpis: Array<{
    label: string;
    value: string;
    sub?: string;
    href?: string;
    accentBg?: string;
    accentBorder?: string;
    valueColor?: string;
  }> = [
    { label: 'Pacientes ativos', value: String(patientsTotal) },
    {
      label: 'Atos executados hoje',
      value: String(executedTotalN),
      sub: formatCents(executedTotalCents),
    },
    {
      label: 'Por cobrar',
      value: formatCents(collectTotalCents),
      sub:
        collectTotalN > 0
          ? `${collectTotalN} ato${collectTotalN === 1 ? '' : 's'} aguarda${collectTotalN === 1 ? '' : 'm'} cobrança`
          : 'Tudo cobrado',
      href: '/admin/cobranca',
      ...(collectTotalCents > 0
        ? { accentBg: '#F5F8FF', accentBorder: '#C9D4FF' }
        : {}),
    },
    {
      label: 'Recalls por contactar',
      value: String(recallsDue),
      sub: recallsDue > 0 ? 'Na fila de contacto' : 'Em dia',
      href: '/admin/recalls',
      ...(recallsDue > 0
        ? {
            accentBg: '#FDF3F2',
            accentBorder: '#F3CFCC',
            valueColor: '#B3261E',
          }
        : {}),
    },
    {
      label: 'Stock a repor',
      value: String(stockLowN),
      sub: stockLowN > 0 ? 'Abaixo do mínimo' : 'Níveis OK',
      href: '/admin/stock',
      ...(stockLowN > 0
        ? {
            accentBg: '#FFF9EE',
            accentBorder: '#F2DEB6',
            valueColor: '#8A5A00',
          }
        : {}),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {firstName ? `Olá, ${firstName}` : 'Dashboard'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
          {dateLabel}
        </p>
      </div>

      {/* KPIs globais + alertas operacionais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
        }}
      >
        {kpis.map(kpi => {
          const body = (
            <div
              style={{
                ...card,
                height: '100%',
                boxSizing: 'border-box',
                border: kpi.accentBorder
                  ? `1px solid ${kpi.accentBorder}`
                  : card.border,
                backgroundColor: kpi.accentBg ?? '#FFFFFF',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  color: kpi.valueColor ?? '#1B2A6B',
                  lineHeight: 1.15,
                }}
              >
                {kpi.value}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  color: '#6A7186',
                }}
              >
                {kpi.label}
              </p>
              {kpi.sub && (
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: '#9AA1B4',
                  }}
                >
                  {kpi.sub}
                </p>
              )}
              {kpi.href && (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#2743A6',
                  }}
                >
                  Abrir →
                </p>
              )}
            </div>
          );
          return kpi.href ? (
            <Link
              key={kpi.label}
              href={kpi.href}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              {body}
            </Link>
          ) : (
            <div key={kpi.label}>{body}</div>
          );
        })}
      </div>

      {/* O dia por clínica */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '12px',
        }}
      >
        {clinics.map(c => {
          const stats = perClinic.get(String(c._id)) ?? {
            total: 0,
            byStatus: {},
          };
          const executed = executedMap.get(String(c._id));
          const collect = collectByClinic.get(String(c._id));
          const cl = CLINIC_STYLE[c.slug] ?? { bg: '#EAECF3', fg: '#3D4257' };
          const inProgress = stats.byStatus['in-progress'] ?? 0;
          const waiting = stats.byStatus['checked-in'] ?? 0;
          return (
            <div
              key={c.slug}
              style={{ ...card, padding: 0, overflow: 'hidden' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 20px',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    borderRadius: '999px',
                    padding: '2px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: cl.bg,
                    color: cl.fg,
                  }}
                >
                  {slugLabel(c.slug)}
                </span>
              </div>
              <div
                style={{
                  padding: '14px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <p style={{ margin: 0, fontSize: '14px', color: '#3D4257' }}>
                  <strong style={{ color: '#1B2A6B' }}>
                    {activeOf(stats.byStatus)}
                  </strong>{' '}
                  consulta{activeOf(stats.byStatus) === 1 ? '' : 's'} hoje ·{' '}
                  {doneOf(stats.byStatus)} concluída
                  {doneOf(stats.byStatus) === 1 ? '' : 's'}
                  {missedOf(stats.byStatus) > 0 && (
                    <span style={{ color: '#B3261E' }}>
                      {' '}
                      · {missedOf(stats.byStatus)} falta
                      {missedOf(stats.byStatus) === 1 ? '' : 's'}/cancelada
                      {missedOf(stats.byStatus) === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
                {(inProgress > 0 || waiting > 0) && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: '#0F7B4D',
                      fontWeight: 600,
                    }}
                  >
                    Agora: {inProgress > 0 ? `${inProgress} em curso` : ''}
                    {inProgress > 0 && waiting > 0 ? ' · ' : ''}
                    {waiting > 0 ? `${waiting} em espera` : ''}
                  </p>
                )}
                {executed && executed.cents > 0 && (
                  <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
                    Executado hoje:{' '}
                    <strong style={{ color: '#0F7B4D' }}>
                      {formatCents(executed.cents)}
                    </strong>{' '}
                    ({executed.n} ato{executed.n === 1 ? '' : 's'})
                  </p>
                )}
                {collect && collect.cents > 0 && (
                  <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
                    Por cobrar:{' '}
                    <strong style={{ color: '#1B2A6B' }}>
                      {formatCents(collect.cents)}
                    </strong>{' '}
                    ({collect.n} ato{collect.n === 1 ? '' : 's'})
                  </p>
                )}
                <Link
                  href={`/admin/agenda?clinic=${c.slug}`}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#2743A6',
                    textDecoration: 'none',
                  }}
                >
                  Abrir agenda →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
