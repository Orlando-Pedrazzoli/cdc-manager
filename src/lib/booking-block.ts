// 📄 src/lib/booking-block.ts
// =============================================================================
// CDC Manager — Bloqueio de marcações de um paciente (7.ª ronda/B4)
// -----------------------------------------------------------------------------
// Victor (13/11/2026): "Adicionar 'bloquear' pacientes para impedir marcações
// na agenda. Quando tentarmos realizar a marcação, saltar um quadro
// informativo com a informação e o motivo descrito por quem o fez. Apenas a
// Gestão."
//
// O bloqueio vive na ficha (Patient.bookingBlockedAt/Reason/ByUserId). Só a
// gestão bloqueia e desbloqueia; a receção vê o motivo e não consegue marcar.
// Funções puras (sem BD) para serem testadas e usadas no servidor e no cliente.
// =============================================================================

export interface BookingBlockFields {
  bookingBlockedAt?: Date | string | null;
  bookingBlockReason?: string | null;
}

export const BOOKING_BLOCK_REASON_MIN = 5;
export const BOOKING_BLOCK_REASON_MAX = 500;

export function isBookingBlocked(p: BookingBlockFields | null | undefined) {
  return Boolean(p?.bookingBlockedAt);
}

/** Mensagem de erro das actions de marcação; null se o paciente não está bloqueado */
export function bookingBlockError(
  p: BookingBlockFields | null | undefined,
): string | null {
  if (!isBookingBlocked(p)) return null;
  const reason = (p?.bookingBlockReason ?? '').trim();
  return `Paciente bloqueado para marcações pela gestão${reason ? `: ${reason}` : '.'} Só a gestão pode desbloquear, na ficha do paciente.`;
}

/** Valida o motivo escrito pela gestão; devolve o texto limpo ou o erro */
export function parseBlockReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (reason.length < BOOKING_BLOCK_REASON_MIN) {
    return {
      ok: false,
      error: `Indique o motivo do bloqueio (mín. ${BOOKING_BLOCK_REASON_MIN} caracteres).`,
    };
  }
  if (reason.length > BOOKING_BLOCK_REASON_MAX) {
    return {
      ok: false,
      error: `O motivo não pode passar dos ${BOOKING_BLOCK_REASON_MAX} caracteres.`,
    };
  }
  return { ok: true, reason };
}
