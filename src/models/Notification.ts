// 📄 src/models/Notification.ts
// =============================================================================
// CDC Manager — Model: Notification
// -----------------------------------------------------------------------------
// Registo (outbox) de TODAS as comunicações enviadas a pacientes e staff:
// confirmações, lembretes, códigos de ativação, ofertas de waitlist,
// convites de recall, notificações internas de médicos.
//
// Serve três propósitos:
//   1. Auditoria: "o lembrete foi mesmo enviado às 10:02, entregue às 10:03"
//   2. Idempotência/retries: envio falhado fica 'failed' e é retentável
//   3. Timeline no painel: histórico de comunicações por paciente
//
// Estados de entrega atualizados pelos webhooks (WhatsApp: sent → delivered
// → read; Resend: delivered/bounced).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const NOTIFICATION_CHANNELS = [
  'whatsapp',
  'sms',
  'email',
  'in-app',
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'appointment-confirmation',
  'reminder-72h',
  'reminder-24h',
  'appointment-cancelled',
  'appointment-rescheduled',
  'waitlist-offer',
  'recall-invite',
  'activation-code',
  'password-reset',
  'invoice-issued',
  'doctor-new-appointment', // notificação interna ao médico
  'stock-alert', // interna ao admin
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUS = [
  'queued',
  'sent',
  'delivered',
  'read', // só WhatsApp reporta
  'failed',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

const NotificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    channel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      required: true,
    },
    // Destinatário: paciente OU utilizador interno (um dos dois)
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // Endereço efetivo usado (telefone E.164 ou email) — snapshot
    recipient: { type: String, required: true, trim: true },
    // Referências de contexto (para a timeline ligar às entidades)
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUS,
      default: 'queued',
      index: true,
    },
    // ID externo (WhatsApp message id / Resend id) para reconciliar webhooks
    externalId: { type: String, default: null, index: true },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    errorMessage: { type: String, trim: true, maxlength: 500, default: null },
    retryCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

NotificationSchema.index({ patientId: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ??
  mongoose.model<NotificationDoc>('Notification', NotificationSchema);

export default Notification;
