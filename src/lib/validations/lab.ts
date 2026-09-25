// 📄 src/lib/validations/lab.ts
// =============================================================================
// CDC Manager — Validações: casos de laboratório (próteses)
// =============================================================================

import { z } from 'zod';
import { LAB_WORK_TYPES } from '@/lib/domain';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

// Euros ("123,45" ou "123.45") → cêntimos inteiros; '' = null
const euroToCentsField = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .regex(/^\d{1,6}([.,]\d{1,2})?$/, 'Custo inválido (ex.: 120,00)')
      .transform(v => Math.round(Number(v.replace(',', '.')) * 100)),
  ]),
);

const optionalShort = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label} demasiado longo`).nullable(),
  );

export const createLabCaseSchema = z
  .object({
    clinicId: z.string().regex(OBJECT_ID, 'Clínica inválida'),
    patientId: z.string().regex(OBJECT_ID, 'Selecione o paciente'),
    doctorId: z.preprocess(
      emptyToNull,
      z.string().regex(OBJECT_ID, 'Médico inválido').nullable(),
    ),
    // E3: laboratório escolhido da lista de fornecedores (pisco laboratório)
    supplierId: z.string().regex(OBJECT_ID, 'Selecione o laboratório'),
    // Apontamento 05: marcação de retorno a que o trabalho se destina
    appointmentId: z.preprocess(
      emptyToNull,
      z.string().regex(OBJECT_ID, 'Marcação inválida').nullable(),
    ),
    workType: z.enum(LAB_WORK_TYPES, { error: 'Selecione o tipo de trabalho' }),
    toothNotes: optionalShort(60, 'Campo dentes/zona'),
    shade: optionalShort(20, 'Cor'),
    notes: optionalShort(300, 'Notas'),
    costCents: euroToCentsField,
    sentDate: z.string().regex(DATE_RE, 'Data de envio inválida'),
    dueDate: z.string().regex(DATE_RE, 'Data prevista inválida'),
  })
  .refine(d => d.dueDate >= d.sentDate, {
    message: 'A data prevista não pode ser anterior ao envio',
    path: ['dueDate'],
  });
export type CreateLabCaseInput = z.infer<typeof createLabCaseSchema>;

export const labCaseIdSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Caso inválido'),
});

export const rescheduleLabCaseSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Caso inválido'),
  newDueDate: z.string().regex(DATE_RE, 'Nova data inválida'),
  note: optionalShort(200, 'Nota'),
});

export const cancelLabCaseSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Caso inválido'),
  reason: z
    .string()
    .trim()
    .min(3, 'Indique o motivo do cancelamento')
    .max(200, 'Motivo demasiado longo'),
});
