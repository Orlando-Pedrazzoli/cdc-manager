// 📄 src/lib/checkout-discount.ts
// =============================================================================
// CDC Manager — Desconto no momento da faturação: regras puras
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta A1): "O desconto deve ser aplicado no momento
// da faturação. Gestão e receção devem conseguir aplicar desconto por
// percentagem ou por valor." (O médico continua sem desconto — 9.ª ronda/11.)
//
// O desconto é dado sobre o conjunto dos atos que estão a ser cobrados e fica
// gravado ATO A ATO, porque é por ato que o sistema guarda o valor cobrado
// (priceCents), a fatura e a comissão:
//   · percentagem → a mesma % em cada ato;
//   · valor       → repartido pelos atos na proporção do preço, ao cêntimo
//                   (a soma das partes é exatamente o valor pedido).
// Sem BD nem React, para ser testada (scripts/tests/ronda-9b-fase2.test.ts).
// =============================================================================

import {
  commissionCentsOf,
  discountCentsOf,
  type DiscountInput,
} from '@/lib/commissions';

export interface DiscountLine {
  id: string;
  /** Valor que o ato tem agora (já com descontos anteriores) */
  priceCents: number;
}

/** Desconto total pedido, em cêntimos, limitado ao total dos atos */
export function checkoutDiscountTotal(
  lines: DiscountLine[],
  discount: DiscountInput,
): number {
  if (!discount) return 0;
  const total = lines.reduce((s, l) => s + l.priceCents, 0);
  if (discount.mode === 'percent') {
    return lines.reduce((s, l) => s + discountCentsOf(l.priceCents, discount), 0);
  }
  return Math.min(total, Math.max(0, Math.trunc(discount.cents)));
}

/**
 * Quanto desconto cabe a cada ato. A soma é sempre igual a
 * checkoutDiscountTotal; nenhum ato fica com valor negativo.
 */
export function allocateCheckoutDiscount(
  lines: DiscountLine[],
  discount: DiscountInput,
): Map<string, number> {
  const out = new Map<string, number>(lines.map(l => [l.id, 0]));
  if (!discount || lines.length === 0) return out;
  if (discount.mode === 'percent') {
    for (const l of lines) out.set(l.id, discountCentsOf(l.priceCents, discount));
    return out;
  }
  const total = lines.reduce((s, l) => s + l.priceCents, 0);
  const amount = checkoutDiscountTotal(lines, discount);
  if (total <= 0 || amount <= 0) return out;
  // maiores restos: parte inteira a cada ato, os cêntimos que sobram vão para
  // os atos com maior resto (desempate pela ordem da lista)
  const shares = lines.map((l, index) => {
    const exact = (l.priceCents * amount) / total;
    const floor = Math.floor(exact);
    return { id: l.id, index, floor, rest: exact - floor, cap: l.priceCents };
  });
  let left = amount - shares.reduce((s, x) => s + x.floor, 0);
  const order = [...shares].sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const x of order) {
    if (left <= 0) break;
    if (x.floor < x.cap) {
      x.floor += 1;
      left -= 1;
    }
  }
  for (const x of shares) out.set(x.id, x.floor);
  return out;
}

export interface LineBeforeDiscount {
  listPriceCents?: number | null;
  discountCents?: number | null;
  priceCents: number;
  costCents?: number | null;
  commissionMode?: 'percent' | 'fixed' | null;
  commissionRate: number;
  commissionCents: number;
}

export interface LineAfterDiscount {
  listPriceCents: number;
  discountMode: 'percent' | 'amount';
  discountPct: number | null;
  discountCents: number;
  priceCents: number;
  commissionBaseCents: number;
  commissionCents: number;
}

/**
 * Valores do ato depois de receber `addCents` de desconto na faturação.
 * `recomputeCommission` = false quando o mês do ato já fechou: a comissão
 * desse mês não é mexida.
 */
export function applyBillingDiscount(
  line: LineBeforeDiscount,
  addCents: number,
  opts: { percent: number | null; recomputeCommission: boolean },
): LineAfterDiscount {
  const before = line.discountCents ?? 0;
  const listPriceCents = line.listPriceCents ?? line.priceCents + before;
  const add = Math.min(line.priceCents, Math.max(0, Math.trunc(addCents)));
  const priceCents = line.priceCents - add;
  const commissionBaseCents = Math.max(0, priceCents - (line.costCents ?? 0));
  const commissionCents =
    !opts.recomputeCommission || line.commissionMode === 'fixed'
      ? line.commissionCents
      : commissionCentsOf(commissionBaseCents, line.commissionRate);
  // a % só descreve o desconto quando é o único que o ato tem
  const onlyPercent = before === 0 && opts.percent != null;
  return {
    listPriceCents,
    discountMode: onlyPercent ? 'percent' : 'amount',
    discountPct: onlyPercent ? opts.percent : null,
    discountCents: before + add,
    priceCents,
    commissionBaseCents,
    commissionCents,
  };
}

/** "10%" ou "25,00" do formulário → DiscountInput; null = sem desconto */
export function parseDiscountField(
  mode: unknown,
  raw: unknown,
): DiscountInput | 'invalid' {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace('%', '')
    .replace('€', '')
    .replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  if (n === 0) return null;
  if (mode === 'percent') {
    return n > 100 ? 'invalid' : { mode: 'percent', value: n };
  }
  if (mode === 'amount') return { mode: 'amount', cents: Math.round(n * 100) };
  return 'invalid';
}
