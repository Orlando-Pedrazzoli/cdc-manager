// 📄 src/models/Clinic.ts
// =============================================================================
// CDC Manager — Model: Clinic (substitui ClinicSettings)
// -----------------------------------------------------------------------------
// O sistema gere DUAS clínicas com pacientes partilhados:
//   · colombo — Centro Dentário Colombo (CC Colombo, Lisboa)
//               7 dias, 09:00–23:00 contínuo, 5 gabinetes rotativos
//   · buraca  — Clínica Dentária da Buraca
//               seg–sex 10:00–20:00 COM pausa de almoço 13:00–14:00,
//               sáb 09:30–13:30, dom encerrado, 1 gabinete
//
// Decisões de desenho:
//   - Pacientes, fichas clínicas e utilizadores são GLOBAIS (a ficha segue a
//     pessoa). O que é POR CLÍNICA: agenda, capacidade, stock, faturação,
//     waitlist, recalls — esses models ganham clinicId a apontar para aqui.
//   - Horário como intervalos por dia (ranges[]): a pausa de almoço da Buraca
//     é simplesmente dois intervalos no mesmo dia — nenhum campo especial.
//       Colombo seg:  [{start:'09:00', end:'23:00'}]
//       Buraca  seg:  [{start:'10:00', end:'13:00'},{start:'14:00', end:'20:00'}]
//       Buraca  dom:  []  (vazio = encerrado)
//   - "Na Buraca só trabalha 1 médico por dia" NÃO é regra codificada: emerge
//     de maxConcurrentAppointments=1 + workingHours dos médicos por clínica.
//   - Dados fiscais (legalName, nipc) por clínica: cobre tanto o cenário de
//     uma só sociedade (valores iguais nas duas) como o de duas sociedades
//     com contas Moloni distintas (a confirmar com o Victor — Sprint 4).
//   - slug imutável: é a referência estável em URLs, seeds e migração
//     (legacyId dos exports Dentoral será prefixado: 'colombo:1234').
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

export const CLINIC_SLUGS = ['colombo', 'buraca'] as const;
export type ClinicSlug = (typeof CLINIC_SLUGS)[number];

// Vários intervalos por dia da semana (formato partilhado com Doctor)
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

const OpeningHoursSchema = new Schema(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 }, // 0=domingo
    ranges: { type: [TimeRangeSchema], default: [] }, // vazio = encerrado
  },
  { _id: false },
);

const ClinicSchema = new Schema(
  {
    // Identificador estável para código/URLs/seeds — nunca muda depois de criado
    slug: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      lowercase: true,
      trim: true,
    },
    // --- Identidade (aparece em documentos, emails, WhatsApp) ---------------
    name: {
      type: String,
      required: [true, 'Nome da clínica é obrigatório'],
      trim: true,
    },
    legalName: {
      type: String,
      trim: true,
      default: 'D. Amaral — Assistência Prev. Dentária, Lda',
    },
    nipc: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    // --- Operação -----------------------------------------------------------
    openingHours: {
      type: [OpeningHoursSchema],
      default: [],
    },
    // Capacidade física simultânea (Colombo: 5 gabinetes; Buraca: 1).
    // O motor de disponibilidade rejeita marcações quando o intervalo já tem
    // este nº de marcações bloqueantes sobrepostas NESTA clínica
    maxConcurrentAppointments: {
      type: Number,
      min: 1,
      default: 1,
    },
    // --- Marcação online (políticas podem divergir entre clínicas) ----------
    onlineMinNoticeHours: { type: Number, min: 0, default: 24 },
    onlineMaxAdvanceDays: { type: Number, min: 1, default: 90 },
    cancellationMinNoticeHours: { type: Number, min: 0, default: 24 },
    // Permite tirar uma clínica do wizard público sem a desativar
    bookableOnline: { type: Boolean, default: true },
    // --- Comissões ----------------------------------------------------------
    // Default DESTA clínica (cadeia: override ato > base médico > isto).
    // Colombo confirmado 60/40; Buraca por confirmar — assume igual até
    // o Victor dizer o contrário
    defaultDoctorCommission: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.4,
    },
    // --- Estado -------------------------------------------------------------
    // Soft-disable: clínica inativa desaparece de agendas/wizard mas todo o
    // histórico (marcações, faturas, stock) permanece íntegro
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export type ClinicDoc = InferSchemaType<typeof ClinicSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Clinic: Model<ClinicDoc> =
  (mongoose.models.Clinic as Model<ClinicDoc>) ??
  mongoose.model<ClinicDoc>('Clinic', ClinicSchema);

export default Clinic;

// -----------------------------------------------------------------------------
// Helpers de leitura (substituem getClinicSettings)
// -----------------------------------------------------------------------------

/** Todas as clínicas ativas, ordem estável (Colombo primeiro por slug) */
export async function getActiveClinics(): Promise<ClinicDoc[]> {
  return Clinic.find({ isActive: true }).sort({ slug: 1 });
}

/** Clínica por slug — lança erro se não existir (indica seed em falta) */
export async function getClinicBySlug(slug: ClinicSlug): Promise<ClinicDoc> {
  const doc = await Clinic.findOne({ slug });
  if (!doc) {
    throw new Error(
      `[clinic] Clínica '${slug}' não encontrada — correr o seed primeiro.`,
    );
  }
  return doc;
}

/** Clínica por id — devolve null se não existir (uso em validações) */
export async function getClinicById(
  id: string | mongoose.Types.ObjectId,
): Promise<ClinicDoc | null> {
  return Clinic.findById(id);
}
