// 📄 src/models/StockCount.ts
// =============================================================================
// CDC Manager — Model: StockCount (contagem física de um local)
// -----------------------------------------------------------------------------
// É AQUI que o consumo de um gabinete se apura (decisão set/2026, Isabel):
//   consumo = saldo esperado (cache) − quantidade contada
// Nada é lançado à mão por tratamento: o administrador conta o local
// (cadência quinzenal, STOCK_COUNT_INTERVAL_DAYS) e o sistema converte a
// diferença em movimentos do ledger, ligados por countId:
//   contado < esperado → 'consumption' (o que o gabinete gastou)
//   contado > esperado → 'adjustment-in' (erro de registo / devolução)
//
// CICLO: 'open' (linhas com expected congelado no início e counted a
// preencher) → 'closed' (movimentos gerados numa transação; imutável).
// Só pode haver UMA contagem aberta por local. Nunca se apaga uma contagem
// fechada — corrige-se com outra contagem.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { STOCK_COUNT_STATUS, type StockCountStatus } from '@/lib/domain';

export { STOCK_COUNT_STATUS, type StockCountStatus };

const StockCountLineSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Snapshot no início da contagem (nome/unidade nunca mudam o histórico)
    nameSnapshot: { type: String, required: true },
    unitSnapshot: { type: String, required: true },
    // Saldo do cache no momento em que a contagem abriu
    expected: { type: Number, required: true, default: 0 },
    // null = ainda não contado (linha ignorada no fecho? NÃO — o fecho exige
    // todas as linhas contadas; linhas não contadas são removidas antes)
    counted: { type: Number, default: null },
    unitCostCents: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const StockCountSchema = new Schema(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: STOCK_COUNT_STATUS,
      default: 'open',
      index: true,
    },
    lines: { type: [StockCountLineSchema], default: [] },
    openedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    closedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    closedAt: { type: Date, default: null },
    // Resumo materializado no fecho (relatórios sem re-somar linhas)
    consumedValueCents: { type: Number, default: 0 },
    note: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true },
);

// Uma contagem aberta por local
StockCountSchema.index(
  { warehouseId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
StockCountSchema.index({ warehouseId: 1, closedAt: -1 });

export type StockCountDoc = InferSchemaType<typeof StockCountSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StockCount: Model<StockCountDoc> =
  (mongoose.models.StockCount as Model<StockCountDoc>) ??
  mongoose.model<StockCountDoc>('StockCount', StockCountSchema);

export default StockCount;
