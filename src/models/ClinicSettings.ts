// 📄 src/models/ClinicSettings.ts
// =============================================================================
// CDC Manager — Model: ClinicSettings (singleton)
// -----------------------------------------------------------------------------
// Configurações globais da clínica. Existe EXATAMENTE UM documento nesta
// coleção — padrão singleton imposto por um campo fixo `key: 'main'` com
// índice único. Toda a leitura passa por getClinicSettings() (cacheada por
// request), toda a escrita pelo admin em /admin/configuracoes.
//
// Aqui vive tudo o que é "regra da casa" e pode mudar sem deploy:
// horário da clínica, capacidade física, comissão default, janelas de
// marcação online, antecedências e políticas de cancelamento.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

// Reutiliza o formato do Doctor: vários intervalos por dia da semana
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
    weekday: { type: Number, required: true, min: 0, max: 6 },
    ranges: { type: [TimeRangeSchema], default: [] }, // vazio = encerrado
  },
  { _id: false },
);

const ClinicSettingsSchema = new Schema(
  {
    // Chave fixa do singleton
    key: {
      type: String,
      default: 'main',
      unique: true,
      immutable: true,
    },
    // --- Identidade (aparece em documentos, emails, WhatsApp) ---------------
    clinicName: {
      type: String,
      default: 'Centro Dentário Colombo',
      trim: true,
    },
    legalName: {
      type: String,
      default: 'D. Amaral — Assistência Prev. Dentária, Lda',
      trim: true,
    },
    nipc: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    // --- Operação -----------------------------------------------------------
    // Horário de funcionamento da clínica (interseção com o horário do médico
    // no motor de disponibilidade)
    openingHours: {
      type: [OpeningHoursSchema],
      default: [],
    },
    // Capacidade física: gabinetes/cadeiras em simultâneo (hoje: 5).
    // O motor rejeita marcações quando o intervalo já tem este nº de
    // marcações bloqueantes sobrepostas
    maxConcurrentAppointments: {
      type: Number,
      min: 1,
      default: 5,
    },
    // --- Marcação online ----------------------------------------------------
    // Antecedência mínima (não marcar para daqui a 30 min) e máxima (não
    // marcar para daqui a 8 meses) — em horas e dias respetivamente
    onlineMinNoticeHours: { type: Number, min: 0, default: 24 },
    onlineMaxAdvanceDays: { type: Number, min: 1, default: 90 },
    // Cancelamento/remarcação pelo portal permitido até X horas antes;
    // depois disso só por telefone (política habitual das clínicas)
    cancellationMinNoticeHours: { type: Number, min: 0, default: 24 },
    // --- Comissões ----------------------------------------------------------
    // Fração DEFAULT do médico (Victor: clínica 60% / médico 40%).
    // Cadeia de resolução: override ato > base médico > este valor
    defaultDoctorCommission: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.4,
    },
  },
  {
    timestamps: true,
  },
);

export type ClinicSettingsDoc = InferSchemaType<typeof ClinicSettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ClinicSettings: Model<ClinicSettingsDoc> =
  (mongoose.models.ClinicSettings as Model<ClinicSettingsDoc>) ??
  mongoose.model<ClinicSettingsDoc>('ClinicSettings', ClinicSettingsSchema);

export default ClinicSettings;

/**
 * Leitura do singleton com upsert: se ainda não existir (primeira execução),
 * cria com os defaults do schema. Nunca há "settings em falta".
 */
export async function getClinicSettings(): Promise<ClinicSettingsDoc> {
  const doc = await ClinicSettings.findOneAndUpdate(
    { key: 'main' },
    { $setOnInsert: { key: 'main' } },
    { new: true, upsert: true },
  );
  return doc;
}
