// 📄 src/lib/validations/documents.ts
// =============================================================================
// CDC Manager — Validações Zod: Documentos clínicos
// -----------------------------------------------------------------------------
// Três blocos:
//   1. TICKET — pedir assinatura de upload (só precisa do paciente).
//   2. REGISTO — gravar o Document após o upload direto ao Cloudinary.
//      title é OPCIONAL: se vazio, a action usa o nome original do ficheiro
//      (vindo do Cloudinary) ou o label da categoria.
//   3. ANULAÇÃO — motivo OBRIGATÓRIO (never delete, padrão das quebras
//      de stock: corrige-se anulando e o porquê fica escrito).
//
// Convenções: emptyToNull trata TAMBÉM undefined; visibleToPatient é toggle
// com value 'true'/'false' → z.preprocess (nunca z.coerce.boolean, porque
// Boolean('false') === true).
// =============================================================================

import { z } from 'zod';
import { DOCUMENT_CATEGORIES } from '@/lib/domain';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const emptyToNull = (v: unknown) =>
  v === undefined || (typeof v === 'string' && v.trim() === '') ? null : v;

const objectIdField = (message: string) => z.string().regex(OBJECT_ID, message);

const optionalObjectIdField = (message: string) =>
  z.preprocess(emptyToNull, z.string().regex(OBJECT_ID, message).nullable());

/** Toggle 'true'/'false' (ou boolean já parseado) → boolean */
const toggleBoolean = z.preprocess(
  v => v === 'true' || v === true,
  z.boolean(),
);

// -----------------------------------------------------------------------------
// 1. TICKET de upload
// -----------------------------------------------------------------------------
export const documentUploadTicketSchema = z.object({
  patientId: objectIdField('Paciente inválido'),
});

// -----------------------------------------------------------------------------
// 2. REGISTO pós-upload
// -----------------------------------------------------------------------------
export const registerDocumentSchema = z.object({
  documentId: objectIdField('Documento inválido'),
  patientId: objectIdField('Paciente inválido'),
  category: z.enum(DOCUMENT_CATEGORIES, { error: 'Categoria inválida' }),
  title: z.preprocess(
    emptyToNull,
    z.string().trim().max(160, 'Título demasiado longo').nullable(),
  ),
  note: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Nota demasiado longa').nullable(),
  ),
  visibleToPatient: toggleBoolean,
  appointmentId: optionalObjectIdField('Consulta inválida'),
});

export type RegisterDocumentInput = z.infer<typeof registerDocumentSchema>;

// -----------------------------------------------------------------------------
// 3. ANULAÇÃO
// -----------------------------------------------------------------------------
export const voidDocumentSchema = z.object({
  documentId: objectIdField('Documento inválido'),
  reason: z
    .string()
    .trim()
    .min(3, 'Indique o motivo da anulação')
    .max(300, 'Motivo demasiado longo'),
});
