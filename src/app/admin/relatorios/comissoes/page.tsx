// 📄 src/app/admin/relatorios/comissoes/page.tsx
// =============================================================================
// CDC Manager — Admin: Listagem detalhada de remuneração (Fase 1, E7)
// -----------------------------------------------------------------------------
// Pedido da Isabel: "listagens detalhadas do cálculo da remuneração dos
// médicos, onde deve aparecer o nº paciente, nome, categoria do tratamento,
// descrição da linha do tratamento, valor tratamento, valor custo, valor
// real, valor da remuneração".
//
// Colunas: Data · Nº proc. · Paciente · Categoria · Descrição · PVP ·
// Desconto · Valor cobrado · Custo · Valor real (base) · Regra · Remuneração
// Estornos do mês entram como linhas a negativo (fundo vermelho claro).
// Filtros: ?mes=YYYY-MM  ?medico=<id>  ?clinica=<id>. CSV por médico.
// Regra de fecho de mês: lib/commission-accounting.ts.
// =============================================================================

import Link from 'next/link';
import mongoose from 'mongoose';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Procedure from '@/models/Procedure';
import CommissionAdjustment from '@/models/CommissionAdjustment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { getActiveClinics } from '@/models/Clinic';
import { formatCents } from '@/lib/commissions';
import {
  lisbonMonthOf,
  monthBoundsUtc,
  shiftMonth,
  producedProceduresMatch,
  adjustmentsMatch,
} from '@/lib/commission-accounting';
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Remuneração detalhada' };

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

const SOURCE_LABEL: Record<string, string> = {
  'treatment-override': 'Override do ato',
  'category-override': 'Override da categoria',
  'doctor-rate': 'Taxa base',
  'treatment-rate': 'Taxa do ato',
  'clinic-default': 'Default clínica',
};

function lisbonDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

interface Row {
  key: string;
  date: Date;
  processNumber: string;
  patientName: string;
  category: string;
  description: string;
  listPriceCents: number;
  discountCents: number;
  priceCents: number;
  costCents: number;
  baseCents: number;
  rule: string;
  commissionCents: number;
  isAdjustment: boolean;
  note: string | null;
}

