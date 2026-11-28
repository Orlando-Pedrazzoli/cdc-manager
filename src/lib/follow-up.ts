// 📄 src/lib/follow-up.ts
// =============================================================================
// CDC Manager — "Há próxima consulta?" ao concluir a consulta
// -----------------------------------------------------------------------------
// Ponto 35 (Giulia, 27/11/2026): "Ao concluir a consulta, o médico responde a
// uma pergunta: Há próxima consulta? Sim ou não. Se sim, indica o motivo:
// encaminhar para outra especialidade, pedir um tempo específico de consulta,
// entre outros."
//
// A resposta fica na marcação (Appointment.followUp) e aparece à receção na
// Sala de espera e na fila de Cobranças, para marcar a seguinte com o
// paciente ainda no balcão. Não marca nada sozinha.
//
// Funções puras, testadas em scripts/tests/ronda-9c-fase-b.test.ts.
// =============================================================================

export const FOLLOW_UP_REASONS = [
  'continuar', // continuar o tratamento
  'especialidade', // encaminhar para outra especialidade
  'tempo', // pedir um tempo específico de consulta
  'controlo', // controlo / revisão
  'outro',
] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

export const FOLLOW_UP_REASON_LABEL: Record<FollowUpReason, string> = {
  continuar: 'Continuar o tratamento',
  especialidade: 'Encaminhar para outra especialidade',
  tempo: 'Tempo específico de consulta',
  controlo: 'Controlo / revisão',
  outro: 'Outro',
};

export const FOLLOW_UP_MAX_MINUTES = 480;
export const FOLLOW_UP_NOTE_MAX = 300;

export interface FollowUp {
  needed: boolean;
  reason: FollowUpReason | null;
  /** Duração pedida para a próxima consulta, em minutos */
  minutes: number | null;
  /** Especialidade, médico, o que fazer — texto do médico */
  note: string | null;
}

/**
 * Lê a resposta do formulário. `answer` tem de ser "sim" ou "nao" — a
 * pergunta é obrigatória. Com "sim", o motivo é obrigatório; a especialidade
 * (no texto) é obrigatória quando o motivo é encaminhar; os minutos são
 * obrigatórios quando o motivo é o tempo de consulta.
 */
export function parseFollowUp(input: {
  answer: unknown;
  reason: unknown;
  minutes: unknown;
  note: unknown;
}): { followUp: FollowUp } | { error: string } {
  if (input.answer !== 'sim' && input.answer !== 'nao')
    return { error: 'Responda se há próxima consulta: sim ou não.' };
  if (input.answer === 'nao')
    return { followUp: { needed: false, reason: null, minutes: null, note: null } };

  const reason = (FOLLOW_UP_REASONS as readonly string[]).includes(
    String(input.reason),
  )
    ? (input.reason as FollowUpReason)
    : null;
  if (!reason) return { error: 'Indique o motivo da próxima consulta.' };

  const rawMin = typeof input.minutes === 'string' ? input.minutes.trim() : '';
  let minutes: number | null = null;
  if (rawMin !== '') {
    const n = Number(rawMin);
    if (!Number.isInteger(n) || n < 5 || n > FOLLOW_UP_MAX_MINUTES)
      return {
        error: `Duração inválida: entre 5 e ${FOLLOW_UP_MAX_MINUTES} minutos.`,
      };
    minutes = n;
  }
  const note =
    typeof input.note === 'string' && input.note.trim() !== ''
      ? input.note.trim().slice(0, FOLLOW_UP_NOTE_MAX)
      : null;

  if (reason === 'tempo' && minutes == null)
    return { error: 'Indique a duração pedida para a próxima consulta.' };
  if (reason === 'especialidade' && !note)
    return { error: 'Indique a especialidade (ou o médico) para onde encaminha.' };
  if (reason === 'outro' && !note)
    return { error: 'Descreva o motivo da próxima consulta.' };

  return { followUp: { needed: true, reason, minutes, note } };
}

/** Texto para a receção. null = o médico ainda não respondeu (consultas antigas) */
export function followUpLabel(
  f:
    | {
        needed?: boolean | null;
        reason?: string | null;
        minutes?: number | null;
        note?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!f || typeof f.needed !== 'boolean') return null;
  if (!f.needed) return 'Sem próxima consulta';
  const parts = [
    FOLLOW_UP_REASON_LABEL[f.reason as FollowUpReason] ?? 'Marcar próxima consulta',
  ];
  if (f.minutes) parts.push(`${f.minutes} min`);
  if (f.note) parts.push(f.note);
  return `Marcar: ${parts.join(' · ')}`;
}
