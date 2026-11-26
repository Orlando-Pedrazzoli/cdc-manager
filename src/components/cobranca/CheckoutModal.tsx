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

import { useActionState, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ReceiptEuro } from 'lucide-react';
import { checkoutAction, type BillingActionState } from '@/actions/billing';
import { formatCents } from '@/lib/commissions';
import {
  checkoutDiscountTotal,
  parseDiscountField,
} from '@/lib/checkout-discount';
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
  buttonLabel = 'Cobrar',
}: {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientNif: string | null;
  acts: BillableAct[];
  /** Texto do botão que abre o checkout (ex.: "Faturar" na conta-corrente) */
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(acts.map(a => a.id)),
  );
  const [method, setMethod] = useState<PaymentMethod>('card');
  // 5.ª ronda/05 (Victor, nov. 2026): "Confirmação antes de emitir, com o
  // resumo dos dados do documento, para evitar erros com um só clique."
  // 1.º passo = preencher; 2.º passo = rever o resumo e confirmar.
  const [review, setReview] = useState(false);
  const [nif, setNif] = useState(patientNif ?? '');

  // Efeitos do resultado no próprio callback da action (sem useEffect)
  const [, action, pending] = useActionState<BillingActionState, FormData>(
    async (prev, formData) => {
      const result = await checkoutAction(prev, formData);
      if (result && 'error' in result)
        toast.error(result.error, { duration: 7000 });
      if (result && 'success' in result) {
        toast.success('Cobrança registada — documento fiscal aguarda Moloni', {
          duration: 6000,
        });
        setOpen(false);
        setReview(false);
        router.refresh();
      }
      if (result && 'error' in result) setReview(false);
      return result;
    },
    undefined,
  );

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Respostas de 25/11 (A1): desconto no momento da faturação (% ou €)
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const grossCents = useMemo(
    () =>
      acts
        .filter(a => selected.has(a.id))
        .reduce((s, a) => s + a.priceCents, 0),
    [acts, selected],
  );
  const discountInfo = useMemo(() => {
    const parsed = parseDiscountField(discountMode, discountValue);
    if (parsed === 'invalid') {
      return {
        cents: 0,
        error:
          discountMode === 'percent'
            ? 'Indique uma percentagem entre 0 e 100'
            : 'Indique um valor em euros',
      };
    }
    if (!parsed) return { cents: 0, error: null };
    if (parsed.mode === 'amount' && parsed.cents > grossCents) {
      return { cents: 0, error: 'Maior do que o total dos atos' };
    }
    const cents = checkoutDiscountTotal(
      acts.filter(a => selected.has(a.id)).map(a => ({ id: a.id, priceCents: a.priceCents })),
      parsed,
    );
    if (cents >= grossCents && grossCents > 0) {
      return { cents: 0, error: 'O documento não pode ficar a 0,00 €' };
    }
    return { cents, error: null };
  }, [acts, selected, discountMode, discountValue, grossCents]);
  const discountCents = discountInfo.cents;
  const totalCents = grossCents - discountCents;
  const discountLabel =
    discountMode === 'percent' && discountCents > 0
      ? `${discountValue.trim().replace('%', '')}%`
      : null;
  const [paidNow, setPaidNow] = useState('');
  const partialInfo = useMemo(() => {
    const s = paidNow.trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    const cents = Math.round(n * 100);
    return cents < totalCents ? { paid: cents, due: totalCents - cents } : null;
  }, [paidNow, totalCents]);

  return (
    <>
      <Button type='button' onClick={() => setOpen(true)}>
        <ReceiptEuro size={15} style={{ marginRight: 6 }} />
        {buttonLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setReview(false);
        }}
        title={review ? `Confirmar cobrança — ${patientName}` : `Cobrar — ${patientName}`}
      >
        <form
          action={action}
          onSubmit={e => {
            // Enter num campo do 1.º passo nunca regista sem passar pelo resumo
            if (!review) {
              e.preventDefault();
              if (selected.size > 0 && !discountInfo.error) setReview(true);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <input type='hidden' name='clinicId' value={clinicId} />
          <input type='hidden' name='patientId' value={patientId} />
          <input
            type='hidden'
            name='procedureIds'
            value={JSON.stringify([...selected])}
          />

          {/* 5.ª ronda/05: resumo para confirmar (2.º passo) */}
          {review && (
            <div
              style={{
                border: '1px solid #C9D6F5',
                backgroundColor: '#F4F7FF',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: '13px',
                color: '#1C2233',
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: '#1B2A6B' }}>
                Confirme os dados antes de registar
              </p>
              <SummaryRow label='Paciente' value={patientName} />
              <SummaryRow
                label='NIF no documento'
                value={nif.trim() || 'Consumidor final (sem NIF)'}
                warn={!nif.trim()}
              />
              <div>
                <span style={{ color: '#6A7186' }}>Atos ({selected.size})</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {acts
                    .filter(a => selected.has(a.id))
                    .map(a => (
                      <li key={a.id}>
                        {a.name} — {formatCents(a.priceCents)}
                      </li>
                    ))}
                </ul>
              </div>
              {discountCents > 0 && (
                <>
                  <SummaryRow label='Soma dos atos' value={formatCents(grossCents)} />
                  <SummaryRow
                    label={`Desconto${discountLabel ? ` (${discountLabel})` : ''}`}
                    value={`−${formatCents(discountCents)}`}
                    warn
                  />
                </>
              )}
              <SummaryRow label='Total do documento' value={formatCents(totalCents)} strong />
              <SummaryRow
                label='Pago agora'
                value={`${formatCents(partialInfo ? partialInfo.paid : totalCents)} · ${PAYMENT_METHOD_LABEL[method]}`}
                strong
              />
              {partialInfo && (
                <SummaryRow label='Fica em dívida' value={formatCents(partialInfo.due)} warn />
              )}
            </div>
          )}

          {/* 1.º passo: os campos ficam no formulário (escondidos no 2.º) */}
          <div style={{ display: review ? 'none' : 'flex', flexDirection: 'column', gap: '14px' }}>
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
              value={nif}
              onChange={e => setNif(e.target.value)}
              placeholder='Vazio = consumidor final'
              inputMode='numeric'
              maxLength={9}
            />
            {/* Respostas de 25/11 (A1): desconto dado pela gestão ou receção */}
            <Select
              name='discountMode'
              label='Desconto em'
              value={discountMode}
              onChange={e => setDiscountMode(e.target.value as 'percent' | 'amount')}
            >
              <option value='percent'>Percentagem (%)</option>
              <option value='amount'>Valor (€)</option>
            </Select>
            <Input
              name='discountValue'
              label={discountMode === 'percent' ? 'Desconto (%)' : 'Desconto (€)'}
              inputMode='decimal'
              value={discountValue}
              onChange={e => setDiscountValue(e.target.value)}
              placeholder='Vazio = sem desconto'
              error={discountInfo.error ?? undefined}
              help={
                discountCents > 0
                  ? `Desconta ${formatCents(discountCents)} ao total dos atos selecionados`
                  : 'Aplica-se ao conjunto dos atos selecionados'
              }
            />
            {/* Fase 5C (P16): pagamento em 2x — vazio = paga tudo agora */}
            <Input
              name='paidNowEuros'
              label='Pago agora (€)'
              inputMode='decimal'
              value={paidNow}
              onChange={e => setPaidNow(e.target.value)}
              placeholder={(totalCents / 100).toFixed(2).replace('.', ',')}
              help={
                partialInfo
                  ? `Fica em dívida ${formatCents(partialInfo.due)} — regista-se depois na fatura`
                  : 'Vazio = valor total. Menos que o total = pagamento parcial'
              }
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
              {discountCents > 0 && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#6A7186',
                    marginRight: 8,
                  }}
                >
                  {formatCents(grossCents)} − {formatCents(discountCents)} =
                </span>
              )}
              {formatCents(totalCents)}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
            O documento fiscal certificado é emitido automaticamente quando a
            conta Moloni for ativada — o pagamento fica registado desde já.
          </p>

          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            {review ? (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={pending}
                  onClick={() => setReview(false)}
                >
                  Voltar e corrigir
                </Button>
                <Button type='submit' disabled={pending || selected.size === 0}>
                  {pending
                    ? 'A registar…'
                    : partialInfo
                      ? `Confirmar: registar ${formatCents(partialInfo.paid)} (fica ${formatCents(partialInfo.due)})`
                      : `Confirmar e registar (${formatCents(totalCents)})`}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type='button'
                  disabled={selected.size === 0 || !!discountInfo.error}
                  onClick={() => setReview(true)}
                >
                  Rever e confirmar ({formatCents(totalCents)})
                </Button>
              </>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#6A7186' }}>{label}</span>
      <span
        style={{
          fontWeight: strong || warn ? 700 : 600,
          color: warn ? '#9A6700' : '#1C2233',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}
