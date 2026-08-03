// 📄 src/app/admin/dashboard/page.tsx
// =============================================================================
// CDC Manager — Dashboard Admin: a operação do dia
// -----------------------------------------------------------------------------
// Server Component. O ecrã de entrada da gestão: como está o dia AGORA nas
// duas clínicas — marcações e o seu progresso, atos executados e valor, e
// o que está POR COBRAR (a ponte visível para a cobrança/faturação).
// Tudo calculado ao vivo do MongoDB, sem caches.
// =============================================================================

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { formatCents } from '@/lib/commissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const CLINIC_STYLE: Record<string, { bg: string; fg: string }> = {
  colombo: { bg: '#E4EBFF', fg: '#1B2A6B' },
  buraca: { bg: '#EFE6FA', fg: '#5B2E91' },
};

export default async function AdminDashboardPage() {
  const session = await auth();
  const firstName = (session?.user?.name ?? '').split(' ')[0];

  await dbConnect();

  const today = todayLisbon();
  const dayStart = lisbonToUtc(today, 0);
  const dayEnd = lisbonToUtc(today, 24 * 60);

  const [clinics, apptsByClinic, patientsTotal, executedToday, toCollect] =
    await Promise.all([
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
      // Atos executados hoje (nº + valor)
      Procedure.aggregate<{ _id: null; n: number; cents: number }>([
        {
          $match: {
            status: { $in: ['completed', 'invoiced'] },
            executedAt: { $gte: dayStart, $lt: dayEnd },
          },
        },
        {
          $group: { _id: null, n: { $sum: 1 }, cents: { $sum: '$priceCents' } },
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
  const collectByClinic = new Map(toCollect.map(r => [String(r._id), r]));
  const collectTotalCents = toCollect.reduce((s, r) => s + r.cents, 0);
  const collectTotalN = toCollect.reduce((s, r) => s + r.n, 0);
  const executed = executedToday[0] ?? { n: 0, cents: 0 };

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

      {/* KPIs globais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
        }}
      >
        {[
          { label: 'Pacientes ativos', value: String(patientsTotal) },
          {
            label: 'Atos executados hoje',
            value: `${executed.n}`,
            sub: formatCents(executed.cents),
          },
          {
            label: 'Por cobrar',
            value: formatCents(collectTotalCents),
            sub: `${collectTotalN} ato${collectTotalN === 1 ? '' : 's'} · faturação ativa com o Moloni`,
            accent: collectTotalCents > 0,
          },
        ].map(kpi => (
          <div
            key={kpi.label}
            style={{
              ...card,
              border: kpi.accent ? '1px solid #C9D4FF' : card.border,
              backgroundColor: kpi.accent ? '#F5F8FF' : '#FFFFFF',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 700,
                color: '#1B2A6B',
                lineHeight: 1.15,
              }}
            >
              {kpi.value}
            </p>
            <p
              style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}
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
          </div>
        ))}
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
                  {c.slug === 'colombo' ? 'Colombo' : 'Buraca'}
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
