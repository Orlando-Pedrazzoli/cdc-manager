// 📄 src/lib/doctor-work-days.ts
// =============================================================================
// CDC Manager — Dias de trabalho do médico (faixa da "A minha agenda")
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 05, Victor, 17 e 18/11): "mesmo sem marcações, mostrar a
// agenda do médico com os dias em que vai trabalhar".
//
// Funções puras sobre datas civis 'YYYY-MM-DD' (testadas em
// scripts/tests/ronda-9.test.ts). Os horários de cada dia vêm de
// workingRangesForDate (semana-tipo + quinzenais + exceções ∩ clínica).
// =============================================================================

/** Segunda-feira da semana de uma data civil (semana Seg–Dom) */
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Seg=0 … Dom=6
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** `count` dias seguidos a partir de `fromStr` (inclusive) */
export function daysFrom(fromStr: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${fromStr}T12:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** [{start,end}] em minutos → "09:00–13:00 · 14:00–18:00" */
export function rangesLabel(ranges: { start: number; end: number }[]): string {
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return [...ranges]
    .sort((a, b) => a.start - b.start)
    .map(r => `${hhmm(r.start)}–${hhmm(r.end)}`)
    .join(' · ');
}
