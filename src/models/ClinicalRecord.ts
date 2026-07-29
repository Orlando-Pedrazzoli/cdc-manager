// 📄 src/models/ClinicalRecord.ts
// =============================================================================
// CDC Manager — Model: ClinicalRecord
// -----------------------------------------------------------------------------
// Ficha CLÍNICA do paciente (1:1 com Patient, criada lazy no primeiro acesso
// clínico). Separada do Patient administrativo por RGPD/minimização: a
// receção vê o Patient; só médicos (e admin) veem o ClinicalRecord.
//
// Duas partes:
//   1. ANAMNESE estruturada — questionário de saúde com alergias e medicação
//      em campos próprios (destaque permanente no topo da ficha do médico)
//   2. NOTAS CLÍNICAS — entradas cronológicas imutáveis (append-only).
//      Nota escrita não se edita nem apaga: emenda-se com nova entrada.
//      É o padrão médico-legal de registos clínicos (e o que protege o
//      médico e a clínica em qualquer disputa).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

// Entrada de nota clínica (append-only)
const ClinicalNoteSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    // Emenda a uma nota anterior (referência à nota corrigida)
    amendsNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const ClinicalRecordSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      unique: true, // 1:1 com Patient
    },
    // --- Anamnese ------------------------------------------------------------
    // Alergias e medicação em arrays próprios — SEMPRE visíveis no topo
    allergies: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      default: [],
    },
    currentMedications: {
      type: [{ type: String, trim: true, maxlength: 160 }],
      default: [],
    },
    // Condições sistémicas relevantes (diabetes, hipertensão, coagulação,
    // gravidez, próteses cardíacas...) — checklist + detalhe livre
    systemicConditions: {
      type: [
        new Schema(
          {
            condition: { type: String, required: true, trim: true },
            detail: { type: String, trim: true, maxlength: 300, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    smoker: { type: Boolean, default: null }, // null = não perguntado
    anamnesisNotes: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: null,
    },
    anamnesisUpdatedAt: { type: Date, default: null },
    anamnesisUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    // --- Notas clínicas (append-only) ---------------------------------------
    notes: {
      type: [ClinicalNoteSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type ClinicalRecordDoc = InferSchemaType<typeof ClinicalRecordSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ClinicalRecord: Model<ClinicalRecordDoc> =
  (mongoose.models.ClinicalRecord as Model<ClinicalRecordDoc>) ??
  mongoose.model<ClinicalRecordDoc>('ClinicalRecord', ClinicalRecordSchema);

export default ClinicalRecord;
