// 📄 src/models/Waitlist.ts
// =============================================================================
// CDC Manager — Model: Waitlist
// -----------------------------------------------------------------------------
// Lista de espera: pacientes que querem consulta mais cedo. Quando uma
// marcação é cancelada, o sistema procura entradas compatíveis (ato,
// médico opcional, janela de datas/períodos) e oferece o slot por WhatsApp —
// primeiro a confirmar fica com ele.
//
// OFERTA COM RESERVA TEMPORÁRIA: ao oferecer, o slot fica "held" por 30 min
// para o paciente contactado (evita oferecer o mesmo slot a 3 pessoas e
// ter 2 desiludidas). Expirado o hold, passa ao seguinte da fila.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const WAITLIST_STATUS = [
  'active', // à espera
  'offered', // slot oferecido, aguarda resposta (hold ativo)
  'fulfilled', // aceitou; marcação criada
  'expired', // deixou de fazer sentido (data limite passou)
  'cancelled', // paciente/receção removeu
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUS)[number];

export const DAY_PERIODS = ['morning', 'afternoon', 'any'] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];

const WaitlistSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      required: true,
    },
    // null = qualquer médico da especialidade
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    // Janela de interesse
    fromDate: { type: Date, required: true },
    untilDate: { type: Date, required: true },
    period: { type: String, enum: DAY_PERIODS, default: 'any' },
    status: {
      type: String,
      enum: WAITLIST_STATUS,
      default: 'active',
      index: true,
    },
    // Oferta em curso
    offeredAppointmentSlot: {
      startAt: { type: Date, default: null },
      doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },
    },
    offeredAt: { type: Date, default: null },
    holdExpiresAt: { type: Date, default: null }, // fim da reserva de 30 min
    fulfilledAppointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = pedido do próprio paciente (portal/WhatsApp)
    },
    note: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true },
);

// Matching de cancelamentos: ativos compatíveis por ato/janela
WaitlistSchema.index({ status: 1, treatmentTypeId: 1, fromDate: 1 });

export type WaitlistDoc = InferSchemaType<typeof WaitlistSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Waitlist: Model<WaitlistDoc> =
  (mongoose.models.Waitlist as Model<WaitlistDoc>) ??
  mongoose.model<WaitlistDoc>('Waitlist', WaitlistSchema);

export default Waitlist;
