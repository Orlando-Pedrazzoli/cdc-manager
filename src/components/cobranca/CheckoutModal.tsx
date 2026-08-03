// 📄 src/components/cobranca/CheckoutModal.tsx
// =============================================================================
// CDC Manager — Cobrança: modal de checkout (Client Component)
// -----------------------------------------------------------------------------
// A receção seleciona os atos a cobrar (todos por defeito — o paciente pode
// pagar só parte hoje), escolhe o meio de pagamento e regista. NIF
// pré-preenchido da ficha (editável; vazio = consumidor final).
// Fluxo incremental de balcão → fica na página (a receção cobra vários
// pacientes em sequência).
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ReceiptEuro } from 'lucide-react';
import { checkoutAction, type BillingActionState } from '@/actions/billing';
import { formatCents } from '@/lib/commissions';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export interface BillableAct {
  id: string;
  name: string;
  priceCents: number;
  executedAtLabel: string;
  doctorName: string;
}

export function CheckoutModal({
  clinicId,
  patientId,
  patientName,
  patientNif,
  acts,
}: {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientNif: string | null;
  acts: BillableAct[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(acts.map(a => a.id)),
  );
  const [method, setMethod] = useState<PaymentMethod>('card');

  const [state, action, pending] = useActionState<BillingActionState, FormData>(
    checkoutAction,
    undefined,
  );
  const handled = useRef<BillingActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) {
      toast.success('Cobrança registada — documento fiscal aguarda Moloni', {
        duration: 6000,
      });
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalCents = useMemo(
    () =>
      acts
        .filter(a => selected.has(a.id))
        .reduce((s, a) => s + a.priceCents, 0),
    [acts, selected],
  );

  return (
    <>
      <Button type='button' onClick={() => setOpen(true)}>
        <ReceiptEuro size={15} style={{ marginRight: 6 }} />
        Cobrar
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Cobrar — ${patientName}`}
      >
        <form
          action={action}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <input type='hidden' name='clinicId' value={clinicId} />
          <input type='hidden' name='patientId' value={patientId} />
          <input
            type='hidden'
            name='procedureIds'
            value={JSON.stringify([...selected])}
          />

          {/* Atos selecionáveis */}
          <div
            style={{
              border: '1px solid #EEF1F8',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            {acts.map(a => (
              <label
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 14px',
                  borderBottom: '1px solid #F4F6FB',
                  cursor: 'pointer',
                  opacity: selected.has(a.id) ? 1 : 0.55,
                }}
              >
                <input
                  type='checkbox'
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                  style={{ width: 15, height: 15, accentColor: '#2743A6' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1B2A6B',
                    }}
                  >
                    {a.name}
                  </p>
                  <p
                    style={{
                      margin: '1px 0 0',
                      fontSize: '11px',
                      color: '#6A7186',
                    }}
                  >
                    {a.executedAtLabel} · {a.doctorName}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCents(a.priceCents)}
                </span>
              </label>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            <Select
              name='paymentMethod'
              label='Meio de pagamento *'
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod)}
              required
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
            <Input
              name='nif'
              label='NIF no documento'
              defaultValue={patientNif ?? ''}
              placeholder='Vazio = consumidor final'
              inputMode='numeric'
              maxLength={9}
            />
          </div>

          <div
            style={{
              backgroundColor: '#F4F6FB',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', color: '#3D4257' }}>
              {selected.size} ato{selected.size === 1 ? '' : 's'} selecionado
              {selected.size === 1 ? '' : 's'}
            </span>
            <span
              style={{ fontSize: '18px', fontWeight: 700, color: '#1B2A6B' }}
            >
              {formatCents(totalCents)}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
            O documento fiscal certificado é emitido automaticamente quando a
            conta Moloni for ativada — o pagamento fica registado desde já.
          </p>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            <Button
              type='button'
              variant='secondary'
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type='submit' disabled={pending || selected.size === 0}>
              {pending
                ? 'A registar…'
                : `Registar cobrança (${formatCents(totalCents)})`}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
