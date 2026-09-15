// 📄 src/components/faturacao/PatientAccount.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: Conta-corrente (Fase 5C — "Extratos de
// Contas Correntes" do Dentoral). Server component: documentos do paciente
// com total, pago, em dívida, e saldo global; atos concluídos por cobrar.
// =============================================================================

import Link from 'next/link';
import { dbConnect } from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Procedure from '@/models/Procedure';
import { formatCents } from '@/lib/commissions';
import { INVOICE_STATUS_LABEL } from '@/lib/labels';
import { Badge } from '@/components/ui/Badge';

const ptDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);

export async function PatientAccount({ patientId }: { patientId: string }) {
  await dbConnect();
  const [invoices, unbilled] = await Promise.all([
    Invoice.find({ patientId })
      .sort({ createdAt: -1 })
      .select(
        'createdAt status totalCents paidCents payments moloniDocumentNumber',
      )
      .lean(),
    Procedure.find({ patientId, status: 'completed', invoiceId: null })
      .select('nameSnapshot priceCents executedAt')
      .lean(),
  ]);
  const active = invoices.filter(i => i.status !== 'voided');
  const totalBilled = active.reduce((a, i) => a + i.totalCents, 0);
  const totalPaid = active.reduce(
    (a, i) => a + (i.paidCents ?? i.totalCents),
    0,
  );
  const due = totalBilled - totalPaid;
  const unbilledCents = unbilled.reduce((a, p) => a + p.priceCents, 0);

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
    padding: '9px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
  };
  const kpi = (label: string, value: string, color = '#1B2A6B') => (
    <div
      style={{
        flex: '1 1 140px',
        border: '1px solid #EEF1F8',
        borderRadius: '10px',
        padding: '10px 14px',
      }}
    >
      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>{label}</p>
      <p
        style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color }}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi('Faturado', formatCents(totalBilled))}
        {kpi('Pago', formatCents(totalPaid), '#0F7B4D')}
        {kpi('Em dívida', formatCents(due), due > 0 ? '#B3261E' : '#0F7B4D')}
        {kpi(
          'Por faturar (atos concluídos)',
          formatCents(unbilledCents),
          unbilledCents > 0 ? '#B26A00' : '#1B2A6B',
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Data</th>
              <th style={th}>Documento</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={{ ...th, textAlign: 'right' }}>Pago</th>
              <th style={{ ...th, textAlign: 'right' }}>Em dívida</th>
              <th style={th}>Recibos</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td style={{ ...td, color: '#6A7186' }} colSpan={7}>
                  Sem documentos.
                </td>
              </tr>
            )}
            {invoices.map(i => {
              const paid =
                i.status === 'voided' ? 0 : (i.paidCents ?? i.totalCents);
              const d = i.status === 'voided' ? 0 : i.totalCents - paid;
              return (
                <tr
                  key={String(i._id)}
                  style={{ opacity: i.status === 'voided' ? 0.55 : 1 }}
                >
                  <td style={td}>{ptDate(i.createdAt as Date)}</td>
                  <td style={td}>
                    <Link
                      href={`/admin/faturacao/${String(i._id)}`}
                      style={{
                        color: '#2743A6',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {i.moloniDocumentNumber ??
                        `Interno #${String(i._id).slice(-6).toUpperCase()}`}
                    </Link>
                  </td>
                  <td style={td}>
                    <Badge
                      variant={
                        d > 0
                          ? 'warning'
                          : i.status === 'voided'
                            ? 'danger'
                            : 'success'
                      }
                    >
                      {d > 0
                        ? 'Saldo em dívida'
                        : INVOICE_STATUS_LABEL[
                            i.status as keyof typeof INVOICE_STATUS_LABEL
                          ]}
                    </Badge>
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCents(i.totalCents)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: '#0F7B4D',
                    }}
                  >
                    {formatCents(paid)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: d > 0 ? '#B3261E' : '#9AA1B4',
                      fontWeight: d > 0 ? 700 : 400,
                    }}
                  >
                    {formatCents(d)}
                  </td>
                  <td style={{ ...td, fontSize: '12px', color: '#6A7186' }}>
                    {(i.payments ?? []).length ||
                      (i.status === 'voided' ? 0 : 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {unbilled.length > 0 && (
        <p style={{ margin: 0, fontSize: '12.5px', color: '#B26A00' }}>
          {unbilled.length} ato(s) concluído(s) por cobrar (
          {formatCents(unbilledCents)}) — ver{' '}
          <Link href='/admin/cobranca' style={{ color: '#2743A6' }}>
            Cobrança
          </Link>
          .
        </p>
      )}
    </div>
  );
}
