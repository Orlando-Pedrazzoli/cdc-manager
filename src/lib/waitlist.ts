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
