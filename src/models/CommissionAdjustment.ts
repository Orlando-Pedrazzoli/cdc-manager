// 📄 src/models/CommissionAdjustment.ts
// =============================================================================
// CDC Manager — Model: CommissionAdjustment (estorno de remuneração)
// -----------------------------------------------------------------------------
// PROBLEMA (E2, email da Isabel): quando uma fatura é anulada por nota de
// crédito e o erro está nos TRATAMENTOS, a linha tem de ser "contabilizada
// a negativo, anulando o tratamento e o respetivo valor".
//
// PORQUÊ UM MODEL PRÓPRIO E NÃO UM Procedure NEGATIVO:
//   · Procedure tem `min: 0` em todos os valores e o resto do sistema soma
//     priceCents assumindo positivos (cobrança, faturas, dashboards).
//   · O acerto de contas com os médicos é MENSAL. Se um ato de março for
//     anulado em maio, o mapa de março já foi pago — não pode "mudar
//     sozinho". O estorno tem de aparecer em MAIO, a negativo.
//   · Append-only: nunca se edita nem apaga (mesma filosofia do AuditLog).
//
// REGRA DE FECHO DE MÊS (implementada nos relatórios e no dashboard):
//   Produção do mês M = atos executados em M que estavam válidos no FECHO
//   de M (status completed/invoiced, OU void com voidedAt ≥ fim de M)
//   + ajustes com effectiveAt em M.
//   Assim: anulação no PRÓPRIO mês → o ato simplesmente sai da produção
//   (não há ajuste); anulação em mês POSTERIOR → o ato fica no mês original
//   (como foi pago) e o ajuste negativo cai no mês da anulação.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const ADJUSTMENT_REASONS = [
  'invoice-void', // anulação de fatura com anulação dos tratamentos
  'procedure-void', // anulação direta de um ato de mês já fechado
  'manual', // acerto manual da administração (reservado)
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

const CommissionAdjustmentSchema = new Schema(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    procedureId: {
      type: Schema.Types.ObjectId,
      ref: 'Procedure',
      default: null,
      // índice único (sparse) declarado em schema.index() mais abaixo
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    reason: {
      type: String,
      enum: ADJUSTMENT_REASONS,
      required: true,
    },
    // Snapshots para a listagem detalhada (E7) sem joins
    descriptionSnapshot: { type: String, required: true, trim: true },
    categorySnapshot: { type: String, trim: true, default: null },
    // Valores a NEGATIVO (estorno). Inteiros em cêntimos.
    priceCents: { type: Number, required: true, max: 0 },
    costCents: { type: Number, required: true, max: 0 },
    commissionBaseCents: { type: Number, required: true, max: 0 },
    commissionCents: { type: Number, required: true, max: 0 },
    // Mês em que o estorno conta (data da anulação, Lisboa)
    effectiveAt: { type: Date, required: true, index: true },
    // Mês original do ato (informativo, para a listagem explicar o estorno)
    originalExecutedAt: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 300, default: null },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

CommissionAdjustmentSchema.index({ doctorId: 1, effectiveAt: -1 });
CommissionAdjustmentSchema.index({ effectiveAt: 1, clinicId: 1 });
// Um estorno por ato: idempotência da anulação
CommissionAdjustmentSchema.index(
  { procedureId: 1 },
  { unique: true, sparse: true },
);

export type CommissionAdjustmentDoc = InferSchemaType<
  typeof CommissionAdjustmentSchema
> & { _id: mongoose.Types.ObjectId };

const CommissionAdjustment: Model<CommissionAdjustmentDoc> =
  (mongoose.models.CommissionAdjustment as Model<CommissionAdjustmentDoc>) ??
  mongoose.model<CommissionAdjustmentDoc>(
    'CommissionAdjustment',
    CommissionAdjustmentSchema,
  );

export default CommissionAdjustment;
