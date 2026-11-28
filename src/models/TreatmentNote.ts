// 📄 src/models/TreatmentNote.ts
// =============================================================================
// CDC Manager — Model: nota do tratamento (ponto 32, Giulia, 27/11/2026)
// Lista por paciente, mostrada na aba do odontograma. Regras em
// lib/treatment-notes.ts. Arquivar ≠ apagar: a nota fica com quem a arquivou.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const TreatmentNoteSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // nome e perfil de quem escreveu, na altura (o utilizador pode mudar)
    authorName: { type: String, trim: true, maxlength: 160, default: null },
    authorRole: { type: String, trim: true, maxlength: 20, default: null },
    archivedAt: { type: Date, default: null },
    archivedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    archivedByName: { type: String, trim: true, maxlength: 160, default: null },
  },
  { timestamps: true },
);

TreatmentNoteSchema.index({ patientId: 1, archivedAt: 1, createdAt: -1 });

export type TreatmentNoteDoc = InferSchemaType<typeof TreatmentNoteSchema> & {
  _id: mongoose.Types.ObjectId;
};

const TreatmentNote: Model<TreatmentNoteDoc> =
  (mongoose.models.TreatmentNote as Model<TreatmentNoteDoc>) ??
  mongoose.model<TreatmentNoteDoc>('TreatmentNote', TreatmentNoteSchema);

export default TreatmentNote;
