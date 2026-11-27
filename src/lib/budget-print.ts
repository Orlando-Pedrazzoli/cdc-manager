// 📄 src/lib/budget-print.ts
// =============================================================================
// CDC Manager — Orçamento impresso em A4 para o paciente (dados)
// -----------------------------------------------------------------------------
// Pedido do Victor, transmitido pelo Orlando a 27/11/2026: "um botão para
// imprimir nos orçamentos, imprimir em A4 o orçamento para o paciente".
// Aqui só se preparam as linhas e os totais a partir do plano de tratamento
// (funções puras, testadas em scripts/tests/ronda-9c.test.ts). O desenho do
// PDF está em lib/budget-pdf.tsx.
//
// Regras:
// · o valor de cada linha é o que o plano guarda (priceCents, já com o
//   desconto da linha); o "preço" é o PVP aplicado quando houve desconto;
// · o total é a soma das linhas menos o desconto global do plano — a mesma
//   conta da página de Orçamentos;
// · as fases só aparecem quando o plano tem mais de uma;
// · um rascunho sai marcado "RASCUNHO" e sem número.
// =============================================================================

export interface BudgetPlanItem {
  nameSnapshot: string;
  listPriceCents?: number | null;
  discountCents?: number | null;
  priceCents: number;
  note?: string | null;
  toothNumbers?: readonly string[] | null;
  phase?: number | null;
}

export interface BudgetPrintRow {
  phase: number;
  description: string;
  note: string | null;
  /** PVP antes do desconto da linha; null quando não houve desconto */
  listCents: number | null;
  discountCents: number;
  valueCents: number;
}

export interface BudgetPrintTotals {
  /** Soma dos PVP (antes de qualquer desconto) */
  grossCents: number;
  /** Descontos das linhas + desconto global */
  discountCents: number;
  totalCents: number;
}

export function budgetPrintRows(
  items: readonly BudgetPlanItem[],
): BudgetPrintRow[] {
  return items
    .map((it, index) => {
      const teeth = (it.toothNumbers ?? []).filter(Boolean);
      const value = Math.max(0, Math.round(it.priceCents));
      const discount = Math.max(0, Math.round(it.discountCents ?? 0));
      // PVP: o que o plano guardou; se faltar, deduz-se do valor + desconto
      const list =
        it.listPriceCents != null
          ? Math.max(0, Math.round(it.listPriceCents))
          : value + discount;
      return {
        index,
        row: {
          phase: it.phase && it.phase > 0 ? Math.round(it.phase) : 1,
          description:
            it.nameSnapshot +
            (teeth.length
              ? ` (dente${teeth.length === 1 ? '' : 's'} ${teeth.join(', ')})`
              : ''),
          note: it.note?.trim() || null,
          listCents: discount > 0 ? list : null,
          discountCents: discount,
          valueCents: value,
        },
      };
    })
    .sort((a, b) => a.row.phase - b.row.phase || a.index - b.index)
    .map(x => x.row);
}

export function budgetPrintTotals(
  rows: readonly BudgetPrintRow[],
  planDiscountCents: number | null | undefined,
): BudgetPrintTotals {
  const sum = rows.reduce((s, r) => s + r.valueCents, 0);
  const lineDiscounts = rows.reduce((s, r) => s + r.discountCents, 0);
  const global = Math.max(0, Math.round(planDiscountCents ?? 0));
  const total = Math.max(0, sum - global);
  return {
    grossCents: sum + lineDiscounts,
    // nunca se mostra mais desconto do que o que foi realmente abatido
    discountCents: lineDiscounts + (sum - total),
    totalCents: total,
  };
}

/** Há mais de uma fase? (só então as fases aparecem no papel) */
export function budgetHasPhases(rows: readonly BudgetPrintRow[]): boolean {
  return new Set(rows.map(r => r.phase)).size > 1;
}

/** "12,50 €" — sem espaço inseparável nem sinal "−" (a letra do PDF não os tem) */
export function eurPdf(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${cents < 0 ? '-' : ''}${int},${String(abs % 100).padStart(2, '0')} €`;
}

/** Nome do ficheiro: "orcamento-123.pdf" / "orcamento-rascunho.pdf" */
export function budgetPdfFilename(number: number | null | undefined): string {
  return typeof number === 'number' && number > 0
    ? `orcamento-${number}.pdf`
    : 'orcamento-rascunho.pdf';
}
