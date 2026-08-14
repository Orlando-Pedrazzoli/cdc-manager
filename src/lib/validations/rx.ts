// 📄 src/lib/validations/rx.ts
// =============================================================================
// CDC Manager — Validações: pedidos de Raio-X
// -----------------------------------------------------------------------------
// A máquina de transições vive em domain.ts (canTransitionRx) — partilhada
// cliente/servidor. Aqui ficam os schemas de entrada das actions.
// =============================================================================

import { z } from 'zod';
import { RX_MODALITIES } from '@/lib/domain';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const FDI_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

// Dentes chegam do form como string "36, 37" — normalizar para array FDI
const teethField = z.preprocess(
  v => {
    if (typeof v !== 'string') return [];
    return v
      .split(/[,\s;]+/)
      .map(t => t.trim())
      .filter(Boolean);
  },
  z
    .array(z.string().regex(FDI_REGEX, 'Dente inválido (notação FDI)'))
    .max(8, 'Máximo de 8 dentes por pedido'),
);

export const createRxRequestSchema = z.object({
  appointmentId: z.string().regex(OBJECT_ID, 'Marcação inválida'),
  modality: z.enum(RX_MODALITIES, { message: 'Modalidade inválida' }),
  toothNumbers: teethField,
  notes: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Nota demasiado longa').nullable(),
  ),
});
export type CreateRxRequestInput = z.infer<typeof createRxRequestSchema>;

export const advanceRxRequestSchema = z.object({
  requestId: z.string().regex(OBJECT_ID, 'Pedido inválido'),
  to: z.enum(['in-progress', 'done'], { message: 'Transição inválida' }),
});
export type AdvanceRxRequestInput = z.infer<typeof advanceRxRequestSchema>;

export const cancelRxRequestSchema = z.object({
  requestId: z.string().regex(OBJECT_ID, 'Pedido inválido'),
  reason: z.preprocess(
    emptyToNull,
    z.string().trim().max(200, 'Motivo demasiado longo').nullable(),
  ),
});
export type CancelRxRequestInput = z.infer<typeof cancelRxRequestSchema>;
