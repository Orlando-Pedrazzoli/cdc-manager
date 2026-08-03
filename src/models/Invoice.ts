// 📄 src/models/Invoice.ts
// =============================================================================
// CDC Manager — Model: Invoice
// -----------------------------------------------------------------------------
// Espelho local do documento de faturação emitido via Moloni (software
// certificado AT). O CDC Manager NÃO é o emissor fiscal — o Moloni é.
// Este model guarda a referência ao documento certificado + o estado
// operacional do checkout no balcão.
//
// MULTI-CLÍNICA: as duas clínicas pertencem à MESMA sociedade
// (D. Amaral — Assistência Prev. Dentária, Lda) → UMA conta Moloni.
// clinicId obrigatório para relatórios de faturação por casa; no Sprint 4
// a integração usa (idealmente) uma série de documentos por clínica
// (ex. FR COL/…, FR BUR/…) — a confirmar com o contabilista. O campo
// moloniDocumentSetId guarda a série usada em cada emissão.
//
// FLUXO (Sprint 4):
//   1. Receção abre o checkout com os Procedures 'completed' do paciente
//   2. Confirma valores/meio de pagamento → action chama a API Moloni
//   3. Moloni emite fatura-recibo certificada (numeração DELE)
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
  // Cobrança registada no balcão, documento fiscal POR EMITIR — o estado
  // de operação enquanto a conta Moloni não está ativa (pré-aprovação).
  // Quando o Moloni ligar (Sprint 4), a emissão preenche os campos moloni*
  // e transita para 'issued'.
  'awaiting-emission',
  'issued', // emitida e paga no ato (fatura-recibo — o caso normal no balcão)
  'pending', // emitida, pagamento por regularizar (transferência a confirmar)
  'voided', // anulada via nota de crédito no Moloni
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

// Meios de pagamento canónicos em lib/domain.ts (o CheckoutModal é client);
// re-exportados aqui para o código server
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/domain';
export { PAYMENT_METHODS };
export type { PaymentMethod };

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
    // Clínica onde o checkout aconteceu (relatórios por casa)
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
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
    // NULOS enquanto 'awaiting-emission' (pré-ativação Moloni); unique
    // sparse permite múltiplos nulls e continua a garantir unicidade
    // dos documentos emitidos
    moloniDocumentId: {
      type: Number, // document_id devolvido pela API Moloni
      default: null,
      unique: true,
      sparse: true,
    },
    // Identificação legível: "FR COL/123" (série + número da AT)
    moloniDocumentNumber: {
      type: String,
      trim: true,
      default: null,
    },
    // Série Moloni usada (document_set_id) — uma por clínica no plano atual
    moloniDocumentSetId: {
      type: Number,
      default: null,
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

// Portal do paciente: as minhas faturas (das duas clínicas), recentes primeiro
InvoiceSchema.index({ patientId: 1, createdAt: -1 });
// Relatórios de faturação por período — globais e por clínica
InvoiceSchema.index({ status: 1, paidAt: -1 });
InvoiceSchema.index({ clinicId: 1, status: 1, paidAt: -1 });

export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Invoice: Model<InvoiceDoc> =
  (mongoose.models.Invoice as Model<InvoiceDoc>) ??
  mongoose.model<InvoiceDoc>('Invoice', InvoiceSchema);

export default Invoice;
