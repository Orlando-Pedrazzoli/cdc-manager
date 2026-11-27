// 📄 src/models/DocumentTemplate.ts
// =============================================================================
// CDC Manager — Model: DocumentTemplate (modelos de documentos — Fase 5A)
// Texto com placeholders {{...}}; editável pela administração. Os defaults
// (lib/data/document-templates.ts) são semeados na primeira visita a
// /admin/modelos e podem ser alterados ou desativados; nunca apagados.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import {
  TEMPLATE_FOLDERS,
  TEMPLATE_KINDS,
} from '@/lib/data/document-templates';

const DocumentTemplateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, enum: TEMPLATE_KINDS, required: true, index: true },
    // 8.ª ronda/06: pasta (especialidade) onde o modelo aparece
    folder: { type: String, enum: TEMPLATE_FOLDERS, default: 'geral' },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 20_000 },
    // Quem pode emitir: médico sempre; receção só se allowStaff
    allowStaff: { type: Boolean, default: false },
    // 9.ª ronda (c), Victor 27/11: modelo restrito a médicos escolhidos pela
    // gestão (contratos). Sem restrição, qualquer médico emite. Com
    // restrição e lista vazia, nenhum médico. Regras: lib/template-access.ts
    restrictedToDoctors: { type: Boolean, default: false },
    allowedDoctorIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Doctor' }],
      default: [],
    },
    // Pede assinatura do paciente no ecrã antes de gerar
    requiresSignature: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    updatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

export type DocumentTemplateDoc = InferSchemaType<
  typeof DocumentTemplateSchema
> & {
  _id: mongoose.Types.ObjectId;
};

const DocumentTemplate: Model<DocumentTemplateDoc> =
  (mongoose.models.DocumentTemplate as Model<DocumentTemplateDoc>) ??
  mongoose.model<DocumentTemplateDoc>(
    'DocumentTemplate',
    DocumentTemplateSchema,
  );

export default DocumentTemplate;
