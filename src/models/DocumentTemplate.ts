// 📄 src/models/DocumentTemplate.ts
// =============================================================================
// CDC Manager — Model: DocumentTemplate (modelos de documentos — Fase 5A)
// Texto com placeholders {{...}}; editável pela administração. Os defaults
// (lib/data/document-templates.ts) são semeados na primeira visita a
// /admin/modelos e podem ser alterados ou desativados; nunca apagados.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { TEMPLATE_KINDS } from '@/lib/data/document-templates';

const DocumentTemplateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, enum: TEMPLATE_KINDS, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 20_000 },
    // Quem pode emitir: médico sempre; receção só se allowStaff
    allowStaff: { type: Boolean, default: false },
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
