// 📄 src/lib/checkout-payments.ts
// =============================================================================
// CDC Manager — Pagamento em vários meios e entradas de caixa
// -----------------------------------------------------------------------------
// Ponto 23 (Giulia, 27/11/2026): "Nas opções de pagamento, poder dividir o
// valor por formas de pagamento diferentes. Exemplo: o paciente paga 10 € em
// dinheiro e 30 € em multibanco."
//
// Como fica: a cobrança tem o meio principal e, opcionalmente, um SEGUNDO
// meio com o seu valor. O que é pago agora divide-se em dois pagamentos — o
// segundo meio leva o valor indicado, o principal leva o resto. Cada
// pagamento é uma linha em `invoice.payments` (e um recibo no Moloni, como
// já acontecia com os pagamentos em 2x).
//
// O Diário de caixa passa a somar os PAGAMENTOS (cada um no seu dia e no seu
// meio) em vez do total do documento no meio principal — com pagamento
// parcial ou em dois meios, a conta antiga punha tudo num só meio e num só
// dia, e a caixa não batia.
//
// Funções puras, testadas em scripts/tests/ronda-9c-fase-b.test.ts.
// =============================================================================

import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from '@/lib/domain';

export interface CheckoutPaymentPart {
  amountCents: number;
  method: PaymentMethod;
}

/** "12,50" / "12.5" → 1250; '' → null; inválido → NaN */
export function parseEurosField(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().replace(/\s/g, '').replace('€', '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Divide o que é pago agora pelos meios indicados.
 * · sem segundo meio → um pagamento no meio principal (ou nenhum, se 0);
 * · com segundo meio → o segundo leva `secondCents`, o principal o resto.
 * Devolve { error } quando os dados não fazem sentido — nunca "arredonda"
 * em silêncio um valor que a receção escreveu.
 */
export function splitCheckoutPayments(input: {
  paidNowCents: number;
  method: PaymentMethod;
  secondMethod: PaymentMethod | null;
  secondCents: number | null;
}): { parts: CheckoutPaymentPart[] } | { error: string } {
  const { paidNowCents, method, secondMethod, secondCents } = input;
  if (!Number.isInteger(paidNowCents) || paidNowCents < 0)
    return { error: 'Valor pago inválido.' };
  const hasSecond = secondMethod != null || (secondCents != null && secondCents !== 0);
  if (!hasSecond)
    return {
      parts: paidNowCents > 0 ? [{ amountCents: paidNowCents, method }] : [],
    };
  if (secondMethod == null)
    return { error: 'Escolha o segundo meio de pagamento.' };
  if (secondCents == null || !Number.isInteger(secondCents) || secondCents <= 0)
    return { error: 'Indique o valor pago no segundo meio.' };
  if (secondMethod === method)
    return { error: 'O segundo meio de pagamento tem de ser diferente do primeiro.' };
  if (secondCents >= paidNowCents)
    return {
      error:
        'O valor no segundo meio tem de ser menor do que o valor pago agora (o resto fica no primeiro meio).',
    };
  return {
    parts: [
      { amountCents: paidNowCents - secondCents, method },
      { amountCents: secondCents, method: secondMethod },
    ],
  };
}

/** "Numerário" ou "Numerário + Multibanco / cartão" (pela ordem dos pagamentos) */
export function paymentMethodsLabel(inv: {
  paymentMethod?: string | null;
  payments?: readonly { method?: string | null }[] | null;
}): string {
  const seen: string[] = [];
  for (const p of inv.payments ?? [])
    if (p.method && !seen.includes(p.method)) seen.push(p.method);
  if (seen.length === 0 && inv.paymentMethod) seen.push(inv.paymentMethod);
  if (seen.length === 0) return '—';
  return seen
    .map(m => PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m)
    .join(' + ');
}

export interface CashEntry {
  paidAt: Date;
  method: string;
  amountCents: number;
}

/**
 * Entradas de caixa de um documento: uma por pagamento. Documentos antigos
 * sem `payments` (anteriores aos pagamentos parciais) contam pelo total, na
 * data e no meio do documento — como sempre contaram.
 */
export function cashEntries(inv: {
  paidAt?: Date | null;
  paymentMethod?: string | null;
  totalCents: number;
  payments?:
    | readonly { paidAt?: Date | null; method?: string | null; amountCents?: number | null }[]
    | null;
}): CashEntry[] {
  if (inv.payments == null) {
    return inv.paidAt && inv.paymentMethod
      ? [{ paidAt: inv.paidAt, method: inv.paymentMethod, amountCents: inv.totalCents }]
      : [];
  }
  const out: CashEntry[] = [];
  for (const p of inv.payments)
    if (p.paidAt && p.method && typeof p.amountCents === 'number' && p.amountCents > 0)
      out.push({ paidAt: p.paidAt, method: p.method, amountCents: p.amountCents });
  return out;
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}
