// 📄 src/lib/waitlist.ts
// =============================================================================
// CDC Manager — Lista de espera (8.ª ronda/10, Victor 17/11/2026)
// -----------------------------------------------------------------------------
// "Criar o botão 'Paciente quer outro horário' na marcação. Quando alguém
// cancela, falta, ou fica um horário livre no dia, o sistema sugere os
// pacientes que pediram uma vaga mais cedo ou mais tarde com aquele médico."
//
// Contas puras (sem BD nem React), para serem testadas.
// =============================================================================

export type WaitlistPreference = 'earlier' | 'later' | 'any';

export const WAITLIST_PREFERENCE_LABEL: Record<WaitlistPreference, string> = {
  earlier: 'Quer mais cedo',
  later: 'Quer mais tarde',
  any: 'Qualquer outro horário',
};

export interface WaitlistEntryLite {
  id: string;
  doctorId: string | null;
  preference: WaitlistPreference;
  /** Dia e hora da marcação que o paciente tem hoje */
  appointmentDay: string; // 'YYYY-MM-DD'
  appointmentStartMin: number; // minutos desde as 00:00
}

/**
 * O pedido serve para uma vaga no dia `dayIso`?
 *  · mais cedo  → a marcação dele é num dia posterior, ou no próprio dia
 *  · mais tarde → a marcação dele é num dia anterior, ou no próprio dia
 *  · qualquer   → sempre
 * No próprio dia serve (trocar a hora), e cabe à receção ver se a vaga é
 * antes ou depois. Dias que já passaram nunca servem.
 */
export function fitsDay(
  entry: Pick<WaitlistEntryLite, 'preference' | 'appointmentDay'>,
  dayIso: string,
  todayIso: string,
): boolean {
  if (dayIso < todayIso) return false;
  if (entry.preference === 'earlier') return entry.appointmentDay >= dayIso;
  if (entry.preference === 'later') return entry.appointmentDay <= dayIso;
  return true;
}

/**
 * Pedidos a sugerir para o dia aberto na agenda: os do médico filtrado (ou
 * de todos os médicos desse dia), que encaixam no dia. Primeiro os que têm
 * a marcação mais longe do dia (são os que mais ganham com a vaga).
 */
export function waitlistCandidates<T extends WaitlistEntryLite>(
  entries: T[],
  opts: { dayIso: string; todayIso: string; doctorIds: ReadonlySet<string> },
): T[] {
  const dist = (e: T) =>
    Math.abs(Date.parse(e.appointmentDay) - Date.parse(opts.dayIso));
  return entries
    .filter(
      e =>
        (e.doctorId == null || opts.doctorIds.has(e.doctorId)) &&
        fitsDay(e, opts.dayIso, opts.todayIso),
    )
    .sort(
      (a, b) =>
        dist(b) - dist(a) ||
        a.appointmentDay.localeCompare(b.appointmentDay) ||
        a.appointmentStartMin - b.appointmentStartMin,
    );
}

// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 17, Victor, 17 e 18/11): pedidos para "o médico X no dia
// X" — a agenda desse dia ainda não tem horário, ou está cheia. "Quando
// surgir o horário, aparece um alerta da lista de espera."
// -----------------------------------------------------------------------------
export interface MinInterval {
  start: number;
  end: number;
}

/** Vaga mínima (minutos) para o alerta. Victor, 25/11 (A12): "pelo menos
 *  30 minutos livres" (antes: 15, um lugar da grelha). */
export const DAY_REQUEST_MIN_GAP = 30;

/**
 * Primeiro intervalo livre com pelo menos `minGap` minutos dentro do horário
 * de trabalho, descontando o que já está ocupado. `fromMin` corta o que já
 * passou (pedidos para hoje). null = sem horário ou sem vaga.
 */
export function firstFreeGap(
  working: MinInterval[],
  busy: MinInterval[],
  minGap: number = DAY_REQUEST_MIN_GAP,
  fromMin = 0,
): MinInterval | null {
  const taken = [...busy].sort((a, b) => a.start - b.start);
  for (const w of [...working].sort((a, b) => a.start - b.start)) {
    let cursor = Math.max(w.start, fromMin);
    for (const b of taken) {
      if (b.end <= cursor) continue;
      if (b.start >= w.end) break;
      if (b.start - cursor >= minGap) return { start: cursor, end: b.start };
      cursor = Math.max(cursor, b.end);
    }
    if (w.end - cursor >= minGap) return { start: cursor, end: w.end };
  }
  return null;
}

/** Estado de um pedido para um dia: sem horário, cheio ou com vaga */
export type DayRequestState = 'no-schedule' | 'full' | 'free';

export function dayRequestState(
  working: MinInterval[],
  busy: MinInterval[],
  fromMin = 0,
): DayRequestState {
  if (working.length === 0) return 'no-schedule';
  return firstFreeGap(working, busy, DAY_REQUEST_MIN_GAP, fromMin)
    ? 'free'
    : 'full';
}

export const DAY_REQUEST_STATE_LABEL: Record<DayRequestState, string> = {
  'no-schedule': 'Dia ainda sem horário',
  full: 'Agenda cheia',
  free: 'Já há vaga',
};
