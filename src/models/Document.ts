// 📄 src/models/Document.ts
// =============================================================================
// CDC Manager — Model: Document
// -----------------------------------------------------------------------------
// Ficheiro clínico/administrativo do paciente no Cloudinary: radiografias,
// TAC, fotografias clínicas, consentimentos assinados, relatórios externos.
// Guardamos METADADOS + public_id; o binário vive no Cloudinary com acesso
// `authenticated` (nunca URLs públicas — dados de saúde). As URLs de
// visualização são assinadas e geradas on-demand em lib/cloudinary.ts.
//
// Convenções:
// · _id do Document É o sufixo do public_id no Cloudinary (IDs opacos —
//   nunca nome do paciente nem nº de processo no caminho do asset).
// · NEVER DELETE: anular = voidedAt + autor + motivo (padrão Procedure).
//   O asset fica no Cloudinary; remoção física só em apagamento RGPD
//   deliberado (destroyAsset em lib/cloudinary.ts, fase posterior).
// · DOCUMENT_CATEGORIES vive em lib/domain.ts (o client usa no select de
//   upload); aqui importa-se e RE-EXPORTA — código server importa do model.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/domain';

export { DOCUMENT_CATEGORIES };
export type { DocumentCategory };

const DocumentSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    // Cloudinary
    publicId: { type: String, required: true, unique: true },
    resourceType: {
      type: String,
      enum: ['image', 'raw'], // raw = DICOM e outros não-imagem (PDF entra como image)
      required: true,
    },
    format: { type: String, trim: true, default: null }, // jpg, png, pdf, dcm
    bytes: { type: Number, min: 0, default: 0 },
    // Visível ao paciente no portal? (RX sim; notas internas não)
    visibleToPatient: {
      type: Boolean,
      default: false,
      index: true,
    },
    uploadedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    note: { type: String, trim: true, maxlength: 300, default: null },
    // --- Anulação (never delete) --------------------------------------------
    voidedAt: { type: Date, default: null },
    voidedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    voidReason: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true },
);

DocumentSchema.index({ patientId: 1, category: 1, createdAt: -1 });

export type DocumentDoc = InferSchemaType<typeof DocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ClinicalDocument: Model<DocumentDoc> =
  (mongoose.models.Document as Model<DocumentDoc>) ??
  mongoose.model<DocumentDoc>('Document', DocumentSchema);

export default ClinicalDocument;
