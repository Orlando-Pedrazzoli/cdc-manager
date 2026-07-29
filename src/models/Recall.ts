// 📄 src/models/Recall.ts
// =============================================================================
// CDC Manager — Model: Recall
// -----------------------------------------------------------------------------
// Ciclo de reativação: criado automaticamente quando um Procedure de um ato
// com recallIntervalMonths é executado (ex.: destartarização → recall a
// +6 meses). O cron semanal convida os 'due' por WhatsApp com link de
// marcação; conversão medida por recall (a métrica de ouro do módulo).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const RECALL_STATUS = [
  'scheduled', // aguarda a data
  'due', // data chegou; na fila de contacto
  'contacted', // convite enviado
  'booked', // converteu: marcação criada
  'dismissed', // paciente recusou / receção descartou
  'unreachable', // tentativas esgotadas sem resposta
] as const;
export type RecallStatus = (typeof RECALL_STATUS)[number];

const RecallSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      required: true,
    },
    // Procedure que originou o ciclo
    sourceProcedureId: {
      type: Schema.Types.ObjectId,
      ref: 'Procedure',
      required: true,
    },
    // Médico do ato original (o convite sugere o mesmo médico)
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    dueAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: RECALL_STATUS,
      default: 'scheduled',
      index: true,
    },
    contactAttempts: { type: Number, min: 0, default: 0 },
    lastContactedAt: { type: Date, default: null },
    bookedAppointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
  },
  { timestamps: true },
);

// Cron semanal: scheduled cuja data chegou → due; due por contactar
RecallSchema.index({ status: 1, dueAt: 1 });

export type RecallDoc = InferSchemaType<typeof RecallSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Recall: Model<RecallDoc> =
  (mongoose.models.Recall as Model<RecallDoc>) ??
  mongoose.model<RecallDoc>('Recall', RecallSchema);

export default Recall;
