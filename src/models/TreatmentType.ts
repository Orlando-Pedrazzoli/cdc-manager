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
import {
  DURATION_SOURCES,
  SLOT_GRANULARITY_MIN,
  type DurationSource,
} from '@/lib/domain';

// Canónicos em lib/domain.ts (client precisa em runtime) — re-export para o
// código server continuar a poder importar do model, como sempre
export { DURATION_SOURCES, SLOT_GRANULARITY_MIN, type DurationSource };

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
    // --- Paridade Dentoral (Bloco A.3) --------------------------------------
    // Código interno do Dentoral (001-748). ÚNICO entre os importados —
    // chave de idempotência do script de importação. sparse: atos criados
    // no admin não têm (null não colide no índice).
    dentoralCode: {
      type: String,
      trim: true,
      default: null,
      unique: true,
      sparse: true,
      immutable: true,
    },
    // Código de nomenclatura/entidade (ex.: 'A1.01.01.01'). NÃO é único:
    // o mesmo ato clínico existe em várias categorias (endo sessão única/
    // múltipla/retratamentos partilham nomenclatura) — 78 duplicados na
    // tabela real. Obrigatório em comunicações com entidades; informativo
    // enquanto a clínica for 100% particular.
    entityCode: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
      index: true,
    },
    // Tipo de tratamento do Dentoral (texto verbatim, ex.: 'CIRURGIA ORAL').
    // TEXTO e não enum: fidelidade ao sistema antigo + clínica pode criar
    // categorias sem deploy (datalist alimentado por TREATMENT_CATEGORIES).
    category: {
      type: String,
      trim: true,
      maxlength: 60,
      default: null,
      index: true,
    },
    // Flag 'Controla Dente' do Dentoral: o ato EXIGE nº de dente ao registar
    // o procedimento (ex.: extração, endodontia — não faz sentido sem dente).
    controlsTooth: {
      type: Boolean,
      default: false,
    },
    // O ato exige consentimento RX assinado (liga ao módulo de documentos
    // no fluxo da consulta — Bloco B.6).
    requiresRxConsent: {
      type: Boolean,
      default: false,
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
    // Custo do tratamento em cêntimos (materiais/laboratório — campo do
    // Dentoral). Base para análise de margem; 0 = não definido.
    costCents: {
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
