// 📄 src/lib/consult-window.ts
// =============================================================================
// CDC Manager — Janela de tempo da barra da consulta
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta A3, substitui a regra da 9.ª ronda/15):
// "A barra começa a correr quando o médico puxa o paciente e termina no
// horário previsto do agendamento. A partir daí começa a contar tempo de
// atraso. Assim consigo medir quanto tempo de atraso o médico teve."
//
// Regra: a barra vai do INÍCIO REAL (quando o médico chama o paciente) até
// ao FIM MARCADO. Não estica: uma consulta que começa tarde tem menos barra,
// e depois do fim marcado o que se vê é o atraso a contar.
//   · ainda não começou              → horário marcado (início → fim)
//   · começou antes do fim marcado   → início real → fim marcado
//   · começou no fim marcado ou depois (ex.: urgência atendida muito tarde)
//                                    → barra já esgotada; o atraso conta
//                                      desde o fim marcado
//
// Função pura, sem dependências: usada em páginas de servidor e nos testes.
// =============================================================================

export function consultWindow(
  startMs: number,
  endMs: number,
  startedMs: number | null | undefined,
): { startMs: number; endMs: number } {
  if (startedMs == null || !Number.isFinite(startedMs)) return { startMs, endMs };
  if (startedMs < endMs) return { startMs: startedMs, endMs };
  return { startMs: Math.min(startMs, endMs), endMs };
}
