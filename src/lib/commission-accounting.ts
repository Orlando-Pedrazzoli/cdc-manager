// 📄 src/lib/commission-accounting.ts
// =============================================================================
// CDC Manager — Contabilidade mensal de comissões (Fase 1)
// -----------------------------------------------------------------------------
// Fonte ÚNICA das regras de "fecho de mês" usadas por: relatórios admin,
// listagem detalhada de remuneração, dashboard do médico e ações de
// anulação. Se a regra mudar, muda AQUI.
//
// REGRA: o mapa do mês M é o que estava válido no FECHO de M.
//   · Ato executado em M conta em M se, no fecho de M, não estava anulado:
//       status ∈ {completed, invoiced}  OU  (status = void E voidedAt ≥ fim M)
//   · Um ato anulado DEPOIS do fecho do seu mês gera um CommissionAdjustment
//     negativo com effectiveAt = data da anulação → cai no mês da anulação.
//   · Um ato anulado DENTRO do próprio mês não gera ajuste: sai da produção.
//
// Funções de aggregation ($match) e de decisão puras (sem I/O).
// =============================================================================

import { lisbonToUtc } from '@/lib/availability';

/** "YYYY-MM" civil de Lisboa para um instante */
export function lisbonMonthOf(d: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}`;
}

export function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Limites UTC do mês civil de Lisboa [início, fim) */
export function monthBoundsUtc(mes: string): [Date, Date] {
  const start = lisbonToUtc(`${mes}-01`, 0);
  const end = lisbonToUtc(`${shiftMonth(mes, 1)}-01`, 0);
  return [start, end];
}

/**
 * $match de atos que CONTAM na produção/comissão do intervalo [start, end).
 * `end` deve ser o fim do mês (ou "agora" para o mês corrente — nesse caso
 * um ato já anulado hoje não conta, como se espera).
 */
export function producedProceduresMatch(
  start: Date,
  end: Date,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    executedAt: { $gte: start, $lt: end },
    $or: [
      { status: { $in: ['completed', 'invoiced'] } },
      { status: 'void', voidedAt: { $gte: end } },
    ],
  };
}

/** $match de ajustes (estornos) com efeito no intervalo */
export function adjustmentsMatch(
  start: Date,
  end: Date,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...extra, effectiveAt: { $gte: start, $lt: end } };
}

/**
 * Decide se anular um ato AGORA exige estorno: sim quando o ato foi
 * executado num mês civil (Lisboa) ANTERIOR ao mês da anulação.
 */
export function needsAdjustmentOnVoid(
  executedAt: Date | null | undefined,
  voidedAt: Date = new Date(),
): boolean {
  if (!executedAt) return false;
  return lisbonMonthOf(executedAt) < lisbonMonthOf(voidedAt);
}
