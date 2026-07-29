// 📄 src/models/AuditLog.ts
// =============================================================================
// CDC Manager — Model: AuditLog
// -----------------------------------------------------------------------------
// Registo de auditoria RGPD: quem fez o quê, a quê, quando. Obrigatório
// para dados de saúde (accountability, art. 5.º/32.º). Equivalente ao
// "Registo de Operações (LOG)" do Dentoral, mas pesquisável.
//
// Escrito por lib/audit.ts (helper único chamado pelas Server Actions).
// Append-only absoluto: sem updates, sem deletes — nem sequer expomos
// actions que os façam. Retenção longa (não usamos TTL).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const AUDIT_ACTIONS = [
  'view', // consultou dados sensíveis (ficha clínica, documentos)
  'create',
  'update',
  'delete', // anulações/desativações (nunca hard-delete de clínico)
  'login',
  'login-failed',
  'logout',
  'export', // exportação de dados
  'anonymize', // RGPD
  'invoice-issue',
  'invoice-void',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const AuditLogSchema = new Schema(
  {
    // Quem (null em eventos de sistema, ex. login-failed sem user válido)
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
    },
    // O quê: nome do model + id do documento afetado
    entityType: { type: String, required: true, trim: true },
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    // Paciente afetado (quando aplicável) — permite responder ao pedido RGPD
    // "quem acedeu aos meus dados?" com uma única query
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
    },
    // Resumo legível + diff mínimo de campos alterados (sem valores clínicos
    // sensíveis — apenas os NOMES dos campos alterados)
    summary: { type: String, trim: true, maxlength: 500, default: null },
    changedFields: { type: [String], default: [] },
    ip: { type: String, trim: true, default: null },
    userAgent: { type: String, trim: true, maxlength: 300, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // só createdAt: imutável
  },
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

const AuditLog: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ??
  mongoose.model<AuditLogDoc>('AuditLog', AuditLogSchema);

export default AuditLog;