export default async function ComissoesDetalhePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; medico?: string; clinica?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return null;

  const current = lisbonMonthOf(new Date());
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? '')
    ? (sp.mes as string)
    : current;
  const [start, end] = monthBoundsUtc(mes);
  const [y, m] = mes.split('-').map(Number);
  const mesLabel = `${MONTH_NAMES[m - 1]} de ${y}`;
  const doctorFilter = mongoose.isValidObjectId(sp.medico ?? '')
    ? (sp.medico as string)
    : '';
  const clinicFilter = mongoose.isValidObjectId(sp.clinica ?? '')
    ? (sp.clinica as string)
    : '';

  await dbConnect();

  const extra: Record<string, unknown> = {};
  if (doctorFilter) extra.doctorId = new mongoose.Types.ObjectId(doctorFilter);
  if (clinicFilter) extra.clinicId = new mongoose.Types.ObjectId(clinicFilter);

  const [clinics, doctors, procedures, adjustments] = await Promise.all([
    getActiveClinics(),
    Doctor.find({}).select('name color').sort({ name: 1 }).lean(),
    Procedure.find(producedProceduresMatch(start, end, extra))
      .sort({ doctorId: 1, executedAt: 1 })
      .lean(),
    CommissionAdjustment.find(adjustmentsMatch(start, end, extra))
      .sort({ doctorId: 1, effectiveAt: 1 })
      .lean(),
  ]);

  const patientIds = Array.from(
    new Set([
      ...procedures.map(p => String(p.patientId)),
      ...adjustments.map(a => String(a.patientId)),
    ]),
  );
  const patients = await Patient.find({ _id: { $in: patientIds } })
    .select('name processNumber')
    .lean();
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const doctorById = new Map(doctors.map(d => [String(d._id), d]));

  // Linhas por médico
  const byDoctor = new Map<string, Row[]>();
  const push = (doctorId: string, row: Row) => {
    const arr = byDoctor.get(doctorId) ?? [];
    arr.push(row);
    byDoctor.set(doctorId, arr);
  };
  for (const p of procedures) {
    const pat = patientById.get(String(p.patientId));
    const listPrice = p.listPriceCents ?? p.priceCents;
    const rule =
      p.commissionMode === 'fixed'
        ? `Fixo ${formatCents(p.commissionFixedCents ?? 0)}`
        : `${Math.round(p.commissionRate * 10000) / 100}%${p.commissionSource ? ` · ${SOURCE_LABEL[p.commissionSource] ?? p.commissionSource}` : ''}`;
    push(String(p.doctorId), {
      key: `p-${String(p._id)}`,
      date: (p.executedAt ?? p.createdAt) as Date,
      processNumber: pat ? String(pat.processNumber) : '—',
      patientName: pat?.name ?? '(paciente removido)',
      category: p.categorySnapshot ?? '—',
      description:
        p.nameSnapshot +
        (p.toothNumbers?.length
          ? ` (dentes ${p.toothNumbers.join(', ')})`
          : ''),
      listPriceCents: listPrice,
      discountCents: p.discountCents ?? 0,
      priceCents: p.priceCents,
      costCents: p.costCents ?? 0,
      baseCents: p.commissionBaseCents ?? p.priceCents,
      rule,
      commissionCents: p.commissionCents,
      isAdjustment: false,
      note:
        p.status === 'void'
          ? `Anulado após fecho (${p.voidedAt ? lisbonDate(p.voidedAt as Date) : ''})`
          : null,
    });
  }
  for (const a of adjustments) {
    const pat = patientById.get(String(a.patientId));
    push(String(a.doctorId), {
      key: `a-${String(a._id)}`,
      date: a.effectiveAt as Date,
      processNumber: pat ? String(pat.processNumber) : '—',
      patientName: pat?.name ?? '(paciente removido)',
      category: a.categorySnapshot ?? '—',
      description: `ESTORNO — ${a.descriptionSnapshot}`,
      listPriceCents: a.priceCents,
      discountCents: 0,
      priceCents: a.priceCents,
      costCents: a.costCents,
      baseCents: a.commissionBaseCents,
      rule: a.reason === 'invoice-void' ? 'Nota de crédito' : 'Anulação',
      commissionCents: a.commissionCents,
      isAdjustment: true,
      note: a.originalExecutedAt
        ? `Ato de ${lisbonDate(a.originalExecutedAt as Date)}${a.note ? ` — ${a.note}` : ''}`
        : (a.note ?? null),
    });
  }

  const doctorIds = Array.from(byDoctor.keys()).sort((a, b) =>
    (doctorById.get(a)?.name ?? '').localeCompare(
      doctorById.get(b)?.name ?? '',
    ),
  );

  const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  const csvHeaders = [
    'Data',
    'Nº paciente',
    'Nome',
    'Categoria',
    'Descrição',
    'PVP (€)',
    'Desconto (€)',
    'Valor cobrado (€)',
    'Custo (€)',
    'Valor real (€)',
    'Regra',
    'Remuneração (€)',
    'Nota',
  ];
  const csvRow = (r: Row) => [
    lisbonDate(r.date),
    r.processNumber,
    r.patientName,
    r.category,
    r.description,
    eur(r.listPriceCents),
    eur(r.discountCents),
    eur(r.priceCents),
    eur(r.costCents),
    eur(r.baseCents),
    r.rule,
    eur(r.commissionCents),
    r.note ?? '',
  ];

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
  const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
  const td: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
    verticalAlign: 'top',
  };
  const tdNum: React.CSSProperties = {
    ...td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
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
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = {
      mes,
      medico: doctorFilter,
      clinica: clinicFilter,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/relatorios/comissoes?${p.toString()}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <Link
          href={`/admin/relatorios?mes=${mes}`}
          style={{ fontSize: '13px', color: '#6A7186', textDecoration: 'none' }}
        >
          ← Relatórios
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
              Remuneração detalhada
            </h1>
            <p
              style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}
            >
              {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {/* Filtros (links — sem JS) */}
            <Link
              href={qs({ clinica: '' })}
              style={{
                ...navBtn,
                ...(clinicFilter
                  ? {}
                  : { backgroundColor: '#2743A6', color: '#FFFFFF' }),
              }}
            >
              Ambas
            </Link>
            {clinics.map(c => (
              <Link
                key={String(c._id)}
                href={qs({ clinica: String(c._id) })}
                style={{
                  ...navBtn,
                  ...(clinicFilter === String(c._id)
                    ? { backgroundColor: '#2743A6', color: '#FFFFFF' }
                    : {}),
                }}
              >
                {c.name}
              </Link>
            ))}
            <span style={{ width: 8 }} />
            <Link
              href={qs({ mes: shiftMonth(mes, -1) })}
              style={navBtn}
              aria-label='Mês anterior'
            >
              <ChevronLeft size={16} />
            </Link>
            <Link
              href={qs({ mes: current })}
              style={{
                ...navBtn,
                backgroundColor: mes === current ? '#2743A6' : '#FFFFFF',
                color: mes === current ? '#FFFFFF' : '#1B2A6B',
              }}
            >
              Mês atual
            </Link>
            <Link
              href={qs({ mes: shiftMonth(mes, 1) })}
              style={navBtn}
              aria-label='Mês seguinte'
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {/* Filtro por médico */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <Link
          href={qs({ medico: '' })}
          style={{
            ...navBtn,
            fontSize: '12px',
            padding: '6px 10px',
            ...(doctorFilter ? {} : { backgroundColor: '#EEF2FF' }),
          }}
        >
          Todos os profissionais
        </Link>
        {doctors.map(d => (
          <Link
            key={String(d._id)}
            href={qs({ medico: String(d._id) })}
            style={{
              ...navBtn,
              fontSize: '12px',
              padding: '6px 10px',
              ...(doctorFilter === String(d._id)
                ? { backgroundColor: '#EEF2FF' }
                : {}),
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: (d.color as string) ?? '#C7CEE0',
                marginRight: 6,
              }}
            />
            {d.name}
          </Link>
        ))}
      </div>

      {doctorIds.length === 0 && (
        <div
          style={{
            ...card,
            padding: '20px',
            fontSize: '14px',
            color: '#6A7186',
          }}
        >
          Sem atos nem estornos neste mês para os filtros escolhidos.
        </div>
      )}

      {doctorIds.map(docId => {
        const rows = byDoctor.get(docId) ?? [];
        const d = doctorById.get(docId);
        const sum = (f: (r: Row) => number) =>
          rows.reduce((s, r) => s + f(r), 0);
        const totalCommission = sum(r => r.commissionCents);
        return (
          <div key={docId} style={card}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid #EEF1F8',
              }}
            >
              <span
                style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}
              >
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
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6A7186',
                  }}
                >
                  {rows.filter(r => !r.isAdjustment).length} ato(s)
                  {rows.some(r => r.isAdjustment)
                    ? ` · ${rows.filter(r => r.isAdjustment).length} estorno(s)`
                    : ''}
                </span>
              </span>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                  }}
                >
                  A pagar: {formatCents(totalCommission)}
                </span>
                <ExportCsvButton
                  filename={`remuneracao-${(d?.name ?? 'profissional').replace(/\s+/g, '-').toLowerCase()}-${mes}.csv`}
                  headers={csvHeaders}
                  rows={rows.map(csvRow)}
                />
              </div>
            </div>
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
                    <th style={th}>Data</th>
                    <th style={th}>Nº</th>
                    <th style={th}>Paciente</th>
                    <th style={th}>Categoria</th>
                    <th style={th}>Descrição</th>
                    <th style={thNum}>PVP</th>
                    <th style={thNum}>Desc.</th>
                    <th style={thNum}>Cobrado</th>
                    <th style={thNum}>Custo</th>
                    <th style={thNum}>Valor real</th>
                    <th style={th}>Regra</th>
                    <th style={thNum}>Remuneração</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.key}
                      style={{
                        backgroundColor: r.isAdjustment
                          ? '#FDF3F2'
                          : 'transparent',
                      }}
                    >
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {lisbonDate(r.date)}
                      </td>
                      <td style={td}>{r.processNumber}</td>
                      <td style={td}>{r.patientName}</td>
                      <td style={{ ...td, fontSize: '12px', color: '#6A7186' }}>
                        {r.category}
                      </td>
                      <td style={td}>
                        {r.description}
                        {r.note && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: '11px',
                              color: r.isAdjustment ? '#B3261E' : '#9AA1B4',
                            }}
                          >
                            {r.note}
                          </span>
                        )}
                      </td>
                      <td style={tdNum}>{formatCents(r.listPriceCents)}</td>
                      <td
                        style={{
                          ...tdNum,
                          color: r.discountCents > 0 ? '#0F7B4D' : '#9AA1B4',
                        }}
                      >
                        {r.discountCents > 0
                          ? `−${formatCents(r.discountCents)}`
                          : '—'}
                      </td>
                      <td style={tdNum}>{formatCents(r.priceCents)}</td>
                      <td style={tdNum}>{formatCents(r.costCents)}</td>
                      <td style={{ ...tdNum, fontWeight: 600 }}>
                        {formatCents(r.baseCents)}
                      </td>
                      <td
                        style={{
                          ...td,
                          fontSize: '12px',
                          color: '#6A7186',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.rule}
                      </td>
                      <td
                        style={{
                          ...tdNum,
                          fontWeight: 700,
                          color: r.commissionCents < 0 ? '#B3261E' : '#1B2A6B',
                        }}
                      >
                        {formatCents(r.commissionCents)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#F8F9FD' }}>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={5}>
                      Total
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>
                      {formatCents(sum(r => r.listPriceCents))}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>
                      {formatCents(-sum(r => r.discountCents))}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>
                      {formatCents(sum(r => r.priceCents))}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>
                      {formatCents(sum(r => r.costCents))}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>
                      {formatCents(sum(r => r.baseCents))}
                    </td>
                    <td style={td} />
                    <td style={{ ...tdNum, fontWeight: 700 }}>
                      {formatCents(totalCommission)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Valor real = valor cobrado − custo direto (base da percentagem). Regras
        fixas pagam o valor acordado independentemente da base. Estornos são
        anulações, feitas neste mês, de atos de meses já fechados.
      </p>
    </div>
  );
}
