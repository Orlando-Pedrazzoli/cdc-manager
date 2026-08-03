// 📄 src/models/TreatmentPlan.ts
// =============================================================================
// CDC Manager — Model: TreatmentPlan
// -----------------------------------------------------------------------------
// Plano de tratamento / orçamento. O médico compõe os atos propostos,
// gera-se o orçamento (PDF), o paciente aprova (presencial ou no portal),
// e a execução vai sendo registada: cada item aprovado gera um Procedure
// 'planned' que transita para 'completed' quando executado.
//
// CICLO: draft → proposed → approved → in-progress → completed
//                    │
//                    └──► declined / expired
//
// Os itens guardam snapshot de preço (o orçamento entregue ao paciente é um
// compromisso — não muda se a tabela mudar). Validade típica: 60 dias.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const PLAN_STATUS = [
  'draft',
  'proposed',
  'approved',
  'in-progress',
  'completed',
  'declined',
  'expired',
] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

const FDI_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

const PlanItemSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      required: true,
    },
    nameSnapshot: { type: String, required: true, trim: true },
    priceCents: { type: Number, required: true, min: 0 },
    toothNumbers: {
      type: [{ type: String, match: [FDI_REGEX, 'Dente inválido (FDI)'] }],
      default: [],
    },
    // Ordem clínica de execução (fase 1, fase 2...)
    phase: { type: Number, min: 1, default: 1 },
    // Procedure gerado quando o plano é aprovado (null até lá)
    procedureId: {
      type: Schema.Types.ObjectId,
      ref: 'Procedure',
      default: null,
    },
  },
  { _id: true },
);

const TreatmentPlanSchema = new Schema(
  {
    // MULTI-CLÍNICA (Sprint 3): clínica onde o plano foi criado/proposto —
    // dá contexto aos relatórios ("orçamentos propostos na Buraca") e é a
    // clínica default herdada pelos Procedures 'planned' na aprovação.
    // Na execução de cada item prevalece a clínica da consulta real.
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    status: {
      type: String,
      enum: PLAN_STATUS,
      default: 'draft',
      index: true,
    },
    items: {
      type: [PlanItemSchema],
      default: [],
    },
    // Total em cêntimos (soma dos itens; materializado no proposed)
    totalCents: { type: Number, min: 0, default: 0 },
    // Desconto global do plano, se negociado (valor, não percentagem)
    discountCents: { type: Number, min: 0, default: 0 },
    validUntil: { type: Date, default: null },
    proposedAt: { type: Date, default: null },
    // Aprovação: presencial (receção regista) ou portal (paciente clica)
    approvedAt: { type: Date, default: null },
    approvedVia: {
      type: String,
      enum: ['in-person', 'portal', null],
      default: null,
    },
    declinedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

TreatmentPlanSchema.index({ patientId: 1, createdAt: -1 });

export type TreatmentPlanDoc = InferSchemaType<typeof TreatmentPlanSchema> & {
  _id: mongoose.Types.ObjectId;
};

const TreatmentPlan: Model<TreatmentPlanDoc> =
  (mongoose.models.TreatmentPlan as Model<TreatmentPlanDoc>) ??
  mongoose.model<TreatmentPlanDoc>('TreatmentPlan', TreatmentPlanSchema);

export default TreatmentPlan;
