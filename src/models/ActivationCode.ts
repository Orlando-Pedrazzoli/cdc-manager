// 📄 src/models/ActivationCode.ts
// =============================================================================
// CDC Manager — Model: ActivationCode
// -----------------------------------------------------------------------------
// Código de uso único que o admin gera para dar acesso ao sistema (médicos e
// pacientes). Enviado por email/WhatsApp; o destinatário usa-o em /ativar para
// definir a sua password.
//
// Práticas de segurança aplicadas (padrão OWASP para tokens de convite):
//   1. O código NUNCA é guardado em claro — apenas o hash SHA-256.
//      Se a base de dados vazar, os códigos continuam inutilizáveis.
//   2. Uso único: campo usedAt marca consumo; código consumido é inválido.
//   3. Expiração: 7 dias, com TTL index que apaga automaticamente os
//      documentos expirados (limpeza sem cron).
//   4. Regeneração: criar novo código invalida os anteriores do mesmo user
//      (tratado na lib/activation.ts, não aqui).
//
// Formato apresentado ao utilizador: CDC-XXXX-XXXX (alfabeto sem ambíguos:
// sem 0/O, 1/I/L — evita erros de leitura no WhatsApp/telefone).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const ACTIVATION_PURPOSES = [
  'account-activation',
  'password-reset',
] as const;
export type ActivationPurpose = (typeof ACTIVATION_PURPOSES)[number];

const ActivationCodeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // SHA-256 (hex) do código em claro. Lookup é feito por hash — determinístico
    // e rápido, ao contrário de bcrypt que aqui não permitiria pesquisa direta.
    codeHash: {
      type: String,
      required: true,
      unique: true,
    },
    // O mesmo mecanismo serve ativação de conta e reset de password —
    // um só model, dois propósitos, validação estrita de qual está em uso
    purpose: {
      type: String,
      enum: ACTIVATION_PURPOSES,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    // Auditoria: quem gerou o convite (admin/rececionista)
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Canal por onde foi enviado (informativo, para o admin ver no painel)
    sentVia: {
      type: String,
      enum: ['email', 'whatsapp', 'manual'],
      default: 'email',
    },
  },
  {
    timestamps: true,
  },
);

// TTL index: o MongoDB apaga o documento automaticamente quando expiresAt passa.
// Zero manutenção, zero códigos mortos acumulados na coleção.
ActivationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ActivationCodeDoc = InferSchemaType<typeof ActivationCodeSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ActivationCode: Model<ActivationCodeDoc> =
  (mongoose.models.ActivationCode as Model<ActivationCodeDoc>) ??
  mongoose.model<ActivationCodeDoc>('ActivationCode', ActivationCodeSchema);

export default ActivationCode;
