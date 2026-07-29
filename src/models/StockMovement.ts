// 📄 src/models/StockMovement.ts
// =============================================================================
// CDC Manager — Model: StockMovement
// -----------------------------------------------------------------------------
// O LEDGER de stock: cada documento é um movimento imutável. Nunca se edita
// nem apaga um movimento — corrige-se com um movimento de acerto (mesma
// filosofia do Procedure.void e de qualquer contabilidade séria).
//
// Convenção de sinal: quantity é SEMPRE positiva; o tipo define a direção.
//   ENTRADAS:  purchase (compra), adjustment-in (acerto +), transfer-in
//   SAÍDAS:    consumption (baixa por procedimento), adjustment-out,
//              transfer-out, waste (quebra/validade)
// Transferência entre armazéns = par transfer-out + transfer-in criado
// atomicamente na mesma transação, ligado por transferGroupId.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const STOCK_MOVEMENT_TYPES = [
  'purchase',
  'consumption',
  'adjustment-in',
  'adjustment-out',
  'transfer-in',
  'transfer-out',
  'waste',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Tipos que somam ao saldo; os restantes subtraem */
export const INBOUND_TYPES: StockMovementType[] = [
  'purchase',
  'adjustment-in',
  'transfer-in',
];

const StockMovementSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
    },
    type: {
      type: String,
      enum: STOCK_MOVEMENT_TYPES,
      required: true,
    },
    // Sempre positiva (direção dada pelo type) — elimina a ambiguidade
    // clássica de sinais trocados em acertos
    quantity: {
      type: Number,
      required: true,
      min: [0.001, 'Quantidade deve ser positiva'],
    },
    // Custo unitário em cêntimos no momento (compras: preço pago;
    // consumos: custo corrente do produto) — valorização histórica correta
    unitCostCents: {
      type: Number,
      min: 0,
      default: 0,
    },
    // --- Rastreabilidade da origem ------------------------------------------
    // Consumo automático: qual procedimento o gerou
    procedureId: {
      type: Schema.Types.ObjectId,
      ref: 'Procedure',
      default: null,
      index: true,
    },
    // Par de transferência (transfer-out + transfer-in partilham este id)
    transferGroupId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    // Quem registou (null = movimento automático do sistema)
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = data do movimento
  },
);

// Extrato de um produto (ecrã "Movimentos de Stocks", como no Dentoral)
StockMovementSchema.index({ productId: 1, createdAt: -1 });
// Recálculo de saldo por produto × armazém
StockMovementSchema.index({ productId: 1, warehouseId: 1 });

export type StockMovementDoc = InferSchemaType<typeof StockMovementSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StockMovement: Model<StockMovementDoc> =
  (mongoose.models.StockMovement as Model<StockMovementDoc>) ??
  mongoose.model<StockMovementDoc>('StockMovement', StockMovementSchema);

export default StockMovement;
