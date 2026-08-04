// 📄 src/app/admin/relatorios/page.tsx
// =============================================================================
// CDC Manager — Admin: Relatórios do mês
// -----------------------------------------------------------------------------
// Server Component com navegação mensal (?mes=YYYY-MM, ‹ mês atual ›).
// Três blocos, todos calculados ao vivo por agregação:
//
//   1. PRODUÇÃO E COMISSÕES por profissional — lê os SNAPSHOTS congelados
//      nos atos (commissionCents fixado na execução): o acerto de contas
//      com os médicos sai daqui, imune a mudanças posteriores de taxas
//   2. RESUMO POR CLÍNICA — produção executada, valor cobrado, por cobrar
//   3. ATIVIDADE — consultas realizadas vs faltas/cancelamentos (taxa)
//
// "Produção" = atos executados no mês (completed+invoiced, por executedAt).
// "Cobrado" = cobranças registadas no mês (Invoices por paidAt).
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Procedure from '@/models/Procedure';
import Invoice from '@/models/Invoice';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc } from '@/lib/availability';
import { formatCents } from '@/lib/commissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Relatórios' };

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "YYYY-MM" atual em Lisboa */
function currentMonthLisbon(): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date())) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}`;
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Limites UTC do mês civil de Lisboa [início, fim) */
function monthBoundsUtc(mes: string): [Date, Date] {
  const start = lisbonToUtc(`${mes}-01`, 0);
  const next = shiftMonth(mes, 1);
  const end = lisbonToUtc(`${next}-01`, 0);
  return [start, end];
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const current = currentMonthLisbon();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam ?? '')
    ? (mesParam as string)
    : current;
  const [start, end] = monthBoundsUtc(mes);
  const [y, m] = mes.split('-').map(Number);
  const mesLabel = `${MONTH_NAMES[m - 1].charAt(0).toUpperCase()}${MONTH_NAMES[m - 1].slice(1)} de ${y}`;

  await dbConnect();

  const [
    clinics,
    prodByDoctor,
    prodByClinic,
    invByClinic,
    toCollect,
    activityByClinic,
    doctors,
  ] = await Promise.all([
    getActiveClinics(),
    // 1. Produção + comissões por profissional (snapshots)
    Procedure.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      producedCents: number;
      commissionCents: number;
    }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: '$doctorId',
          n: { $sum: 1 },
          producedCents: { $sum: '$priceCents' },
          commissionCents: { $sum: '$commissionCents' },
        },
      },
      { $sort: { producedCents: -1 } },
    ]),
    // 2a. Produção por clínica
    Procedure.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      cents: number;
    }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: start, $lt: end },
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
    // 2b. Cobrado no mês por clínica
    Invoice.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      cents: number;
    }>([
      {
        $match: {
          status: { $ne: 'voided' },
          paidAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: '$clinicId',
          n: { $sum: 1 },
          cents: { $sum: '$totalCents' },
        },
      },
    ]),
    // 2c. Por cobrar (snapshot atual, sem filtro de mês)
    Procedure.aggregate<{ _id: mongoose.Types.ObjectId; cents: number }>([
      { $match: { status: 'completed', invoiceId: null } },
      { $group: { _id: '$clinicId', cents: { $sum: '$priceCents' } } },
    ]),
    // 3. Atividade: consultas do mês por clínica × estado
    Appointment.aggregate<{
      _id: { clinicId: mongoose.Types.ObjectId; status: string };
      n: number;
    }>([
      { $match: { startAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { clinicId: '$clinicId', status: '$status' },
          n: { $sum: 1 },
        },
      },
    ]),
    Doctor.find({}).select('name color').lean(),
  ]);

  const doctorById = new Map(doctors.map(d => [String(d._id), d]));
  const clinicName = new Map(
    clinics.map(c => [
      String(c._id),
      c.slug === 'colombo' ? 'Colombo' : 'Buraca',
    ]),
  );
  const prodClinic = new Map(prodByClinic.map(r => [String(r._id), r]));
  const invClinic = new Map(invByClinic.map(r => [String(r._id), r]));
  const collectClinic = new Map(toCollect.map(r => [String(r._id), r.cents]));

  const activity = new Map<string, Record<string, number>>();
  for (const row of activityByClinic) {
    const key = String(row._id.clinicId);
    const e = activity.get(key) ?? {};
    e[row._id.status] = row.n;
    activity.set(key, e);
  }

  const totalProduced = prodByDoctor.reduce((s, r) => s + r.producedCents, 0);
  const totalCommission = prodByDoctor.reduce(
    (s, r) => s + r.commissionCents,
    0,
  );

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    overflow: 'hidden',
  };
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 20px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
  };
  const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
  const td: React.CSSProperties = {
    padding: '10px 20px',
    fontSize: '14px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
  };
  const tdNum: React.CSSProperties = {
    ...td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho + navegação mensal */}
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
            Relatórios
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            {mesLabel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Link
            href={`/admin/relatorios?mes=${shiftMonth(mes, -1)}`}
            style={navBtn}
            aria-label='Mês anterior'
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href='/admin/relatorios'
            style={{
              ...navBtn,
              backgroundColor: mes === current ? '#2743A6' : '#FFFFFF',
              color: mes === current ? '#FFFFFF' : '#1B2A6B',
            }}
          >
            Mês atual
          </Link>
          <Link
            href={`/admin/relatorios?mes=${shiftMonth(mes, 1)}`}
            style={navBtn}
            aria-label='Mês seguinte'
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* 1. Produção e comissões por profissional */}
      <div style={card}>
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #EEF1F8',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Produção e comissões por profissional
        </div>
        {prodByDoctor.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '20px',
              fontSize: '14px',
              color: '#6A7186',
            }}
          >
            Sem atos executados neste mês.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Profissional</th>
                <th style={thNum}>Atos</th>
                <th style={thNum}>Produção</th>
                <th style={thNum}>Comissão (profissional)</th>
                <th style={thNum}>Parte da clínica</th>
              </tr>
            </thead>
            <tbody>
              {prodByDoctor.map(r => {
                const d = doctorById.get(String(r._id));
                return (
                  <tr key={String(r._id)}>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          backgroundColor: (d?.color as string) ?? '#C7CEE0',
                          marginRight: 8,
                        }}
                      />
                      {d?.name ?? '(profissional removido)'}
                    </td>
                    <td style={tdNum}>{r.n}</td>
                    <td style={tdNum}>{formatCents(r.producedCents)}</td>
                    <td style={tdNum}>{formatCents(r.commissionCents)}</td>
                    <td style={tdNum}>
                      {formatCents(r.producedCents - r.commissionCents)}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Total</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>
                  {prodByDoctor.reduce((s, r) => s + r.n, 0)}
                </td>
                <td style={{ ...tdNum, fontWeight: 700 }}>
                  {formatCents(totalProduced)}
                </td>
                <td style={{ ...tdNum, fontWeight: 700 }}>
                  {formatCents(totalCommission)}
                </td>
                <td style={{ ...tdNum, fontWeight: 700 }}>
                  {formatCents(totalProduced - totalCommission)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <p
          style={{
            margin: 0,
            padding: '10px 20px',
            fontSize: '12px',
            color: '#9AA1B4',
            backgroundColor: '#F9FAFD',
          }}
        >
          Comissões congeladas no momento da execução de cada ato — alterações
          posteriores de taxas nunca afetam este acerto.
        </p>
      </div>

      {/* 2. Resumo por clínica */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '12px',
        }}
      >
        {clinics.map(c => {
          const key = String(c._id);
          const prod = prodClinic.get(key);
          const inv = invClinic.get(key);
          const collect = collectClinic.get(key) ?? 0;
          const act = activity.get(key) ?? {};
          const done = act['completed'] ?? 0;
          const missed = (act['cancelled'] ?? 0) + (act['no-show'] ?? 0);
          const totalAppts = Object.values(act).reduce((s, n) => s + n, 0);
          const missRate =
            totalAppts > 0 ? Math.round((missed / totalAppts) * 100) : 0;
          return (
            <div key={key} style={card}>
              <div
                style={{
                  padding: '13px 20px',
                  borderBottom: '1px solid #EEF1F8',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                }}
              >
                {c.name}
              </div>
              <div
                style={{
                  padding: '14px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                  fontSize: '14px',
                  color: '#3D4257',
                }}
              >
                <p style={{ margin: 0 }}>
                  Produção:{' '}
                  <strong style={{ color: '#1B2A6B' }}>
                    {formatCents(prod?.cents ?? 0)}
                  </strong>{' '}
                  ({prod?.n ?? 0} ato{(prod?.n ?? 0) === 1 ? '' : 's'})
                </p>
                <p style={{ margin: 0 }}>
                  Cobrado no mês:{' '}
                  <strong style={{ color: '#0F7B4D' }}>
                    {formatCents(inv?.cents ?? 0)}
                  </strong>{' '}
                  ({inv?.n ?? 0} cobrança{(inv?.n ?? 0) === 1 ? '' : 's'})
                </p>
                <p style={{ margin: 0 }}>
                  Por cobrar (atual):{' '}
                  <strong
                    style={{ color: collect > 0 ? '#8A5A00' : '#1B2A6B' }}
                  >
                    {formatCents(collect)}
                  </strong>
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
                  Consultas: {done} realizadas · {missed} faltas/canceladas
                  {totalAppts > 0 ? ` (${missRate}%)` : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        {clinics.map(c => clinicName.get(String(c._id))).join(' e ')} — mesma
        sociedade, relatórios separados por casa. Exportações e mais relatórios
        (produção por ato, recalls) chegam com os próximos módulos.
      </p>
    </div>
  );
}
