// 📄 src/models/Doctor.ts
// =============================================================================
// CDC Manager — Model: Doctor
// -----------------------------------------------------------------------------
// Perfil de domínio do médico. A conta de acesso vive no User (via
// User.doctorId); este model guarda o que interessa à operação:
// especialidades, horários POR CLÍNICA, exceções e regras de comissão.
//
// MULTI-CLÍNICA — o mesmo médico pode trabalhar no Colombo e na Buraca:
//   - clinicSchedules[]: um bloco por clínica onde trabalha, cada um com a
//     sua semana-tipo. Ex.: Dr. X → Colombo {Seg, Qua 09-18} + Buraca {Sex 10-13,14-20}.
//     Médico só numa clínica = array com um elemento. A lista de clínicas
//     do médico DERIVA daqui (não há campo separado a dessincronizar).
//   - exceptions: clinicId OPCIONAL. null = vale nas duas (férias, baixa —
//     a pessoa não está em lado nenhum); preenchido = só naquela clínica
//     (ex.: "esta quarta excecionalmente na Buraca em vez do Colombo").
//   - REGRA DE NEGÓCIO (validada na action, não aqui): os horários do mesmo
//     médico em clínicas diferentes NUNCA podem sobrepor-se no tempo —
//     ninguém está em Lisboa e na Buraca ao mesmo tempo.
//
// HORÁRIOS — dois níveis (padrão dos sistemas de agenda):
//   1. semana-tipo recorrente (vários intervalos por dia = pausas sem hacks)
//   2. exceções pontuais por data (unavailable | custom)
//   Disponibilidade real numa clínica = semana-tipo dessa clínica ± exceções
//   aplicáveis (globais + dessa clínica), intersectada com Clinic.openingHours.
//
// COMISSÕES — resolução (do mais específico ao geral):
//   1. override por (médico × tipo de tratamento)  → commissionOverrides
//   2. taxa base do médico                          → commissionRate
//   3. default DA CLÍNICA onde o ato foi executado  → Clinic.defaultDoctorCommission
//   Por agora as taxas do médico são iguais nas duas clínicas (nível 1 e 2
//   globais); se o Victor confirmar comissões diferentes na Buraca,
//   acrescenta-se clinicId ao override — o snapshot no Procedure já congela
//   o valor certo na execução, por isso a mudança futura não parte histórico.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

// Slugs das 10 especialidades — canónicos em lib/domain.ts (partilhados com
// client components SEM arrastar mongoose para o browser); re-exportados
// aqui para o código server continuar a importar do model
import { SPECIALTIES, type Specialty } from '@/lib/domain';
export { SPECIALTIES, type Specialty };

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

// --- Sub-schema: horário do médico NUMA clínica ------------------------------
const ClinicScheduleSchema = new Schema(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
    },
    weeklySchedule: {
      type: [WeeklyScheduleSchema],
      default: [],
    },
    // Aceita marcações do site NESTA clínica? (um médico pode aceitar
    // marcações online no Colombo mas trabalhar só por referência na Buraca)
    bookableOnline: {
      type: Boolean,
      default: true,
    },
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
    // null = exceção GLOBAL (férias/baixa: o médico não está em nenhuma
    // clínica); preenchido = exceção só nessa clínica
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      default: null,
    },
    type: {
      type: String,
      enum: ['unavailable', 'custom'],
      required: true,
    },
    // Apenas para type 'custom': horário especial desse dia (nessa clínica)
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
    // Horários por clínica — a fonte de verdade de ONDE e QUANDO o médico
    // trabalha. Sem entrada para uma clínica = não trabalha lá.
    clinicSchedules: {
      type: [ClinicScheduleSchema],
      default: [],
      validate: {
        validator: (v: { clinicId: mongoose.Types.ObjectId }[]) => {
          // Uma entrada por clínica no máximo (duplicados corrompem a agenda)
          const ids = v.map(s => s.clinicId.toString());
          return new Set(ids).size === ids.length;
        },
        message: 'Clínica duplicada nos horários do médico',
      },
    },
    exceptions: {
      type: [ScheduleExceptionSchema],
      default: [],
    },
    // Taxa base do médico (fração que ELE recebe). null = usa o default da
    // clínica do ato (Clinic.defaultDoctorCommission). Editável em
    // /admin/medicos/[id]/comissoes
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
    // Cor do médico nas agendas (hex) — identificação visual imediata
    color: {
      type: String,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (hex #RRGGBB)'],
      default: '#2743A6',
    },
    // Migração: número/ID do médico no Dentoral, prefixado pela origem
    // ('colombo:12' / 'buraca:3') — as duas instalações têm numerações próprias
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
// "Que médicos trabalham nesta clínica?" — query central das agendas
DoctorSchema.index({ 'clinicSchedules.clinicId': 1, active: 1 });

export type DoctorDoc = InferSchemaType<typeof DoctorSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Doctor: Model<DoctorDoc> =
  (mongoose.models.Doctor as Model<DoctorDoc>) ??
  mongoose.model<DoctorDoc>('Doctor', DoctorSchema);

export default Doctor;

// -----------------------------------------------------------------------------
// Helpers puros (sem BD — operam sobre um DoctorDoc já carregado)
// -----------------------------------------------------------------------------

/** Ids das clínicas onde o médico trabalha (derivado de clinicSchedules) */
export function getDoctorClinicIds(doctor: DoctorDoc): string[] {
  return doctor.clinicSchedules.map(s => s.clinicId.toString());
}

/** Semana-tipo do médico numa clínica específica (undefined = não trabalha lá) */
export function getScheduleForClinic(
  doctor: DoctorDoc,
  clinicId: string,
): (typeof doctor.clinicSchedules)[number] | undefined {
  return doctor.clinicSchedules.find(s => s.clinicId.toString() === clinicId);
}

/**
 * Exceções aplicáveis a uma data numa clínica: as globais (clinicId null)
 * + as específicas dessa clínica. 'unavailable' global ganha sempre.
 */
export function getExceptionsForDate(
  doctor: DoctorDoc,
  date: string, // YYYY-MM-DD
  clinicId: string,
): (typeof doctor.exceptions)[number][] {
  return doctor.exceptions.filter(
    e =>
      e.date === date &&
      // !e.clinicId cobre null E undefined (o schema tem default: null sem
      // required, logo o InferSchemaType tipa como possivelmente undefined)
      (!e.clinicId || e.clinicId.toString() === clinicId),
  );
}
