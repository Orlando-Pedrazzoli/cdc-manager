// 📄 src/models/TreatmentType.ts
// =============================================================================
// CDC Manager — Model: TreatmentType
// -----------------------------------------------------------------------------
// Catálogo de atos clínicos da clínica. Cada documento define:
//   - AGENDA:    duração + buffer (bloco total), regras de marcação online
//   - COBRANÇA:  preço de tabela (particular; a clínica é 100% particular)
//   - STOCK:     BOM — lista de materiais consumidos ao fechar a consulta
//   - RECALL:    intervalo de reativação (ex.: higiene → 6 meses)
//   - COMISSÕES: alvo dos overrides por médico (Doctor.commissionOverrides)
//
// TUDO editável pelo admin em /admin/tratamentos — zero deploys para mudar
// preços, durações ou consumos. A matriz de durações pesquisada
// (benchmarks internacionais) entra como SEED desta coleção; o campo `source`
// distingue benchmark de valor confirmado pela clínica, para a equipa da
// Adriana/Isabel ir validando com o uso real.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { SPECIALTIES } from '@/models/Doctor';

export const DURATION_SOURCES = ['benchmark', 'clinic-confirmed'] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];

/** Granularidade da grelha de slots (minutos) — regra global do motor */
export const SLOT_GRANULARITY_MIN = 15;

// --- Sub-schema: item da BOM (consumo de stock por execução do ato) ----------
const BomItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Quantidade consumida por execução, na unidade base do Product
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const TreatmentTypeSchema = new Schema(
  {
    // Slug estável (ex.: 'endodontia-molar') — chave usada pelo seed e por
    // referências externas; imutável após criação
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug inválido (a-z, 0-9, hífens)'],
    },
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      maxlength: 160,
    },
    specialty: {
      type: String,
      enum: SPECIALTIES,
      required: true,
      index: true,
    },
    // --- Agenda -------------------------------------------------------------
    durationMin: {
      type: Number,
      required: true,
      min: SLOT_GRANULARITY_MIN,
      validate: {
        validator: (v: number) => v % SLOT_GRANULARITY_MIN === 0,
        message: `Duração deve ser múltipla de ${SLOT_GRANULARITY_MIN} minutos`,
      },
    },
    // Folga pós-consulta (limpeza/preparação do gabinete)
    bufferMin: {
      type: Number,
      required: true,
      min: 0,
      default: 10,
    },
    // Aparece no formulário público de marcação? (regra conservadora:
    // só atos de duração previsível, sem dependência de diagnóstico)
    bookableOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Exige consulta de avaliação prévia (só marcável internamente)
    requiresEvaluation: {
      type: Boolean,
      default: true,
    },
    // --- Cobrança -----------------------------------------------------------
    // Preço de tabela em cêntimos (inteiro). 4500 = 45,00 €.
    // Cêntimos evitam os erros de vírgula flutuante (0.1 + 0.2 !== 0.3)
    // em somas de contas — regra de ouro em qualquer sistema com dinheiro.
    priceCents: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // --- Stock (BOM) ----------------------------------------------------------
    bom: {
      type: [BomItemSchema],
      default: [],
    },
    // --- Recall ---------------------------------------------------------------
    // Meses até convite automático de retorno (null = sem recall).
    // Ex.: destartarização = 6 → cron convida o paciente 6 meses depois.
    recallIntervalMonths: {
      type: Number,
      min: 1,
      max: 60,
      default: null,
    },
    // --- Metadados ------------------------------------------------------------
    source: {
      type: String,
      enum: DURATION_SOURCES,
      default: 'benchmark',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
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

// Listagens por especialidade + ativos (formulário de marcação e admin)
TreatmentTypeSchema.index({ specialty: 1, active: 1 });

export type TreatmentTypeDoc = InferSchemaType<typeof TreatmentTypeSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Bloco total que o ato ocupa na agenda (duração + buffer) */
export function getTotalBlockMin(t: {
  durationMin: number;
  bufferMin: number;
}): number {
  return t.durationMin + t.bufferMin;
}

const TreatmentType: Model<TreatmentTypeDoc> =
  (mongoose.models.TreatmentType as Model<TreatmentTypeDoc>) ??
  mongoose.model<TreatmentTypeDoc>('TreatmentType', TreatmentTypeSchema);

export default TreatmentType;
