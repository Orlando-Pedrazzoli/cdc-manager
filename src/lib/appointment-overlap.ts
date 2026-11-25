// 📄 src/lib/appointment-overlap.ts
// =============================================================================
// CDC Manager — Marcações no mesmo horário para o mesmo médico: regras puras
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta C4): "O sistema deve impedir marcações no
// mesmo horário para o mesmo médico."
//
// As marcações normais, as remarcações e o aumento de duração já são
// recusados quando o médico está ocupado (lib/availability isSlotAvailable,
// dentro da transação). A única entrada que não validava era a URGÊNCIA
// (paciente sem marcação, criada "agora"): passa a avisar quem o médico tem
// nesse horário e só regista depois de a receção confirmar. Bloquear a
// urgência por completo fica por decidir com o Victor.
// Sem BD nem React, para ser testada.
// =============================================================================

export interface BusySlot {
  startLabel: string; // "15:00"
  endLabel: string; // "15:30"
  patientName: string | null;
}

/** Dois intervalos [início, fim[ sobrepõem-se? Encostados não contam. */
export function intervalsOverlap(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

/** Texto do aviso mostrado à receção antes de registar a urgência */
export function overlapWarningText(doctorName: string, busy: BusySlot[]): string {
  if (busy.length === 0) return '';
  const list = busy
    .slice(0, 3)
    .map(b => `${b.startLabel}–${b.endLabel}${b.patientName ? ` (${b.patientName})` : ''}`)
    .join(', ');
  const more = busy.length > 3 ? ` e mais ${busy.length - 3}` : '';
  return `${doctorName} já tem ${busy.length === 1 ? 'marcação' : 'marcações'} neste horário: ${list}${more}. A urgência fica por cima ${busy.length === 1 ? 'dessa marcação' : 'dessas marcações'}.`;
}
