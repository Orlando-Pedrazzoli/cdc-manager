// 📄 src/lib/credit-notes.ts
// =============================================================================
// CDC Manager — Anulação e notas de crédito: regras (pedido da Isabel, 25/11)
// -----------------------------------------------------------------------------
//   · ANULAR um documento só no PRÓPRIO DIA da emissão (dia de Lisboa) e só
//     pela gestão. Depois desse dia, só com NOTA DE CRÉDITO.
//   · Notas de crédito TOTAIS (o documento inteiro) ou PARCIAIS: só algumas
//     linhas, ou só um valor (ex.: um desconto esquecido).
//   · Cada nota de crédito fica registada no documento e na ficha do paciente.
//
// Valor em dívida de uma fatura = total − notas de crédito − pagamentos
// (nunca negativo). Funções puras, contas em cêntimos.
// =============================================================================

export const CREDIT_NOTE_KINDS = ['void', 'total', 'lines', 'value'] as const;
export type CreditNoteKind = (typeof CREDIT_NOTE_KINDS)[number];

export const CREDIT_NOTE_KIND_LABEL: Record<CreditNoteKind, string> = {
  void: 'Anulação (no próprio dia)',
  total: 'Nota de crédito total',
  lines: 'Nota de crédito parcial (linhas)',
  value: 'Nota de crédito parcial (valor)',
};

/** Dia civil de Lisboa (YYYY-MM-DD) */
export const lisbonDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** Anular só no próprio dia da emissão (dia de Lisboa). */
export function canVoidOnDay(issuedAt: Date, now: Date): boolean {
  return lisbonDay(issuedAt) === lisbonDay(now);
}

export interface CreditableInvoice {
  totalCents: number;
  paidCents?: number | null;
  status?: string | null;
  creditNotes?: { totalCents: number }[] | null;
}

/** Soma das notas de crédito já emitidas sobre a fatura */
export function creditedCents(inv: CreditableInvoice): number {
  return (inv.creditNotes ?? []).reduce((a, c) => a + (c.totalCents ?? 0), 0);
}

/** O que ainda se pode creditar (total − já creditado) */
export function creditableCents(inv: CreditableInvoice): number {
  return Math.max(0, inv.totalCents - creditedCents(inv));
}

/** Valor em dívida: total − créditos − pagamentos (documentos antigos sem
 *  `paidCents` contam como totalmente pagos). Anulada → 0. */
export function invoiceDueCents(inv: CreditableInvoice): number {
  if (inv.status === 'voided') return 0;
  const paid = inv.paidCents ?? inv.totalCents;
  return Math.max(0, inv.totalCents - creditedCents(inv) - paid);
}

export interface CreditLine {
  /** índice da linha na fatura (para 'lines') */
  index: number;
  priceCents: number;
}

/**
 * Valida um pedido de nota de crédito PARCIAL. Devolve o valor a creditar ou
 * uma mensagem de erro legível. Uma parcial que cobriria tudo o que falta
 * creditar deve ser feita como nota de crédito TOTAL.
 */
export function validatePartialCredit(
  inv: CreditableInvoice & { lines: { priceCents: number }[] },
  req:
    | { kind: 'lines'; lineIndexes: number[]; creditedLineIndexes: number[] }
    | { kind: 'value'; valueCents: number },
): { error: string } | { totalCents: number } {
  if (inv.status === 'voided') return { error: 'Documento anulado.' };
  const remaining = creditableCents(inv);
  if (remaining <= 0) return { error: 'Este documento já foi todo creditado.' };

  let total = 0;
  if (req.kind === 'lines') {
    const unique = [...new Set(req.lineIndexes)];
    if (unique.length === 0) return { error: 'Escolha pelo menos uma linha.' };
    for (const i of unique) {
      if (!Number.isInteger(i) || i < 0 || i >= inv.lines.length)
        return { error: 'Linha inválida.' };
      if (req.creditedLineIndexes.includes(i))
        return { error: `A linha ${i + 1} já foi creditada.` };
      total += inv.lines[i].priceCents;
    }
    if (total <= 0) return { error: 'As linhas escolhidas não têm valor.' };
  } else {
    if (!Number.isInteger(req.valueCents) || req.valueCents <= 0)
      return { error: 'Indique o valor a creditar.' };
    total = req.valueCents;
  }
  if (total > remaining)
    return {
      error: `O valor excede o que falta creditar (${(remaining / 100).toFixed(2)} €).`,
    };
  if (total === remaining)
    return {
      error:
        'Este crédito cobre todo o documento — use a nota de crédito total.',
    };
  return { totalCents: total };
}
