// 📄 src/lib/validations/recalls.ts
// =============================================================================
// CDC Manager — Validações Zod: fila de Recalls
// -----------------------------------------------------------------------------
// As ações da fila recebem apenas o id do recall; a regra de negócio está na
// máquina de transições RECALL_ACTION_ALLOWED_FROM (pura, testável): cada
// ação só é válida a partir de certos estados — ex.: não se marca 'booked'
// um ciclo já 'dismissed' sem primeiro o reabrir.
//
// 'scheduled' → 'due' NÃO é ação de utilizador: é a promoção lazy feita
// pela página quando dueAt <= agora (substitui o cron até ao Sprint 6).
// =============================================================================

import { z } from 'zod';
import type { RecallStatus } from '@/models/Recall';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export const recallIdSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Recall inválido'),
});
export type RecallIdInput = z.infer<typeof recallIdSchema>;

// -----------------------------------------------------------------------------
// Máquina de transições: ação da receção → estados de partida permitidos
// -----------------------------------------------------------------------------
export type RecallUserAction =
  | 'contact' // registou tentativa de contacto
  | 'book' // converteu: consulta marcada
  | 'dismiss' // paciente recusou / receção descartou
  | 'unreachable' // tentativas esgotadas
  | 'reopen'; // voltar a pôr na fila (engano / paciente voltou atrás)

export const RECALL_ACTION_ALLOWED_FROM: Record<
  RecallUserAction,
  readonly RecallStatus[]
> = {
  // Contactar antes da data (scheduled) é legítimo — receção proativa
  contact: ['scheduled', 'due', 'contacted'],
  book: ['scheduled', 'due', 'contacted'],
  dismiss: ['scheduled', 'due', 'contacted'],
  unreachable: ['due', 'contacted'],
  reopen: ['dismissed', 'unreachable'],
} as const;

export const RECALL_ACTION_TARGET: Record<RecallUserAction, RecallStatus> = {
  contact: 'contacted',
  book: 'booked',
  dismiss: 'dismissed',
  unreachable: 'unreachable',
  reopen: 'due',
} as const;

/** Guarda pura usada pelas actions (e testável no sandbox) */
export function canApplyRecallAction(
  action: RecallUserAction,
  current: RecallStatus,
): boolean {
  return RECALL_ACTION_ALLOWED_FROM[action].includes(current);
}
