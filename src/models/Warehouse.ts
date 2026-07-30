// 📄 src/models/Warehouse.ts
// =============================================================================
// CDC Manager — Model: Warehouse
// -----------------------------------------------------------------------------
// Armazém/local de stock. O Dentoral já trabalha multi-armazém ("Armazéns"
// nas Tabelas > Stocks) e mantemos o conceito: tipicamente um armazém geral
// por clínica e, se quiserem, sub-stocks por zona (ex.: "Esterilização").
//
// MULTI-CLÍNICA: cada armazém pertence a UMA clínica — o stock do Colombo
// e o da Buraca são fisicamente separados e nunca se misturam. Ao fechar
// uma consulta, a baixa automática das BOM sai do armazém DEFAULT da
// clínica onde a consulta aconteceu. Transferência entre clínicas =
// dois StockMovement (saída num armazém, entrada noutro).
//
// Nome único POR CLÍNICA (índice composto): as duas podem ter o seu
// "Armazém Geral" sem conflito.
//
// O saldo de stock NÃO vive aqui nem no Product — é derivado da soma dos
// StockMovement por (product × warehouse). Ver nota no Product.ts.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const WarehouseSchema = new Schema(
  {
    // Clínica dona deste armazém
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    // Armazém default DA SUA CLÍNICA: recebe as baixas automáticas das BOM
    // ao fechar consultas nessa clínica. Exatamente um por clínica deve ter
    // isDefault: true (imposto na action)
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

// Nome único dentro da mesma clínica (substitui o unique global anterior)
WarehouseSchema.index({ clinicId: 1, name: 1 }, { unique: true });

export type WarehouseDoc = InferSchemaType<typeof WarehouseSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Warehouse: Model<WarehouseDoc> =
  (mongoose.models.Warehouse as Model<WarehouseDoc>) ??
  mongoose.model<WarehouseDoc>('Warehouse', WarehouseSchema);

export default Warehouse;
