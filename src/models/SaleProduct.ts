// 📄 src/models/SaleProduct.ts
// =============================================================================
// CDC Manager — Model: SaleProduct (produto de venda ao balcão)
// -----------------------------------------------------------------------------
// 7.ª ronda/B2b. Catálogo do que a clínica VENDE ao paciente (bisnagas de
// branqueamento, escovas, colutórios…). É diferente de `Product`, que é o
// material de consumo clínico do módulo de stock: aqui há preço de venda e
// taxa de IVA; lá há custo, mínimos e saldo por armazém.
// Regras e contas em lib/product-sales.ts.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { VAT_RATES } from '@/lib/product-sales';

const SaleProductSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    // PVP em cêntimos, COM IVA incluído
    priceCents: { type: Number, required: true, min: 0 },
    // Taxa de IVA em % (0, 6, 13 ou 23)
    vatRate: { type: Number, enum: VAT_RATES, required: true, default: 23 },
    active: { type: Boolean, default: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type SaleProductDoc = InferSchemaType<typeof SaleProductSchema> & {
  _id: mongoose.Types.ObjectId;
};

const SaleProduct: Model<SaleProductDoc> =
  (mongoose.models.SaleProduct as Model<SaleProductDoc>) ??
  mongoose.model<SaleProductDoc>('SaleProduct', SaleProductSchema);

export default SaleProduct;
