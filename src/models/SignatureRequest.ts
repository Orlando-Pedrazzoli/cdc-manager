// 📄 src/models/SignatureRequest.ts
// =============================================================================
// CDC Manager — Pedido de assinatura para o tablet (3.ª reunião, out/2026)
// -----------------------------------------------------------------------------
// A receção prepara o documento no PC e "envia para o tablet" da clínica; o
// tablet (/quiosque) mostra o pedido mais antigo pendente da SUA clínica, o
// paciente assina, e o núcleo de assinatura (src/lib/signing.ts) gera o
// Document exatamente como se tivesse sido assinado no balcão.
//
//   pending → signed      (tablet)
//   pending → cancelled   (receção)
//   pending → expired     (derivado: expiresAt passou; limpo no próximo pedido)
//
// O TEXTO vai congelado no pedido (body) — o paciente assina o que leu, não
// o que o modelo diz hoje. Nunca se apaga: é rasto de quem pediu o quê.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const SIGNATURE_REQUEST_KINDS = ['gdpr', 'template'] as const;
export type SignatureRequestKind = (typeof SIGNATURE_REQUEST_KINDS)[number];

export const SIGNATURE_REQUEST_STATUSES = [
  'pending',
  'signed',
  'cancelled',
  'expired',
] as const;
export type SignatureRequestStatus =
  (typeof SIGNATURE_REQUEST_STATUSES)[number];

/** Um pedido vive 30 min no tablet; depois é considerado expirado */
export const SIGNATURE_REQUEST_TTL_MS = 30 * 60 * 1000;

const SignatureRequestSchema = new Schema(
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
    },
    /** Nome no momento do pedido — o tablet não consulta a ficha */
    patientName: { type: String, required: true, trim: true, maxlength: 160 },
    kind: { type: String, enum: SIGNATURE_REQUEST_KINDS, required: true },
    // --- Só para kind 'template' -------------------------------------------
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'DocumentTemplate',
      default: null,
    },
    /** Médico emissor (quando o pedido parte do médico) */
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },
    visibleToPatient: { type: Boolean, default: true },
    // --- Conteúdo congelado -----------------------------------------------------
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 20_000 },
    // --- Ciclo de vida ------------------------------------------------------------
    status: {
      type: String,
      enum: SIGNATURE_REQUEST_STATUSES,
      default: 'pending',
      index: true,
    },
    requestedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: { type: Date, required: true },
    signedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    /** Document gerado quando assinado */
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
    },
    /** Erro na geração (se o tablet assinou mas o PDF falhou) */
    lastError: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

// Fila do tablet: pendentes de uma clínica por ordem de chegada
SignatureRequestSchema.index({ clinicId: 1, status: 1, createdAt: 1 });

export type SignatureRequestDoc = InferSchemaType<
  typeof SignatureRequestSchema
> & { _id: mongoose.Types.ObjectId };

const SignatureRequest: Model<SignatureRequestDoc> =
  (mongoose.models.SignatureRequest as Model<SignatureRequestDoc>) ??
  mongoose.model<SignatureRequestDoc>(
    'SignatureRequest',
    SignatureRequestSchema,
  );

export default SignatureRequest;
