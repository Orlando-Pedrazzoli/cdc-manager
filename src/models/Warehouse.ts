// 📄 src/models/Warehouse.ts
// =============================================================================
// CDC Manager — Model: Warehouse
// -----------------------------------------------------------------------------
// Armazém/local de stock. O Dentoral já trabalha multi-armazém ("Armazéns"
// nas Tabelas > Stocks) e mantemos o conceito: tipicamente um armazém geral
// e, se a clínica quiser, sub-stocks por zona (ex.: "Esterilização",
// "Gabinetes piso -1").
//
// O saldo de stock NÃO vive aqui nem no Product — é derivado da soma dos
// StockMovement por (product × warehouse). Ver nota no Product.ts.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const WarehouseSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 80,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    // Armazém default: recebe as baixas automáticas das BOM ao fechar
    // consultas. Exatamente um deve ter isDefault: true (imposto na action)
    isDefault: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export type WarehouseDoc = InferSchemaType<typeof WarehouseSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Warehouse: Model<WarehouseDoc> =
  (mongoose.models.Warehouse as Model<WarehouseDoc>) ??
  mongoose.model<WarehouseDoc>('Warehouse', WarehouseSchema);

export default Warehouse;
