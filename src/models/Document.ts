// 📄 src/models/Document.ts
// =============================================================================
// CDC Manager — Model: Document
// -----------------------------------------------------------------------------
// Ficheiro clínico/administrativo do paciente no Cloudinary: radiografias,
// TAC, fotografias clínicas, consentimentos assinados, relatórios externos.
// Guardamos METADADOS + public_id; o binário vive no Cloudinary com acesso
// `authenticated` (nunca URLs públicas — dados de saúde). As URLs de
// visualização são assinadas e de curta duração, geradas on-demand em
// lib/cloudinary.ts.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const DOCUMENT_CATEGORIES = [
  'xray', // radiografia (periapical, panorâmica)
  'cbct', // TAC / CBCT
  'photo', // fotografia clínica
  'consent', // consentimento informado assinado
  'report', // relatório/carta externa
  'prescription', // receita (PDF gerado)
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

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
      enum: ['image', 'raw'], // raw = PDFs e outros não-imagem
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
