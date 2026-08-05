// 📄 src/app/admin/faturacao/[id]/page.tsx
// =============================================================================
// CDC Manager — Faturação: detalhe do documento
// -----------------------------------------------------------------------------
// Read-only: cabeçalho (nº/estado/datas), paciente + NIF do documento,
// linhas com snapshots imutáveis, total, referências Moloni quando emitida
// (nº certificado, ATCUD, série) e bloco de anulação quando anulada.
// O botão "Emitir no Moloni" pluga aqui no Sprint 4 (pós-aprovação).
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import mongoose from 'mongoose';
import Invoice, { type InvoiceStatus } from '@/models/Invoice';
import Patient from '@/models/Patient';
import { getClinicById } from '@/models/Clinic';
import User from '@/models/User';
import { formatCents } from '@/lib/commissions';
import { INVOICE_STATUS_LABEL } from '@/lib/labels';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documento' };

const STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  'awaiting-emission': 'warning',
  issued: 'success',
  pending: 'info',
  voided: 'danger',
};

function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
      <span style={{ width: 150, color: '#6A7186', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: '#1C2233', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  if (!mongoose.isValidObjectId(id)) notFound();

  await dbConnect();
  const inv = await Invoice.findById(id).lean();
  if (!inv) notFound();

  const [patient, clinic, issuer] = await Promise.all([
    Patient.findById(inv.patientId).select('name processNumber nif').lean(),
    getClinicById(String(inv.clinicId)),
    User.findById(inv.issuedByUserId).select('name').lean(),
  ]);

  const docLabel =
    inv.moloniDocumentNumber ??
    `Interno #${String(inv._id).slice(-6).toUpperCase()}`;
  const when = (inv.paidAt ?? inv.createdAt) as Date;

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: 860,
      }}
    >
      <div>
        <Link
          href='/admin/faturacao'
          style={{
            fontSize: '13px',
            color: '#6A7186',
            textDecoration: 'none',
          }}
        >
          ← Faturação
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '6px',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            {docLabel}
          </h1>
          <Badge variant={STATUS_VARIANT[inv.status]}>
            {INVOICE_STATUS_LABEL[inv.status]}
          </Badge>
        </div>
      </div>

      {inv.status === 'awaiting-emission' && (
        <div
          style={{
            backgroundColor: '#FEF3E0',
            border: '1px solid #F2D9AE',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#B06000',
          }}
        >
          Pagamento registado no balcão — o documento fiscal certificado será
          emitido quando a conta Moloni ativar. Nada se perde: a emissão
          pendente fica nesta fila.
        </div>
      )}

      {/* Identificação */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <InfoRow
          label='Paciente'
          value={
            patient
              ? `${patient.name} (proc. ${patient.processNumber})`
              : 'Paciente removido'
          }
        />
        <InfoRow
          label='NIF no documento'
          value={inv.nifSnapshot ?? 'Consumidor final'}
        />
        <InfoRow label='Clínica' value={clinic?.name ?? '—'} />
        <InfoRow label='Data' value={lisbonDateTime(when)} />
        <InfoRow
          label='Meio de pagamento'
          value={PAYMENT_METHOD_LABEL[inv.paymentMethod as PaymentMethod]}
        />
        <InfoRow label='Registado por' value={issuer?.name ?? '—'} />
      </div>

      {/* Linhas */}
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
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: '#6A7186',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                Descrição
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: '#6A7186',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F4F6FB' }}>
                <td
                  style={{
                    padding: '10px 14px',
                    fontSize: '14px',
                    color: '#1C2233',
                  }}
                >
                  {l.description}
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    fontSize: '14px',
                    color: '#1C2233',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCents(l.priceCents)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                style={{
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                }}
              >
                Total (IVA isento — art. 9.º CIVA)
              </td>
              <td
                style={{
                  padding: '12px 14px',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatCents(inv.totalCents)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Referências fiscais (quando emitida) */}
      {inv.moloniDocumentId !== null && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <h2
            style={{
              margin: '0 0 4px',
              fontSize: '14px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Documento certificado (Moloni)
          </h2>
          <InfoRow label='Número' value={inv.moloniDocumentNumber ?? '—'} />
          <InfoRow label='ATCUD' value={inv.atcud ?? '—'} />
          <InfoRow label='ID Moloni' value={String(inv.moloniDocumentId)} />
        </div>
      )}

      {/* Anulação */}
      {inv.status === 'voided' && (
        <div
          style={{
            backgroundColor: '#FDEDED',
            border: '1px solid #F3C4C1',
            borderRadius: '14px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <h2
            style={{
              margin: '0 0 4px',
              fontSize: '14px',
              fontWeight: 700,
              color: '#B3261E',
            }}
          >
            Documento anulado
          </h2>
          <InfoRow
            label='Anulada em'
            value={inv.voidedAt ? lisbonDateTime(inv.voidedAt as Date) : '—'}
          />
          <InfoRow label='Motivo' value={inv.voidReason ?? '—'} />
          <InfoRow
            label='Nota de crédito'
            value={
              inv.creditNoteMoloniId !== null
                ? `Moloni #${inv.creditNoteMoloniId}`
                : '—'
            }
          />
        </div>
      )}
    </div>
  );
}
