// 📄 src/lib/month-grid.ts
// =============================================================================
// CDC Manager — Grelha de um mês (Seg–Dom) para a vista mensal da agenda
// Ponto 26 (Giulia, 27/11/2026): "Acrescentar uma vista mensal [na agenda do
// médico], com o mesmo esquema de cores do dashboard da receção."
// Datas como texto "YYYY-MM-DD" e aritmética em UTC ao meio-dia, para não
// depender do fuso nem da mudança de hora. Funções puras, testadas em
// scripts/tests/ronda-9c-fase-b.test.ts.
// =============================================================================

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-11" válido? */
export function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

/** "2026-11-28" → "2026-11" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** "2026-12" + 1 → "2027-01" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface MonthCell {
  date: string; // YYYY-MM-DD
  day: number;
  /** false = dia do mês anterior ou seguinte (para completar a semana) */
  inMonth: boolean;
}

/** Semanas (Seg–Dom) que cobrem o mês; 4 a 6 linhas de 7 dias */
export function monthGrid(month: string): MonthCell[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  // getUTCDay: 0 = domingo … 6 = sábado → segunda = 0
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i, 12));
    const cell: MonthCell = {
      date: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/** "novembro de 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-PT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
}

/** "ANA PAULA DOS SANTOS BORGES" → "Ana Borges" (para caber na célula) */
export function shortPatientName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return parts.length === 1
    ? cap(parts[0])
    : `${cap(parts[0])} ${cap(parts[parts.length - 1])}`;
}
