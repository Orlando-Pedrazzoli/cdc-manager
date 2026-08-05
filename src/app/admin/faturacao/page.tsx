// 📄 src/app/admin/faturacao/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Faturação
// -----------------------------------------------------------------------------
// LISTAGEM dos documentos internos (espelhos Invoice): navegação mensal
// (?mes=YYYY-MM, padrão dos Relatórios), clínica (?clinic=) e estado
// (?estado=). Cada linha abre o detalhe com as linhas do documento.
//
// O CDC Manager NÃO é o emissor fiscal — o Moloni é (Sprint 4, pós-
// aprovação). Enquanto a conta não ativa, os checkouts ficam
// 'awaiting-emission': pagamento registado, documento certificado por
// emitir — o botão "emitir pendentes" pluga aqui quando o Moloni ligar.
//
// Filtro mensal por createdAt: o checkout cria o documento no momento do
// pagamento (createdAt ≈ paidAt no fluxo normal) e cobre uniformemente
// 'pending' (paidAt null) e anuladas.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Link from 'next/link';
import Invoice, { INVOICE_STATUS, type InvoiceStatus } from '@/models/Invoice';
import Patient from '@/models/Patient';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc } from '@/lib/availability';
import { formatCents } from '@/lib/commissions';
import { INVOICE_STATUS_LABEL } from '@/lib/labels';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faturação' };

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

const STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  'awaiting-emission': 'warning',
  issued: 'success',
  pending: 'info',
  voided: 'danger',
};

