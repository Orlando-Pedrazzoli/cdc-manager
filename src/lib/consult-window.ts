// 📄 src/lib/consult-window.ts
// =============================================================================
// CDC Manager — Janela de tempo da barra da consulta
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 15, Victor, 17 e 18/11): "mesmo que o atendimento seja
// fora do horário da agenda, a barra de tempo deve correr (em casos de
// urgência, ou de pacientes atendidos antes da hora)".
//
// Regra: se a consulta começou DENTRO do horário marcado, a barra continua a
// contar sobre esse horário (mostra quando o lugar na agenda acaba). Se
// começou FORA dele — antes da hora ou depois do fim —, a barra conta a
// duração marcada a partir do início real.
//
// Função pura, sem dependências: usada em páginas de servidor e nos testes.
// =============================================================================

export function consultWindow(
  startMs: number,
  endMs: number,
  startedMs: number | null | undefined,
): { startMs: number; endMs: number } {
  if (startedMs == null || !Number.isFinite(startedMs)) return { startMs, endMs };
  if (startedMs >= startMs && startedMs < endMs) return { startMs, endMs };
  const duration = Math.max(0, endMs - startMs);
  return { startMs: startedMs, endMs: startedMs + duration };
}
