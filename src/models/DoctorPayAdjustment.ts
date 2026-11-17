// 📄 src/models/DoctorPayAdjustment.ts
// =============================================================================
// CDC Manager — Ajuste manual ao pagamento de um médico (8.ª ronda/14)
// -----------------------------------------------------------------------------
// Victor, 17/11/2026: no pagamento aos médicos faltam "ajustes manuais".
// Uma linha livre lançada pela gestão num mês: um valor a somar ou a
// descontar ao que o médico recebe, com uma descrição (ex.: "Acerto de
// outubro", "Material pago pelo médico").
//
// NÃO mexe na remuneração dos atos nem nos estornos (CommissionAdjustment):
// é uma parcela à parte, somada no fim do extrato. Vale para o médico e o
// mês, sem clínica: só entra no total quando o relatório está em "Ambas".
// Nunca se apaga: retira-se (removedAt), e fica quem lançou e quem retirou.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const DoctorPayAdjustmentSchema = new Schema(
  {
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    /** Mês civil de Lisboa, "YYYY-MM" */
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    description: { type: String, required: true, trim: true, maxlength: 160 },
    /** Cêntimos com sinal: positivo soma, negativo desconta. Nunca 0. */
    amountCents: { type: Number, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    removedAt: { type: Date, default: null },
    removedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

DoctorPayAdjustmentSchema.index({ month: 1, doctorId: 1 });

export type DoctorPayAdjustmentDoc = InferSchemaType<
  typeof DoctorPayAdjustmentSchema
> & { _id: mongoose.Types.ObjectId };

const DoctorPayAdjustment: Model<DoctorPayAdjustmentDoc> =
  (mongoose.models.DoctorPayAdjustment as Model<DoctorPayAdjustmentDoc>) ??
  mongoose.model<DoctorPayAdjustmentDoc>(
    'DoctorPayAdjustment',
    DoctorPayAdjustmentSchema,
  );

export default DoctorPayAdjustment;
