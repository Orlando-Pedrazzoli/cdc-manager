// 📄 src/lib/agenda-bulk.ts
// =============================================================================
// CDC Manager — Agenda: contas puras da 8.ª ronda (Victor, 17/11/2026)
// -----------------------------------------------------------------------------
// · 03 — abrir a agenda "por dia da semana" num período: "todas as quintas de
//   janeiro", "todos os sábados ou domingos de 2027"
// · 02 — vista compacta: o dia inteiro cabe na altura do ecrã
// Sem React nem base de dados, para se poder testar (scripts/tests/ronda-8).
// =============================================================================

/** Píxeis por minuto da vista normal da grelha */
export const AGENDA_PX_PER_MIN = 2.4;
/** Abaixo disto uma marcação de 20 min deixa de se ler */
export const AGENDA_COMPACT_MIN_PX_PER_MIN = 0.65;

/** Dias de um período que calham nos dias da semana escolhidos (0 = seg … 6 =
 *  dom). Nunca devolve dias anteriores a `minIso` (hoje). */
export function weekdayDatesInRange(
  fromIso: string,
  untilIso: string,
  weekdays: ReadonlySet<number>,
  minIso: string,
): string[] {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(fromIso) || !re.test(untilIso) || weekdays.size === 0) return [];
  const start = fromIso < minIso ? minIso : fromIso;
  if (start > untilIso) return [];
  const [y, m, d] = start.split('-').map(Number);
  const out: string[] = [];
  const cur = new Date(Date.UTC(y, m - 1, d));
  // Trava de segurança: nunca mais de 3 anos de calendário
  for (let i = 0; i < 1100; i++) {
    const day = cur.toISOString().slice(0, 10);
    if (day > untilIso) break;
    if (weekdays.has((cur.getUTCDay() + 6) % 7)) out.push(day);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Píxeis por minuto para o dia inteiro caber em `availablePx` — nunca maior
 *  do que a vista normal, nunca tão pequeno que não se leia. */
export function compactPxPerMin(availablePx: number, totalMin: number): number {
  if (totalMin <= 0) return AGENDA_PX_PER_MIN;
  const fit = availablePx / totalMin;
  return Math.min(
    AGENDA_PX_PER_MIN,
    Math.max(AGENDA_COMPACT_MIN_PX_PER_MIN, fit),
  );
}
