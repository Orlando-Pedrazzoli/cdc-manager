// 📄 src/lib/budgets.ts
// =============================================================================
// CDC Manager — Orçamentos entregues e pendentes (8.ª ronda/12 e 13)
// -----------------------------------------------------------------------------
// Victor (17/11/2026):
//   12 — "Todos os orçamentos emitidos pelos médicos ficam rastreáveis, para
//        sabermos quem entrega e quem não entrega orçamento. […] Filtro no
//        recall para a receção ligar a todos os orçamentos pendentes há X
//        tempo (possivelmente 30 dias). […] Taxa de aceitação por médico:
//        orçamentos apresentados contra aceites, em valor e em número."
//   13 — "Pacientes com plano de tratamento em curso, sem marcação feita ou
//        sem voltar à clínica há mais de 30 dias […] identificados como 'Em
//        curso sem retorno', para a receção ligar."
// No sistema, "orçamento entregue" = plano de tratamento apresentado ao
// paciente (estado 'proposed', data `proposedAt`); "aceite" = `approvedAt`;
// "iniciado" = estado 'in-progress' (acontece quando o 1.º ato é executado).
// Contas puras, sem BD nem React, para serem testadas.
// =============================================================================

export const BUDGET_PENDING_DAYS = 30;
export const NO_RETURN_DAYS = 30;
export const BUDGET_PENDING_OPTIONS = [15, 30, 60, 90] as const;

const DAY_MS = 86_400_000;

export interface PlanForStats {
  doctorId: string;
  /** total − desconto, em cêntimos */
  valueCents: number;
  proposedMs: number | null;
  approvedMs: number | null;
}

export interface DoctorBudgetStats {
  doctorId: string;
  presentedN: number;
  presentedCents: number;
  acceptedN: number;
  acceptedCents: number;
  /** % em número e em valor; null quando não apresentou nenhum */
  rateN: number | null;
  rateCents: number | null;
}

/**
 * Por médico, no período [fromMs, toMs[: orçamentos APRESENTADOS no período e,
 * desses, quantos foram aceites (em qualquer data até hoje). Assim a taxa é
 * sempre "dos que entregou, quantos fecharam", e nunca passa de 100%.
 * Todos os médicos de `doctorIds` aparecem, mesmo com zero: é isso que mostra
 * quem não entrega orçamentos.
 */
export function budgetStatsByDoctor(
  plans: PlanForStats[],
  doctorIds: string[],
  fromMs: number,
  toMs: number,
): DoctorBudgetStats[] {
  const map = new Map<string, DoctorBudgetStats>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      s = {
        doctorId: id,
        presentedN: 0,
        presentedCents: 0,
        acceptedN: 0,
        acceptedCents: 0,
        rateN: null,
        rateCents: null,
      };
      map.set(id, s);
    }
    return s;
  };
  doctorIds.forEach(get);
  for (const p of plans) {
    if (p.proposedMs == null || p.proposedMs < fromMs || p.proposedMs >= toMs) continue;
    const s = get(p.doctorId);
    s.presentedN += 1;
    s.presentedCents += p.valueCents;
    if (p.approvedMs != null) {
      s.acceptedN += 1;
      s.acceptedCents += p.valueCents;
    }
  }
  for (const s of map.values()) {
    if (s.presentedN > 0) {
      s.rateN = Math.round((s.acceptedN / s.presentedN) * 100);
      s.rateCents =
        s.presentedCents > 0
          ? Math.round((s.acceptedCents / s.presentedCents) * 100)
          : null;
    }
  }
  return [...map.values()];
}

/** Dias inteiros passados desde `sinceMs` */
export function daysSince(sinceMs: number, nowMs: number): number {
  return Math.floor((nowMs - sinceMs) / DAY_MS);
}

/** Orçamento entregue há `minDays` ou mais e ainda sem resposta? */
export function isBudgetPending(
  plan: { status: string; proposedMs: number | null },
  nowMs: number,
  minDays: number = BUDGET_PENDING_DAYS,
): boolean {
  return (
    plan.status === 'proposed' &&
    plan.proposedMs != null &&
    daysSince(plan.proposedMs, nowMs) >= minDays
  );
}

/**
 * "Em curso sem retorno" (13): plano aceite ou em curso, o paciente não tem
 * nenhuma marcação futura e a última vez que veio foi há mais de 30 dias
 * (ou nunca veio desde que aceitou).
 */
export function isInProgressWithoutReturn(
  input: {
    status: string;
    hasFutureAppointment: boolean;
    /** Última consulta realizada; null = nenhuma */
    lastVisitMs: number | null;
    /** Quando aceitou o plano (serve de referência se nunca veio) */
    approvedMs: number | null;
  },
  nowMs: number,
  minDays: number = NO_RETURN_DAYS,
): boolean {
  if (input.status !== 'approved' && input.status !== 'in-progress') return false;
  if (input.hasFutureAppointment) return false;
  const ref = Math.max(input.lastVisitMs ?? 0, input.approvedMs ?? 0);
  if (ref === 0) return true;
  return daysSince(ref, nowMs) > minDays;
}
