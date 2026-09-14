// 📄 src/models/Supplier.ts
// =============================================================================
// CDC Manager — Model: Supplier (Fornecedor / Laboratório)
// -----------------------------------------------------------------------------
// Pedido da Isabel (E3): "Esta entidade 'Laboratórios' pode ser criada no
// separador FORNECEDORES mas na ficha ter um campo que permita colocar um
// pisco em 'laboratório'". É uma entidade só — Supplier — com a flag
// `isLab`. Os laboratórios alimentam o seletor dos pedidos de laboratório
// (LabCase.supplierId); os restantes fornecedores servem a Fase 6
// (faturas de fornecedor com IA → stock).
// Never delete: `active: false` esconde do seletor sem partir o histórico.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const SupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Pisco "laboratório" — aparece nos pedidos de trabalhos externos
    isLab: { type: Boolean, default: false, index: true },
    nif: { type: String, trim: true, maxlength: 20, default: null },
    contactName: { type: String, trim: true, maxlength: 80, default: null },
    phone: { type: String, trim: true, maxlength: 30, default: null },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: null,
    },
    address: { type: String, trim: true, maxlength: 200, default: null },
    // Prazo habitual de retorno em dias úteis (pré-preenche a data prevista)
    defaultLeadDays: { type: Number, min: 0, max: 120, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null },
    active: { type: Boolean, default: true, index: true },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

SupplierSchema.index({ name: 1 }, { collation: { locale: 'pt', strength: 2 } });

export type SupplierDoc = InferSchemaType<typeof SupplierSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Supplier: Model<SupplierDoc> =
  (mongoose.models.Supplier as Model<SupplierDoc>) ??
  mongoose.model<SupplierDoc>('Supplier', SupplierSchema);

export default Supplier;
