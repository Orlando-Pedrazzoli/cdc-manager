// 📄 src/models/Product.ts
// =============================================================================
// CDC Manager — Model: Product
// -----------------------------------------------------------------------------
// Material de consumo clínico (catálogo de stocks). Espelha o que o Dentoral
// tem em "Famílias de Materiais" mas com o essencial bem resolvido:
// unidades, mínimos, custo e o cache de saldo.
//
// SALDO — arquitetura ledger (a decisão estrutural do módulo):
//   A VERDADE do stock é a soma dos StockMovement (entradas - saídas) por
//   produto × armazém. O campo `stockCache` aqui é apenas uma MATERIALIZAÇÃO
//   para leituras rápidas (listagens, alertas), atualizado atomicamente
//   ($inc) na mesma transação de cada movimento. Se alguma vez divergir
//   (bug, intervenção manual na BD), um recálculo a partir do ledger
//   corrige-o — o inverso (só campo mutável, sem ledger) é incorrigível.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

// Unidades base de consumo — a BOM dos TreatmentType consome nestas unidades
export const PRODUCT_UNITS = [
  'un', // unidade (luvas par, agulha, cápsula, película RX)
  'ml', // líquidos (anestésico, hipoclorito)
  'g', // pós e pastas (gesso, compósito a peso)
  'caixa', // quando a clínica gere por caixa fechada
] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

// Sub-schema: cache de saldo por armazém
const StockCacheSchema = new Schema(
  {
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
    },
    quantity: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 160,
      index: 'text',
    },
    // Família/categoria (ex.: "Anestesia", "Endodontia", "Descartáveis") —
    // texto livre gerido pelo admin; espelha as famílias do Dentoral
    family: {
      type: String,
      trim: true,
      maxlength: 80,
      default: null,
      index: true,
    },
    // Referência do fornecedor / código de catálogo
    supplierRef: {
      type: String,
      trim: true,
      default: null,
    },
    supplierName: {
      type: String,
      trim: true,
      default: null,
    },
    unit: {
      type: String,
      enum: PRODUCT_UNITS,
      required: true,
      default: 'un',
    },
    // Custo unitário em cêntimos (última compra) — para valorização de
    // inventário e relatório de consumo em €
    costCents: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Nível mínimo TOTAL (soma dos armazéns) que dispara alerta de reposição
    minStock: {
      type: Number,
      min: 0,
      default: 0,
    },
    stockCache: {
      type: [StockCacheSchema],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export type ProductDoc = InferSchemaType<typeof ProductSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Saldo total do produto (soma de todos os armazéns) a partir do cache */
export function getTotalStock(p: Pick<ProductDoc, 'stockCache'>): number {
  return p.stockCache.reduce((sum, c) => sum + c.quantity, 0);
}

const Product: Model<ProductDoc> =
  (mongoose.models.Product as Model<ProductDoc>) ??
  mongoose.model<ProductDoc>('Product', ProductSchema);

export default Product;