function currentMesLisbon(): string {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}`;
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthBoundsUtc(mes: string): [Date, Date] {
  return [
    lisbonToUtc(`${mes}-01`, 0),
    lisbonToUtc(`${shiftMonth(mes, 1)}-01`, 0),
  ];
}

function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

export default async function FaturacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; clinic?: string; estado?: string }>;
}) {
  const { mes: mesParam, clinic: clinicParam, estado } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam ?? '')
    ? (mesParam as string)
    : currentMesLisbon();
  const [start, end] = monthBoundsUtc(mes);
  const [y, m] = mes.split('-').map(Number);
  const mesLabel = `${MONTH_NAMES[m - 1].charAt(0).toUpperCase()}${MONTH_NAMES[m - 1].slice(1)} de ${y}`;

  const statusFilter = (INVOICE_STATUS as readonly string[]).includes(
    estado ?? '',
  )
    ? (estado as InvoiceStatus)
    : null;

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === clinicParam) ??
    clinics.find(c => c.slug === 'colombo') ??
    clinics[0];
  if (!clinic) return null;

  // Documentos do mês na clínica (índice {clinicId, status, paidAt} cobre
  // parcialmente; volume mensal por clínica é pequeno — createdAt chega)
  const invoices = await Invoice.find({
    clinicId: clinic._id,
    createdAt: { $gte: start, $lt: end },
    ...(statusFilter ? { status: statusFilter } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const patientIds = [...new Set(invoices.map(i => String(i.patientId)))];
  const patients = patientIds.length
    ? await Patient.find({ _id: { $in: patientIds } })
        .select('name processNumber')
        .lean()
    : [];
  const patientById = new Map(patients.map(p => [String(p._id), p]));

  // Totais do conjunto filtrado + repartição por estado (anuladas fora do
  // total cobrado — dinheiro devolvido não é receita)
  const byStatus = new Map<InvoiceStatus, { count: number; cents: number }>();
  for (const inv of invoices) {
    const cur = byStatus.get(inv.status) ?? { count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += inv.totalCents;
    byStatus.set(inv.status, cur);
  }
  const collectedCents = invoices
    .filter(i => i.status !== 'voided' && i.status !== 'pending')
    .reduce((acc, i) => acc + i.totalCents, 0);

  const qs = (over: Partial<{ mes: string; estado: string | null }>) => {
    const params = new URLSearchParams();
    params.set('clinic', clinic.slug);
    params.set('mes', over.mes ?? mes);
    const e = over.estado === undefined ? statusFilter : over.estado;
    if (e) params.set('estado', e);
    return `/admin/faturacao?${params.toString()}`;
  };

  const pillStyle = (active: boolean) =>
    ({
      padding: '6px 12px',
      borderRadius: '999px',
      fontSize: '13px',
      fontWeight: 600,
      textDecoration: 'none',
      backgroundColor: active ? '#2743A6' : '#FFFFFF',
      color: active ? '#FFFFFF' : '#454C63',
      border: active ? '1px solid #2743A6' : '1px solid #E4E8F2',
    }) as const;

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      {/* Cabeçalho + clínica */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Faturação
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
            Documentos do balcão. A emissão fiscal certificada ativa com o
            Moloni — pendentes ficam «Aguarda emissão».
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {clinics.map(c => (
            <Link
              key={c.slug}
              href={`/admin/faturacao?clinic=${c.slug}&mes=${mes}${statusFilter ? `&estado=${statusFilter}` : ''}`}
              style={pillStyle(c.slug === clinic.slug)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Navegação mensal (padrão dos Relatórios) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href={qs({ mes: shiftMonth(mes, -1) })} style={pillStyle(false)}>
          ‹
        </Link>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1B2A6B' }}>
          {mesLabel}
        </span>
        <Link href={qs({ mes: shiftMonth(mes, 1) })} style={pillStyle(false)}>
          ›
        </Link>
        {mes !== currentMesLisbon() && (
          <Link href={qs({ mes: currentMesLisbon() })} style={pillStyle(false)}>
            Mês atual
          </Link>
        )}

        {/* Filtro de estado */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <Link href={qs({ estado: null })} style={pillStyle(!statusFilter)}>
            Todos
          </Link>
          {INVOICE_STATUS.map(s => (
            <Link
              key={s}
              href={qs({ estado: s })}
              style={pillStyle(statusFilter === s)}
            >
              {INVOICE_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
      </div>

      {/* Resumo do conjunto filtrado */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '14px 18px',
            minWidth: 180,
          }}
        >
          <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
            Cobrado no conjunto
          </p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '20px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            {formatCents(collectedCents)}
          </p>
        </div>
        {[...byStatus.entries()].map(([s, v]) => (
          <div
            key={s}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEF1F8',
              borderRadius: '14px',
              padding: '14px 18px',
              minWidth: 160,
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
              {INVOICE_STATUS_LABEL[s]}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '16px',
                fontWeight: 700,
                color: '#1C2233',
              }}
            >
              {v.count} · {formatCents(v.cents)}
            </p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8F9FD' }}>
              {['Data', 'Documento', 'Paciente', 'Meio', 'Total', 'Estado'].map(
                (h, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: i >= 4 ? 'right' : 'left',
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      color: '#6A7186',
                      borderBottom: '1px solid #EEF1F8',
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '28px 14px',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#6A7186',
                  }}
                >
                  Sem documentos neste período.
                </td>
              </tr>
            )}
            {invoices.map(inv => {
              const p = patientById.get(String(inv.patientId));
              const when = (inv.paidAt ?? inv.createdAt) as Date;
              return (
                <tr
                  key={String(inv._id)}
                  style={{ borderBottom: '1px solid #F4F6FB' }}
                >
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: '13px',
                      color: '#454C63',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {lisbonDateTime(when)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/admin/faturacao/${String(inv._id)}`}
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#2743A6',
                        textDecoration: 'none',
                      }}
                    >
                      {inv.moloniDocumentNumber ??
                        `Interno #${String(inv._id).slice(-6).toUpperCase()}`}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: '13px',
                      color: '#454C63',
                    }}
                  >
                    {p?.name ?? 'Paciente removido'}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: '13px',
                      color: '#454C63',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {PAYMENT_METHOD_LABEL[inv.paymentMethod as PaymentMethod]}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#1C2233',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatCents(inv.totalCents)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <Badge variant={STATUS_VARIANT[inv.status]}>
                      {INVOICE_STATUS_LABEL[inv.status]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
