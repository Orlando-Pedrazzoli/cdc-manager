// 📄 src/lib/price-update.ts
// =============================================================================
// CDC Manager — Aumentos de tabela (Fase 4, E8) — aritmética pura
// -----------------------------------------------------------------------------
// "Nas tabelas de preços deve ser possível fazer aumentos de preços quer por
// % quer por valor … a nível geral da tabela, apenas na categoria de
// tratamentos, mas também isoladamente na linha do tratamento."
//   Aumentar a tabela toda em 2,7% ou em 7 €
//   Aumentar a categoria Estética em 30% ou 30 €
//   Aumentar apenas linhas individuais: 1.ª consulta em 3% ou 3 €
// Valores negativos = descida. Arredondamento ao cêntimo (banker's) ou,
// opcionalmente, ao euro / aos 0,50 € — tabelas de clínica costumam ter
// preços "redondos". Testado em scripts/tests/price-update.test.ts.
// =============================================================================

import { bankersRound } from '@/lib/commissions';

export type PriceRounding = 'cent' | 'half-euro' | 'euro';

export interface PriceUpdateRule {
  mode: 'percent' | 'amount';
  /** % (ex.: 2.7, -5) quando percent; cêntimos (ex.: 700) quando amount */
  value: number;
  rounding: PriceRounding;
}

export function roundTo(cents: number, rounding: PriceRounding): number {
  if (rounding === 'euro') return bankersRound(cents / 100) * 100;
  if (rounding === 'half-euro') return bankersRound(cents / 50) * 50;
  return bankersRound(cents);
}

/** Preço novo (nunca negativo) */
export function applyPriceRule(
  priceCents: number,
  rule: PriceUpdateRule,
): number {
  const raw =
    rule.mode === 'percent'
      ? priceCents * (1 + rule.value / 100)
      : priceCents + rule.value;
  return Math.max(0, roundTo(raw, rule.rounding));
}

export function describeRule(rule: PriceUpdateRule): string {
  const sign = rule.value >= 0 ? '+' : '−';
  const abs = Math.abs(rule.value);
  const v =
    rule.mode === 'percent'
      ? `${abs.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`
      : `${(abs / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`;
  const r =
    rule.rounding === 'euro'
      ? ', arredondado ao euro'
      : rule.rounding === 'half-euro'
        ? ', arredondado aos 0,50 €'
        : '';
  return `${sign}${v}${r}`;
}
