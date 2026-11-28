// 📄 src/models/CardReadTicket.ts
// =============================================================================
// CDC Manager — Model: CardReadTicket (leitura do Cartão de Cidadão)
// -----------------------------------------------------------------------------
// Código de uso único entre o formulário da ficha e o leitor do posto
// (lib/citizen-card.ts). Guarda-se só o HASH do código. Os dados lidos ficam
// aqui no máximo 3 minutos (índice TTL) e são apagados assim que o
// formulário os recebe — a ficha só os guarda quando a receção gravar.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const CardReadTicketSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    data: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null, maxlength: 200 },
    filledAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
// O MongoDB apaga o registo quando expiresAt passa
CardReadTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type CardReadTicketDoc = InferSchemaType<typeof CardReadTicketSchema> & {
  _id: mongoose.Types.ObjectId;
};

const CardReadTicket: Model<CardReadTicketDoc> =
  (mongoose.models.CardReadTicket as Model<CardReadTicketDoc>) ??
  mongoose.model<CardReadTicketDoc>('CardReadTicket', CardReadTicketSchema);

export default CardReadTicket;
