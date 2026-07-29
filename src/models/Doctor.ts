// 📄 src/models/Doctor.ts
// =============================================================================
// CDC Manager — Model: Doctor
// -----------------------------------------------------------------------------
// Perfil de domínio do médico (21 na clínica). A conta de acesso vive no User
// (via User.doctorId); este model guarda o que interessa à operação:
// especialidades, horários, exceções e regras de comissão.
//
// HORÁRIOS — modelo em dois níveis, o padrão dos sistemas de agenda modernos:
//   1. weeklySchedule: a semana-tipo (recorrente). Ex.: Seg 09:00-13:00 e
//      14:00-18:00; Qua 09:00-13:00. Vários intervalos por dia = pausa de
//      almoço sem hacks.
//   2. exceptions: desvios pontuais por data — férias, faltas, congressos
//      (unavailable) ou dias com horário especial (custom).
//   Disponibilidade real = weeklySchedule do dia ± exceptions dessa data.
//
// COMISSÕES — três níveis de resolução (do mais específico ao geral):
//   1. override por (médico × tipo de tratamento)  → commissionOverrides
//   2. taxa base do médico                          → commissionRate
//   3. default da clínica (40% médico / 60% clínica)→ ClinicSettings
//   A resolução é implementada em lib/commissions.ts; aqui só os dados.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

// Slugs das 10 especialidades da clínica (validados no projeto do site)
export const SPECIALTIES = [
  'dentisteria',
  'estetica-dentaria',
  'endodontia',
  'implantologia',
  'odontopediatria',
  'ortodontia',
  'periodontologia',
  'proteses-dentarias',
  'higiene-oral',
  'harmonizacao-orofacial',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

// --- Sub-schema: intervalo de trabalho ("09:00" a "13:00") -------------------
// Horas como string HH:mm — formato estável, sem armadilhas de timezone;
// a aritmética é feita em lib/availability.ts com date-fns sobre a data real.
const TimeRangeSchema = new Schema(
  {
    start: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:mm)'],
    },
    end: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:mm)'],
    },
  },
  { _id: false },
);

// --- Sub-schema: semana-tipo (0 = Domingo ... 6 = Sábado, padrão JS) ---------
const WeeklyScheduleSchema = new Schema(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    ranges: { type: [TimeRangeSchema], default: [] }, // vazio = não trabalha
  },
  { _id: false },
);

// --- Sub-schema: exceção pontual por data ------------------------------------
const ScheduleExceptionSchema = new Schema(
  {
    // Data no formato YYYY-MM-DD (dia civil em Lisboa, sem componente de hora)
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'],
    },
    type: {
      type: String,
      enum: ['unavailable', 'custom'],
      required: true,
    },
    // Apenas para type 'custom': horário especial desse dia
    ranges: { type: [TimeRangeSchema], default: [] },
    reason: { type: String, trim: true, maxlength: 200, default: null },
  },
  { _id: false },
);

// --- Sub-schema: override de comissão por tipo de tratamento -----------------
const CommissionOverrideSchema = new Schema(
  {
    treatmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'TreatmentType',
      required: true,
    },
    // Fração da parte do MÉDICO (0.45 = 45% para o médico nesse ato)
    rate: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const DoctorSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    // Cédula profissional (Ordem dos Médicos Dentistas) — aparece em documentos
    licenseNumber: {
      type: String,
      trim: true,
      default: null,
    },
    specialties: {
      type: [{ type: String, enum: SPECIALTIES }],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'O médico deve ter pelo menos uma especialidade',
      },
    },
    weeklySchedule: {
      type: [WeeklyScheduleSchema],
      default: [],
    },
    exceptions: {
      type: [ScheduleExceptionSchema],
      default: [],
    },
    // Taxa base do médico (fração que ELE recebe). null = usa o default da
    // clínica em ClinicSettings (0.40). O admin edita em /admin/medicos/[id]/comissoes
    commissionRate: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    commissionOverrides: {
      type: [CommissionOverrideSchema],
      default: [],
    },
    // Cor do médico nas agendas (hex) — identificação visual imediata com 21 agendas
    color: {
      type: String,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (hex #RRGGBB)'],
      default: '#2743A6',
    },
    // Visível no formulário público de marcação? (nem todos os médicos aceitam
    // marcações diretas do site)
    bookableOnline: {
      type: Boolean,
      default: true,
    },
    // Migração: número/ID do médico no Dentoral, para reconciliação de dados
    legacyId: {
      type: String,
      default: null,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Listagens e motor de disponibilidade filtram por especialidade + ativo
DoctorSchema.index({ specialties: 1, active: 1 });

export type DoctorDoc = InferSchemaType<typeof DoctorSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Doctor: Model<DoctorDoc> =
  (mongoose.models.Doctor as Model<DoctorDoc>) ??
  mongoose.model<DoctorDoc>('Doctor', DoctorSchema);

export default Doctor;
