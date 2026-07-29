// 📄 src/models/Invoice.ts
// =============================================================================
// CDC Manager — Model: Invoice
// -----------------------------------------------------------------------------
// Espelho local do documento de faturação emitido via Moloni (software
// certificado AT). O CDC Manager NÃO é o emissor fiscal — o Moloni é.
// Este model guarda a referência ao documento certificado + o estado
// operacional do checkout no balcão.
//
// FLUXO (Sprint 4):
//   1. Receção abre o checkout com os Procedures 'completed' do paciente
//   2. Confirma valores/meio de pagamento → action chama a API Moloni
//   3. Moloni emite fatura-recibo certificada (numeração DELE, ex. FR CDC1/123)
//   4. Gravamos aqui o espelho: ids Moloni, totais, meio de pagamento
//   5. Procedures ligados passam a status 'invoiced'
//   6. PDF fica disponível no portal do paciente (via link/download Moloni)
//
// ANULAÇÃO: fatura certificada nunca se apaga — anula-se no Moloni (nota de
// crédito) e refletimos aqui com status 'voided' + referência à NC.
//
// Clínica 100% particular: sem split de entidades, um pagador (o paciente).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const INVOICE_STATUS = [
  'issued', // emitida e paga no ato (fatura-recibo — o caso normal no balcão)
  'pending', // emitida, pagamento por regularizar (transferência a confirmar)
  'voided', // anulada via nota de crédito no Moloni
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const PAYMENT_METHODS = [
  'cash', // numerário
  'card', // multibanco/cartão no TPA
  'mbway', // MB WAY (pedido na máquina com o nº do paciente)
  'transfer', // transferência bancária
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Linha da fatura — snapshot no momento da emissão (imutável)
const InvoiceLineSchema = new Schema(
  {
    procedureId: {
      type: Schema.Types.ObjectId,
      ref: 'Procedure',
      required: true,
    },
    description: { type: String, required: true, trim: true },
    priceCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const InvoiceSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: INVOICE_STATUS,
      required: true,
      index: true,
    },
    lines: {
      type: [InvoiceLineSchema],
      required: true,
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: 'Fatura sem linhas',
      },
    },
    // Total em cêntimos. Serviços de saúde: isentos de IVA (art. 9.º CIVA),
    // portanto total = soma das linhas; o motivo de isenção é tratado no
    // Moloni na configuração dos artigos
    totalCents: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    paidAt: {
      type: Date,
      default: null, // null enquanto status 'pending'
    },
    // NIF no documento (para dedução IRS; null = consumidor final)
    nifSnapshot: {
      type: String,
      match: [/^\d{9}$/, 'NIF inválido'],
      default: null,
    },
    // --- Referências Moloni (o documento certificado real) ------------------
    moloniDocumentId: {
      type: Number, // document_id devolvido pela API Moloni
      required: true,
      unique: true,
    },
    // Identificação legível: "FR CDC1/123" (série + número da AT)
    moloniDocumentNumber: {
      type: String,
      required: true,
      trim: true,
    },
    // ATCUD do documento (obrigatório nos documentos desde 2023)
    atcud: {
      type: String,
      trim: true,
      default: null,
    },
    // --- Anulação -----------------------------------------------------------
    voidedAt: { type: Date, default: null },
    // Nota de crédito Moloni que anulou este documento
    creditNoteMoloniId: { type: Number, default: null },
    voidReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    // Quem fez o checkout (receção/admin)
    issuedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Portal do paciente: as minhas faturas, mais recentes primeiro
InvoiceSchema.index({ patientId: 1, createdAt: -1 });
// Relatórios de faturação por período
InvoiceSchema.index({ status: 1, paidAt: -1 });

export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Invoice: Model<InvoiceDoc> =
  (mongoose.models.Invoice as Model<InvoiceDoc>) ??
  mongoose.model<InvoiceDoc>('Invoice', InvoiceSchema);

export default Invoice;
