// 📄 src/components/faturacao/PaymentsPanel.tsx
// =============================================================================
// CDC Manager — Fatura: pagamentos (recibos) + registar pagamento (Fase 5C)
// =============================================================================

'use client';

import { startTransition, useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  registerPaymentAction,
  type RegisterPaymentState,
} from '@/actions/billing';
import { formatCents } from '@/lib/commissions';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

export interface PaymentRow {
  id: string;
  amountCents: number;
  method: string;
  paidAtLabel: string;
  receivedBy: string;
  note: string | null;
}

export function PaymentsPanel({
  invoiceId,
  totalCents,
  paidCents,
  payments,
  canRegister,
}: {
  invoiceId: string;
  totalCents: number;
  paidCents: number;
  payments: PaymentRow[];
  canRegister: boolean;
}) {
  const router = useRouter();
  const due = totalCents - paidCents;
  const [state, action, pending] = useActionState<
    RegisterPaymentState,
    FormData
  >(registerPaymentAction, undefined);
  const handled = useRef<RegisterPaymentState>(undefined);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) {
      toast.error(state.error);
      return;
    }
    toast.success(
      state.dueCents > 0
        ? `Pagamento registado — saldo ${formatCents(state.dueCents)}`
        : 'Documento totalmente pago.',
    );
    router.refresh();
  }, [state, router]);

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '16px 18px',
  };
  const td: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
  };

  return (
    <div style={card}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Pagamentos / recibos
        </h2>
        <div style={{ display: 'flex', gap: 14, fontSize: '13px' }}>
          <span>
            Total <strong>{formatCents(totalCents)}</strong>
          </span>
          <span>
            Pago{' '}
            <strong style={{ color: '#0F7B4D' }}>
              {formatCents(paidCents)}
            </strong>
          </span>
          <span>
            Em dívida{' '}
            <strong style={{ color: due > 0 ? '#B3261E' : '#0F7B4D' }}>
              {formatCents(due)}
            </strong>
          </span>
        </div>
      </div>
      <div className='cdc-table-scroll'>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td style={{ ...td, color: '#6A7186' }}>
                  Sem pagamentos registados.
                </td>
              </tr>
            )}
            {payments.map((p, i) => (
              <tr key={p.id}>
                <td style={{ ...td, color: '#6A7186', whiteSpace: 'nowrap' }}>
                  Recibo {i + 1}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{p.paidAtLabel}</td>
                <td style={td}>
                  {PAYMENT_METHOD_LABEL[
                    p.method as keyof typeof PAYMENT_METHOD_LABEL
                  ] ?? p.method}
                </td>
                <td style={{ ...td, color: '#6A7186' }}>
                  {p.receivedBy}
                  {p.note ? ` · ${p.note}` : ''}
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCents(p.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canRegister && due > 0 && (
        <form
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => action(fd));
          }}
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 2fr auto',
            gap: 8,
            alignItems: 'end',
          }}
        >
          <input type='hidden' name='invoiceId' value={invoiceId} />
          <Input
            name='amountEuros'
            label='Valor (€) *'
            inputMode='decimal'
            required
            defaultValue={(due / 100).toFixed(2).replace('.', ',')}
          />
          <Select name='paymentMethod' label='Meio *' defaultValue='cash'>
            {PAYMENT_METHODS.map(m => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
          <Input
            name='note'
            label='Nota'
            placeholder='ex.: 2.ª prestação'
            maxLength={200}
          />
          <Button type='submit' loading={pending}>
            Registar pagamento
          </Button>
        </form>
      )}
    </div>
  );
}
