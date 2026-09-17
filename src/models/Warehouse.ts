// 📄 src/models/Warehouse.ts
// =============================================================================
// CDC Manager — Model: Warehouse
// -----------------------------------------------------------------------------
// LOCAL de stock (set/2026 — redesenho a pedido da Isabel):
//   Um Warehouse é um local físico da clínica com stock próprio. Há dois
//   papéis, dados por `kind`:
//     · 'central' (isDefault): o armazém central — TUDO o que entra na
//       clínica (fatura de fornecedor) entra aqui. Exatamente um por clínica.
//     · restantes (gabinete, esterilização, RX, receção, serviços): recebem
//       stock por REQUISIÇÃO (transfer-out central → transfer-in local) e o
//       consumo apura-se por CONTAGEM periódica — nunca pela linha de
//       tratamento. Isto é a "baixa" que a Isabel pediu: dá-se quando o
//       material é destinado ao local, não quando o médico fecha a consulta.
//   Gabinetes ('operatory') aparecem também na agenda (Appointment.roomId)
//   para se saber quem trabalhou em cada um entre contagens.
//
// MULTI-CLÍNICA: cada local pertence a UMA clínica — o stock do Colombo
// e o da Buraca são fisicamente separados e nunca se misturam.
// Transferência entre clínicas = par transfer-out/transfer-in entre os
// dois armazéns centrais.
//
// Nome único POR CLÍNICA (índice composto): as duas podem ter o seu
// "Armazém Geral" sem conflito.
//
// O saldo de stock NÃO vive aqui nem no Product — é derivado da soma dos
// StockMovement por (product × warehouse). Ver nota no Product.ts.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { WAREHOUSE_KINDS, type WarehouseKind } from '@/lib/domain';

export { WAREHOUSE_KINDS, type WarehouseKind };

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
    // Papel do local (ver cabeçalho). Legado sem kind = 'central' se
    // isDefault, senão 'other'
    kind: {
      type: String,
      enum: WAREHOUSE_KINDS,
      default: 'other',
      index: true,
    },
    // Responsável pelo local (quem faz a contagem / recebe as requisições).
    // null = administrador
    responsibleUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Ordem de apresentação nos painéis (Gabinete 1..5)
    sortOrder: {
      type: Number,
      default: 0,
    },
    // Data/hora da última contagem fechada (materialização de StockCount;
    // alimenta o alerta "contagem em atraso" sem query ao histórico)
    lastCountAt: {
      type: Date,
      default: null,
    },
    // Armazém CENTRAL da sua clínica (kind 'central'): única porta de
    // entrada de stock e origem das requisições. Exatamente um por clínica
    // deve ter isDefault: true (imposto na action)
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
