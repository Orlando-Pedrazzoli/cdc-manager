// 📄 src/models/ProductSale.ts
// =============================================================================
// CDC Manager — Model: ProductSale (venda de produtos ao balcão)
// -----------------------------------------------------------------------------
// 7.ª ronda/B2b. Uma venda feita pela receção, SEM médico e FORA das
// comissões e da produção clínica (não é um Procedure). Guarda o que foi
// vendido com nome, preço e IVA congelados no momento, o meio de pagamento,
// quem vendeu e, se for o caso, quem anulou e porquê — nunca se apaga.
//
// NÃO emite documento fiscal: `fiscalDocument` regista o n.º da fatura quando
// ela for passada (à mão ou, mais tarde, pelo Moloni com as taxas de IVA
// configuradas). Até lá a venda aparece como "por faturar".
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { PAYMENT_METHODS } from '@/lib/domain';
import { VAT_RATES } from '@/lib/product-sales';

const ProductSaleLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'SaleProduct', required: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    unitPriceCents: { type: Number, required: true, min: 0 }, // com IVA
    vatRate: { type: Number, enum: VAT_RATES, required: true },
    totalCents: { type: Number, required: true, min: 0 },
    vatCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const ProductSaleSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    // Opcional: pode vender-se a quem não é paciente da clínica
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
    lines: {
      type: [ProductSaleLineSchema],
      required: true,
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: 'Venda sem produtos',
      },
    },
    totalCents: { type: Number, required: true, min: 0 },
    vatCents: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    note: { type: String, trim: true, maxlength: 300, default: null },
    soldAt: { type: Date, required: true, index: true },
    soldByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // N.º do documento fiscal, quando emitido (null = por faturar)
    fiscalDocument: { type: String, trim: true, maxlength: 60, default: null },
    // Anulação (só a gestão) — a venda fica no histórico
    voidedAt: { type: Date, default: null },
    voidedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true },
);

ProductSaleSchema.index({ clinicId: 1, soldAt: -1 });

export type ProductSaleDoc = InferSchemaType<typeof ProductSaleSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ProductSale: Model<ProductSaleDoc> =
  (mongoose.models.ProductSale as Model<ProductSaleDoc>) ??
  mongoose.model<ProductSaleDoc>('ProductSale', ProductSaleSchema);

export default ProductSale;
