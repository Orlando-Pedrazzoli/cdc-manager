// 📄 src/models/StockLevel.ts
// =============================================================================
// CDC Manager — Model: StockLevel (par level por produto × local)
// -----------------------------------------------------------------------------
// Mínimo/máximo de cada produto EM CADA LOCAL. Melhor prática de stock
// clínico multi-localização: o par level calibra-se por local (o gabinete
// de cirurgia gasta anestesia a outro ritmo que o de higiene; a Buraca não
// é o Colombo), nunca como definição global — Product.minStock continua a
// existir como alerta de TOTAL da clínica (encomenda ao fornecedor).
//
//   min → abaixo disto o local aparece no alerta "a repor" (requisição)
//   max → alvo a que a requisição repõe (sugestão de quantidade = max − saldo)
//
// Um documento por (product × warehouse); upsert na action. Sem histórico:
// a revisão trimestral dos níveis é um ajuste, não um movimento.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const StockLevelSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    min: { type: Number, min: 0, default: 0 },
    max: { type: Number, min: 0, default: 0 },
    updatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

StockLevelSchema.index({ productId: 1, warehouseId: 1 }, { unique: true });

export type StockLevelDoc = InferSchemaType<typeof StockLevelSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StockLevel: Model<StockLevelDoc> =
  (mongoose.models.StockLevel as Model<StockLevelDoc>) ??
  mongoose.model<StockLevelDoc>('StockLevel', StockLevelSchema);

export default StockLevel;
