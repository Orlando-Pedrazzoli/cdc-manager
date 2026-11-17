// 📄 src/models/ExpiryItem.ts
// =============================================================================
// CDC Manager — Prazos de validade (8.ª ronda/16 e 17, Victor 17/11/2026)
// -----------------------------------------------------------------------------
// Um registo = uma coisa com data de validade que a gestão tem de renovar:
//   · scope 'doctor'  — documento de um médico (seguro, cédula, ficha de
//     aptidão…). "Não é preciso guardar o documento, só o nome e a data de
//     validade." Alerta 30 dias antes, visível para o médico e para a gestão;
//     depois de vencer, aviso todos os dias.
//   · scope 'partner' — empresa parceira / renovação (licenças, GyRad,
//     extintores, seguros, manutenções), "só com os dados cadastrais e a
//     data de validade (sem upload de documentos)".
// Hoje este controlo é feito num Excel.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const EXPIRY_SCOPES = ['doctor', 'partner'] as const;
export type ExpiryScope = (typeof EXPIRY_SCOPES)[number];

const ExpiryItemSchema = new Schema(
  {
    scope: { type: String, enum: EXPIRY_SCOPES, required: true, index: true },
    /** Só para scope 'doctor' */
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
      index: true,
    },
    /** Documento ("Seguro de responsabilidade civil") ou o que se renova
     *  ("Manutenção dos extintores") */
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Só para scope 'partner': empresa e contactos */
    company: { type: String, trim: true, maxlength: 120, default: null },
    contact: { type: String, trim: true, maxlength: 120, default: null },
    phone: { type: String, trim: true, maxlength: 40, default: null },
    email: { type: String, trim: true, maxlength: 120, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null },
    expiresAt: { type: Date, required: true },
    active: { type: Boolean, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

ExpiryItemSchema.index({ active: 1, expiresAt: 1 });

export type ExpiryItemDoc = InferSchemaType<typeof ExpiryItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ExpiryItem: Model<ExpiryItemDoc> =
  (mongoose.models.ExpiryItem as Model<ExpiryItemDoc>) ??
  mongoose.model<ExpiryItemDoc>('ExpiryItem', ExpiryItemSchema);

export default ExpiryItem;
