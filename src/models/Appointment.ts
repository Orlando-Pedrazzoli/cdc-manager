// 📄 src/models/Appointment.ts
// =============================================================================
// CDC Manager — Model: Appointment
// -----------------------------------------------------------------------------
// A marcação. Cada documento representa um bloco reservado na agenda de UMA
// clínica (Colombo ou Buraca), com o ciclo de vida completo do fluxo.
//
// MULTI-CLÍNICA:
//   - clinicId obrigatório: toda a marcação pertence a uma clínica.
//   - Capacidade (gabinetes) verifica-se POR CLÍNICA: Colombo 5, Buraca 1.
//   - O conflito de MÉDICO verifica-se SEM filtro de clínica: o mesmo médico
//     não pode ter marcações sobrepostas em clínicas diferentes (não está
//     em dois sítios ao mesmo tempo). Por isso o índice do médico não inclui
//     clinicId — de propósito.
//
// MÁQUINA DE ESTADOS (transições válidas impostas em actions/appointments.ts):
//
//   pending ──────► confirmed ──► checked-in ──► in-progress ──► completed
//      │                │              │
//      │                │              └──(paciente não aparece)─► no-show
//      ├─► cancelled ◄──┘
//      └─► (sem médico: doctorId null → fila de atribuição do admin)
//
//   pending     criada (qualquer canal), aguarda confirmação
//   confirmed   confirmada (botão WhatsApp, email, ou pela receção)
//   checked-in  paciente chegou ao balcão
//   in-progress médico iniciou a consulta
//   completed   consulta fechada pelo médico → fila de cobrança
//   cancelled   cancelada (por quem + quando + motivo ficam registados)
//   no-show     falta sem aviso (alimenta métricas e histórico do paciente)
//
// TEMPO — decisão estrutural:
//   startAt/endAt são Date (instantes UTC reais). A conversão da "hora de
//   parede de Lisboa" (regras dos horários dos médicos, em HH:mm) para
//   instantes acontece SÓ em lib/availability.ts — um único sítio para a
//   lógica de timezone/DST. endAt JÁ INCLUI o buffer do ato: a sobreposição
//   de marcações resolve-se com uma única comparação de intervalos, e o
//   buffer nunca é esquecido em nenhuma query.
//
// CONCORRÊNCIA (dupla marcação) — defesa em duas camadas:
//   1. Verificação de disponibilidade antes de criar (lib/availability.ts)
//   2. Re-verificação ATÓMICA no momento da escrita, dentro de uma transação
//      (actions/appointments.ts) — dois cliques simultâneos no mesmo slot:
//      um ganha, o outro recebe "horário já não disponível"
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const APPOINTMENT_STATUS = [
  'pending',
  'confirmed',
  'checked-in',
  'in-progress',
  'completed',
  'cancelled',
  'no-show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];

/** Estados que OCUPAM agenda — a query de disponibilidade filtra por estes */
export const BLOCKING_STATUS: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'checked-in',
  'in-progress',
];

export const APPOINTMENT_CHANNELS = [
  'website',
  'whatsapp',
  'front-desk',
  'doctor',
  'system', // recalls automáticos, lista de espera
] as const;
export type AppointmentChannel = (typeof APPOINTMENT_CHANNELS)[number];

export const CANCELLED_BY = ['patient', 'clinic', 'system'] as const;
export type CancelledBy = (typeof CANCELLED_BY)[number];

const AppointmentSchema = new Schema(
  {
    // Clínica onde a consulta acontece — Colombo ou Buraca
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
    // null = paciente não escolheu médico → fila de atribuição do admin
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      required: true,
    },
    // Instantes UTC. endAt = startAt + durationMin + bufferMin (ver cabeçalho)
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: { startAt: Date }, v: Date) {
          return v > this.startAt;
        },
        message: 'endAt deve ser posterior a startAt',
      },
    },
    status: {
      type: String,
      enum: APPOINTMENT_STATUS,
      default: 'pending',
      index: true,
    },
    channel: {
      type: String,
      enum: APPOINTMENT_CHANNELS,
      required: true,
    },
    // Quem criou (User da receção/admin/médico; null em marcações do
    // site/WhatsApp feitas pelo próprio paciente sem sessão)
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Nota operacional visível na agenda (ex.: "paciente pede RX recente")
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    // --- Confirmação --------------------------------------------------------
    confirmedAt: { type: Date, default: null },
    confirmedVia: {
      type: String,
      enum: ['whatsapp', 'sms', 'email', 'front-desk', null],
      default: null,
    },
    // Lembretes enviados (idempotência dos crons: nunca enviar duas vezes)
    reminder72hSentAt: { type: Date, default: null },
    reminder24hSentAt: { type: Date, default: null },
    // --- Cancelamento / remarcação ------------------------------------------
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
      type: String,
      enum: [...CANCELLED_BY, null],
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    // Remarcação = cancelar + criar nova; os elos preservam o rasto completo.
    // A nova marcação pode ser NOUTRA clínica (remarcar do Colombo para a
    // Buraca é um caso real de referência entre médicos)
    rescheduledToId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    rescheduledFromId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    // --- Fecho / transição de estados (auditoria operacional) ---------------
    checkedInAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// -----------------------------------------------------------------------------
// ÍNDICES — desenhados para as queries quentes do sistema:
// -----------------------------------------------------------------------------
// 1. Conflito de MÉDICO — SEM clinicId de propósito: o mesmo médico não pode
//    estar sobreposto em clínica nenhuma (uma pessoa, uma agenda corporal)
AppointmentSchema.index({ doctorId: 1, startAt: 1, status: 1 });
// 2. Capacidade POR CLÍNICA (Colombo 5 / Buraca 1) + vista da agenda diária
AppointmentSchema.index({ clinicId: 1, startAt: 1, endAt: 1, status: 1 });
// 3. Histórico e próximas consultas do paciente (portal + ficha — global,
//    o paciente vê as consultas das duas clínicas juntas)
AppointmentSchema.index({ patientId: 1, startAt: -1 });
// 4. Crons de lembretes: intervalo temporal + estado + flag de envio
AppointmentSchema.index({ status: 1, startAt: 1, reminder24hSentAt: 1 });

export type AppointmentDoc = InferSchemaType<typeof AppointmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Appointment: Model<AppointmentDoc> =
  (mongoose.models.Appointment as Model<AppointmentDoc>) ??
  mongoose.model<AppointmentDoc>('Appointment', AppointmentSchema);

export default Appointment;
