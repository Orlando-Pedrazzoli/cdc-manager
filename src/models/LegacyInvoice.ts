// 📄 src/models/LegacyInvoice.ts
// =============================================================================
// CDC Manager — Model: LegacyInvoice (arquivo de faturação do Dentoral)
// -----------------------------------------------------------------------------
// Documentos de faturação emitidos pelo Dentoral (2010 → migração), guardados
// como ARQUIVO READ-ONLY: a clínica tem obrigação legal de os conservar (CIVA /
// CIRC, 10 anos) e de os poder consultar por paciente, mas nenhum destes
// documentos volta a ser emitido, alterado ou anulado aqui — qualquer
// documento novo é emitido pelo Moloni através do model Invoice.
//
// Porque não reutilizar Invoice: as linhas do Invoice exigem procedureId,
// issuedByUserId e o ciclo de vida Moloni (moloniDocumentId, atcud, nota de
// crédito). Forçar 329 k documentos antigos nesse modelo obrigaria a dados
// fictícios. Aqui o modelo é o espelho fiel das tabelas ccorrentes + doclin
// + ccconcilia, com os campos de integridade da AT (HashKey) preservados.
//
// Origem (drdata): ccorrentes (cabeçalho), doclin (linhas), ccconcilia
// (recibo ↔ fatura), defdocs (tipos de documento / séries).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

/** Tipos SAF-T que o Dentoral usava (defdocs.TipoDocSAFT) */
export const LEGACY_DOC_KINDS = [
  'FR', // fatura-recibo
  'FT', // fatura
  'NC', // nota de crédito / recibo (o Dentoral marcava recibos como NC)
  'TV', // nota de liquidação (valor zero)
  'VD', // venda a dinheiro (séries antigas)
  'OTHER',
] as const;
export type LegacyDocKind = (typeof LEGACY_DOC_KINDS)[number];

/** Direção de caixa no Dentoral (ccorrentes.DCCaixa) */
export const LEGACY_CASH_DIRECTIONS = ['RecTrat', 'Debito', 'Credito'] as const;

/** Meios de pagamento do Dentoral (tabpag) */
export const LEGACY_PAYMENT_METHODS = [
  'cash', // 1 DINHEIRO
  'cheque', // 2 CHEQUE
  'card', // 3 MULTIBANCO
  'unknown', // 0 / não registado
] as const;

const LegacyInvoiceLineSchema = new Schema(
  {
    legacyLineId: { type: String, required: true }, // doclin.AuxAutoInc
    dentoralCode: { type: String, default: null }, // doclin.CodTT
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      default: null, // resolvido por dentoralCode quando existe
    },
    description: { type: String, required: true, trim: true },
    tooth: { type: String, default: null }, // FDI ou null ('00' no Dentoral)
    faces: { type: String, default: null }, // ex.: 'O, M, D' (bitmask Dentoral)
    quantity: { type: Number, default: 1 },
    patientCents: { type: Number, required: true }, // ValPac
    entityCents: { type: Number, default: 0 }, // ValEnt
    discountCents: { type: Number, default: 0 },
    vatPct: { type: Number, default: 0 },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    treatmentDate: { type: Date, default: null }, // DiaTrt
    voided: { type: Boolean, default: false }, // Anul
  },
  { _id: false },
);

const LegacyInvoiceSchema = new Schema(
  {
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
    // Chave idempotente: `${TipDoc}-${Terc}-${DocPri}`
    legacyId: {
      type: String,
      required: true,
      unique: true,
    },
    // Identificação do documento tal como o Dentoral o numerava
    docTypeCode: { type: Number, required: true }, // ccorrentes.TipDoc
    docTypeName: { type: String, required: true }, // defdocs.Nome
    series: { type: String, default: null }, // defdocs.Serie (ex.: 'CL')
    kind: { type: String, enum: LEGACY_DOC_KINDS, required: true },
    number: { type: Number, required: true }, // ccorrentes.DocPri
    /** Apresentação: "FR CL/120-45678" */
    displayNumber: { type: String, required: true },
    issuedAt: { type: Date, required: true, index: true },
    cashDirection: {
      type: String,
      enum: LEGACY_CASH_DIRECTIONS,
      required: true,
    },
    totalCents: { type: Number, required: true },
    paidCents: { type: Number, default: 0 },
    discountCents: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: LEGACY_PAYMENT_METHODS,
      default: 'unknown',
    },
    vatExempt: { type: Boolean, default: true }, // séries 126–129 têm IVA 6 %
    // Snapshot do cliente tal como impresso no documento
    customerSnapshot: {
      name: { type: String, default: null },
      nif: { type: String, default: null },
      address: { type: String, default: null },
      postalCode: { type: String, default: null },
      city: { type: String, default: null },
    },
    lines: { type: [LegacyInvoiceLineSchema], default: [] },
    // Relações entre documentos (ccconcilia / RelacionaTipo+RelacionaDoc):
    // recibo → fatura(s) que liquida; nota de crédito → fatura anulada
    relatedLegacyIds: { type: [String], default: [] },
    voided: { type: Boolean, default: false, index: true },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: null },
    // Integridade AT (Dentoral): hash + ATCUD quando existia
    atHash: { type: String, default: null },
    atcud: { type: String, default: null },
    issuedByLegacyOperator: { type: String, default: null }, // medicos.Codigo
    notes: { type: String, default: null }, // ObsDoc
    legacyData: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

LegacyInvoiceSchema.index({ patientId: 1, issuedAt: -1 });
LegacyInvoiceSchema.index({ clinicId: 1, issuedAt: -1 });
LegacyInvoiceSchema.index({ docTypeCode: 1, number: 1 });

export type LegacyInvoiceDoc = InferSchemaType<typeof LegacyInvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LegacyInvoice: Model<LegacyInvoiceDoc> =
  (mongoose.models.LegacyInvoice as Model<LegacyInvoiceDoc>) ??
  mongoose.model<LegacyInvoiceDoc>('LegacyInvoice', LegacyInvoiceSchema);

export default LegacyInvoice;
