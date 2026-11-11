// 📄 scripts/migracao/lib/slots.ts
// =============================================================================
// Migração Dentoral → CDC Manager — agenda: juntar intervalos numa marcação
// -----------------------------------------------------------------------------
// A agenda do Dentoral guarda UMA LINHA POR INTERVALO ocupado. Uma consulta
// que ocupa dois intervalos (ex.: 10:20 e 10:40, grelha de 20 min) são duas
// linhas seguidas do mesmo paciente. Importadas linha a linha davam:
//   · o mesmo paciente duas vezes seguidas;
//   · marcações sobrepostas (cada uma com 30 min fixos), que a grelha do CDC
//     mostra lado a lado → os horários "alternavam entre duas colunas".
// (4.ª ronda de apontamentos do Victor, nov. 2026, ponto 02.)
//
// Aqui: funções PURAS (sem base de dados) que
//   1. inferem a grelha real de cada médico em cada dia (15, 20, 30 min…) a
//      partir do espaçamento entre as linhas;
//   2. juntam as linhas seguidas do mesmo paciente numa só marcação, com a
//      duração real (n.º de intervalos × grelha).
// Usadas pelo 04-appointments.ts (importação) e pelo
// 15-fix-split-appointments.ts (reparação do que já foi importado).
// =============================================================================

export type SlotItem<T> = {
  /** médico (chave estável) */
  doctor: string;
  /** dia em Lisboa, 'YYYY-MM-DD' */
  day: string;
  startMs: number;
  patient: string;
  /** só se juntam linhas do mesmo tipo (agenda / falta / cancelada) */
  kind: string;
  ref: T;
};

export type MergedSlot<T> = {
  /** primeira linha da cadeia — é a marcação que fica */
  first: SlotItem<T>;
  /** todas as linhas da cadeia, por ordem (inclui a primeira) */
  members: SlotItem<T>[];
  startMs: number;
  endMs: number;
  /** grelha usada, em minutos */
  slotMin: number;
};

export const DEFAULT_SLOT_MIN = 30;
const MIN_SLOT = 5;
const MAX_SLOT = 60;
const MINUTE = 60_000;

/** Menor espaçamento (5–60 min) que aparece pelo menos `minCount` vezes */
function smallestRepeatedGap(gaps: Map<number, number>, minCount: number): number | null {
  let best: number | null = null;
  for (const [gap, count] of gaps) {
    if (gap < MIN_SLOT || gap > MAX_SLOT || count < minCount) continue;
    if (best === null || gap < best) best = gap;
  }
  return best;
}

/**
 * Grelha por médico+dia e por médico+mês. O dia decide quando tem amostra
 * suficiente (a manhã e a tarde podem ter grelhas diferentes entre dias); se
 * não, vale a do mês; se nem isso, 30 min.
 */
export function inferSlots<T>(items: SlotItem<T>[]): { slotFor: (doctor: string, day: string) => number } {
  const startsByDay = new Map<string, Set<number>>();
  for (const it of items) {
    const key = `${it.doctor}|${it.day}`;
    let set = startsByDay.get(key);
    if (!set) startsByDay.set(key, (set = new Set()));
    set.add(it.startMs);
  }
  const byDay = new Map<string, number>();
  const monthGaps = new Map<string, Map<number, number>>();
  for (const [key, set] of startsByDay) {
    const [doctor, day] = key.split('|');
    const starts = [...set].sort((a, b) => a - b);
    const gaps = new Map<number, number>();
    for (let i = 1; i < starts.length; i++) {
      const gap = Math.round((starts[i] - starts[i - 1]) / MINUTE);
      gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
    }
    const daySlot = smallestRepeatedGap(gaps, 2);
    if (daySlot !== null) byDay.set(key, daySlot);
    const monthKey = `${doctor}|${day.slice(0, 7)}`;
    let mg = monthGaps.get(monthKey);
    if (!mg) monthGaps.set(monthKey, (mg = new Map()));
    for (const [gap, count] of gaps) mg.set(gap, (mg.get(gap) ?? 0) + count);
  }
  const byMonth = new Map<string, number>();
  for (const [key, gaps] of monthGaps) {
    const slot = smallestRepeatedGap(gaps, 3);
    if (slot !== null) byMonth.set(key, slot);
  }
  return {
    slotFor: (doctor, day) =>
      byDay.get(`${doctor}|${day}`) ?? byMonth.get(`${doctor}|${day.slice(0, 7)}`) ?? DEFAULT_SLOT_MIN,
  };
}

/**
 * Junta as linhas seguidas do mesmo paciente (mesmo médico, dia e tipo) cujo
 * início dista exatamente um intervalo da grelha — ou que são a mesma hora
 * repetida. Cada linha isolada fica com a duração de um intervalo.
 * Devolve as marcações por ordem de médico, dia e hora.
 */
export function mergeSlots<T>(items: SlotItem<T>[]): MergedSlot<T>[] {
  const { slotFor } = inferSlots(items);
  return mergeSlotsWith(items, slotFor);
}

/**
 * Igual a `mergeSlots`, mas com a grelha dada de fora (ex.: as faltas saem da
 * agenda e não têm vizinhos de onde inferir; usa-se a grelha que a agenda
 * desse médico tinha nesse dia). `null` → infere destes itens.
 */
export function mergeSlotsWith<T>(
  items: SlotItem<T>[],
  knownSlot: (doctor: string, day: string) => number | null,
): MergedSlot<T>[] {
  const inferred = inferSlots(items);
  const slotFor = (doctor: string, day: string) => knownSlot(doctor, day) ?? inferred.slotFor(doctor, day);
  const groups = new Map<string, SlotItem<T>[]>();
  for (const it of items) {
    const key = `${it.doctor}|${it.day}|${it.patient}|${it.kind}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(it);
  }
  const out: MergedSlot<T>[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.startMs - b.startMs);
    const slotMin = slotFor(group[0].doctor, group[0].day);
    let chain: SlotItem<T>[] = [];
    const flush = () => {
      if (chain.length === 0) return;
      const last = chain[chain.length - 1];
      out.push({ first: chain[0], members: chain, startMs: chain[0].startMs, endMs: last.startMs + slotMin * MINUTE, slotMin });
      chain = [];
    };
    for (const it of group) {
      const prev = chain[chain.length - 1];
      const gap = prev ? Math.round((it.startMs - prev.startMs) / MINUTE) : 0;
      if (prev && gap !== 0 && gap !== slotMin) flush();
      chain.push(it);
    }
    flush();
  }
  return out.sort(
    (a, b) => a.first.doctor.localeCompare(b.first.doctor) || a.first.day.localeCompare(b.first.day) || a.startMs - b.startMs,
  );
}

/** Junta observações sem repetir texto igual */
export function joinNotes(notes: (string | null | undefined)[], max = 500): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of notes) {
    const s = (n ?? '').trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out.join(' · ').slice(0, max) || null;
}
