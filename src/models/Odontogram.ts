// 📄 src/models/Odontogram.ts
// =============================================================================
// CDC Manager — Model: Odontogram
// -----------------------------------------------------------------------------
// Estado dentário do paciente em notação FDI, com HISTÓRICO por versões:
// cada alteração grava uma nova versão (snapshot completo) — o médico pode
// ver o odontograma "como estava em janeiro" e comparar evolução.
//
// Modelo por dente × faces:
//   toothStatus  — estado global do dente (presente, ausente, implante...)
//   faces        — condições por face (O oclusal, M mesial, D distal,
//                  V vestibular, L lingual/palatina)
//
// A versão CORRENTE é a de maior `version` — query servida pelo índice
// composto; versões antigas nunca se alteram.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
// Constantes canónicas em lib/domain.ts (partilhadas com o client sem
// arrastar mongoose) — re-exportadas aqui para o código server
import {
  TOOTH_STATUS,
  FACE_CONDITIONS,
  TOOTH_FACES,
  type ToothStatus,
  type FaceCondition,
  type ToothFace,
} from '@/lib/domain';
export { TOOTH_STATUS, FACE_CONDITIONS, TOOTH_FACES };
export type { ToothStatus, FaceCondition, ToothFace };

const FDI_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

const ToothFaceSchema = new Schema(
  {
    face: { type: String, enum: TOOTH_FACES, required: true },
    condition: { type: String, enum: FACE_CONDITIONS, required: true },
  },
  { _id: false },
);

const ToothSchema = new Schema(
  {
    number: {
      type: String,
      required: true,
      match: [FDI_REGEX, 'Dente inválido (FDI)'],
    },
    status: {
      type: String,
      enum: TOOTH_STATUS,
      default: 'present',
    },
    faces: { type: [ToothFaceSchema], default: [] },
    note: { type: String, trim: true, maxlength: 200, default: null },
  },
  { _id: false },
);

const OdontogramSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    // Só os dentes com algo a assinalar — dentes omissos = 'present' são.
    // Mantém os documentos pequenos (32 dentes sãos = array vazio)
    teeth: { type: [ToothSchema], default: [] },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    // Consulta em que a alteração foi registada
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = data da versão
  },
);

// Versão corrente: findOne({patientId}).sort({version:-1}) — servido por este índice
OdontogramSchema.index({ patientId: 1, version: -1 }, { unique: true });

export type OdontogramDoc = InferSchemaType<typeof OdontogramSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Odontogram: Model<OdontogramDoc> =
  (mongoose.models.Odontogram as Model<OdontogramDoc>) ??
  mongoose.model<OdontogramDoc>('Odontogram', OdontogramSchema);

export default Odontogram;
