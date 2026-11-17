// 📄 src/lib/pay-statement.ts
// =============================================================================
// CDC Manager — Extrato de pagamento ao médico: contas puras (8.ª ronda/14)
// -----------------------------------------------------------------------------
// A pagar = remuneração dos atos (com estornos) + ajustes manuais.
// O desconto de laboratório NÃO está aqui: falta a regra do Victor.
// Testado em scripts/tests/ronda-8.test.ts.
// =============================================================================

export const PAY_ADJUSTMENT_MAX_CENTS = 10_000_00; // 10 000 €

export type PayAdjustmentKind = 'add' | 'deduct';

/**
 * Valor do formulário ("120", "45,50") + sentido → cêntimos com sinal.
 * null = valor inválido, zero ou acima do limite.
 */
export function signedAdjustmentCents(
  raw: string,
  kind: PayAdjustmentKind,
): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace('€', '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > PAY_ADJUSTMENT_MAX_CENTS) {
    return null;
  }
  return kind === 'deduct' ? -cents : cents;
}

export interface PayTotals {
  /** Remuneração dos atos, já com os estornos do mês */
  commissionCents: number;
  /** Soma dos ajustes manuais (com sinal) */
  adjustmentsCents: number;
  /** O que o médico recebe */
  payableCents: number;
}

export function payTotals(
  commissionCents: number[],
  adjustmentCents: number[],
): PayTotals {
  const commission = commissionCents.reduce((s, c) => s + c, 0);
  const adjustments = adjustmentCents.reduce((s, c) => s + c, 0);
  return {
    commissionCents: commission,
    adjustmentsCents: adjustments,
    payableCents: commission + adjustments,
  };
}

/** "+ 50,00 €" / "− 12,50 €" */
export function signedEuros(cents: number): string {
  const abs = (Math.abs(cents) / 100).toFixed(2).replace('.', ',');
  return `${cents < 0 ? '−' : '+'} ${abs} €`;
}
