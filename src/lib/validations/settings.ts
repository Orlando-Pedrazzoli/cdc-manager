// 📄 src/lib/validations/settings.ts
// =============================================================================
// CDC Manager — Validações Zod: Configurações
// -----------------------------------------------------------------------------
// Dois blocos:
//   1. CATÁLOGO DE ATOS (TreatmentType) — criar/editar/ativar-desativar.
//      Preço chega do formulário em EUROS ("45" | "45,15" | "45.15") e é
//      convertido para CÊNTIMOS INTEIROS aqui (regra de ouro do dinheiro).
//      Duração validada contra a granularidade da grelha (múltipla de 15).
//   2. CLÍNICAS (Clinic) — identidade/fiscal/políticas online num schema e
//      HORÁRIOS noutro (forms separados na UI; gravar horários NUNCA toca
//      marcações existentes — o motor de disponibilidade aplica daí em
//      diante; conflitos avisam-se, remarcar é decisão humana).
//
// Nota: timeRange/weeklyDay são redefinidos localmente porque doctor.ts não
// os exporta — a estrutura é a mesma do model Clinic (ranges[] por weekday,
// vazio = encerrado). Se um terceiro consumidor aparecer, extrair para um
// validations/schedule.ts partilhado.
// =============================================================================

import { z } from 'zod';
import {
  SPECIALTIES,
  SLOT_GRANULARITY_MIN,
  DURATION_SOURCES,
} from '@/lib/domain';
import { isValidNif } from '@/lib/validations/patient';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

// -----------------------------------------------------------------------------
// Helpers monetários (exportados para testes/reuso)
// -----------------------------------------------------------------------------

/**
 * Converte string de euros do formulário em cêntimos inteiros.
 * Aceita vírgula ou ponto decimal ("45", "45,15", "45.15", "1 250,00").
 * Devolve null se não for um valor monetário válido (o Zod reporta).
 * Math.round corrige o clássico 45.15 * 100 = 4514.999999...
 */
export function parseEurosToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Campo de preço: euros (string do form) → cêntimos (inteiro ≥ 0)
const priceEurosField = z.preprocess(
  v => {
    if (typeof v !== 'string') return v;
    const cents = parseEurosToCents(v);
    return cents === null ? v : cents; // inválido → deixa o Zod reportar
  },
  z
    .number({ error: 'Preço inválido (ex.: 45 ou 45,50)' })
    .int('Preço inválido (máximo 2 casas decimais)')
    .min(0, 'Preço não pode ser negativo')
    .max(10_000_000, 'Preço fora do intervalo permitido'), // 100 000,00 €
);

// -----------------------------------------------------------------------------
// 1. CATÁLOGO DE ATOS
// -----------------------------------------------------------------------------

const durationField = z.coerce
  .number({ error: 'Duração inválida' })
  .int('Duração inválida')
  .min(SLOT_GRANULARITY_MIN, `Duração mínima: ${SLOT_GRANULARITY_MIN} min`)
  .max(480, 'Duração máxima: 480 min')
  .refine(v => v % SLOT_GRANULARITY_MIN === 0, {
    message: `Duração deve ser múltipla de ${SLOT_GRANULARITY_MIN} minutos`,
  });

const bufferField = z.coerce
  .number({ error: 'Buffer inválido' })
  .int('Buffer inválido')
  .min(0, 'Buffer não pode ser negativo')
  .max(120, 'Buffer máximo: 120 min');

// Meses até recall automático; '' = sem recall (null)
const recallMonthsField = z.preprocess(
  emptyToNull,
  z.coerce
    .number({ error: 'Intervalo de recall inválido' })
    .int('Intervalo de recall inválido')
    .min(1, 'Recall mínimo: 1 mês')
    .max(60, 'Recall máximo: 60 meses')
    .nullable(),
);

// Checkbox HTML: 'on' quando marcado, ausente (undefined) quando não —
// z.coerce.boolean() cobre exatamente este par (nunca recebe a string "false")
const checkboxField = z.coerce.boolean().default(false);

const treatmentTypeBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Nome demasiado curto')
    .max(160, 'Nome demasiado longo'),
  specialty: z.enum(SPECIALTIES, { error: 'Selecione a especialidade' }),
  durationMin: durationField,
  bufferMin: bufferField,
  // priceCents no output — o form envia euros no campo 'priceEuros'
  priceCents: priceEurosField,
  bookableOnline: checkboxField,
  requiresEvaluation: checkboxField,
  recallIntervalMonths: recallMonthsField.default(null),
  notes: z.preprocess(
    emptyToNull,
    z.string().trim().max(500, 'Notas demasiado longas').nullable(),
  ),
  // Marcado quando a equipa da clínica valida duração/preço reais →
  // a action grava source: 'clinic-confirmed' (senão mantém 'benchmark')
  clinicConfirmed: checkboxField,
});

/** Criar ato — slug é gerado do nome na action (imutável depois) */
export const createTreatmentTypeSchema = treatmentTypeBaseSchema;
export type CreateTreatmentTypeInput = z.infer<
  typeof createTreatmentTypeSchema
>;

/** Editar ato — form completo (modal envia todos os campos) */
export const updateTreatmentTypeSchema = treatmentTypeBaseSchema.extend({
  id: z.string().regex(OBJECT_ID, 'Ato inválido'),
});
export type UpdateTreatmentTypeInput = z.infer<
  typeof updateTreatmentTypeSchema
>;

/** Ativar/desativar ato (toggle na listagem — soft, nunca apaga) */
export const toggleTreatmentActiveSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Ato inválido'),
  // Vem de um botão com value explícito 'true'|'false' (NÃO usar
  // z.coerce.boolean aqui: Boolean('false') === true)
  active: z.preprocess(v => v === 'true' || v === true, z.boolean()),
});
export type ToggleTreatmentActiveInput = z.infer<
  typeof toggleTreatmentActiveSchema
>;

// Guarda de consistência exportada para a action: fonte do valor gravado
export const durationSourceFromFlag = (clinicConfirmed: boolean) =>
  clinicConfirmed ? DURATION_SOURCES[1] : DURATION_SOURCES[0];

// -----------------------------------------------------------------------------
// 2. CLÍNICAS — identidade, fiscal e políticas de marcação online
// -----------------------------------------------------------------------------

// NIPC usa o mesmo dígito de controlo mod-11 do NIF — reutiliza isValidNif
const nipcField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'NIPC deve ter 9 dígitos')
    .refine(isValidNif, 'NIPC inválido (dígito de controlo)')
    .nullable(),
);

// Comissão default no form em PERCENTAGEM (40 = 40% para o profissional);
// guardada como fração (0.40) — mesmo contrato do form de Corpo Clínico
const commissionPercentField = z.coerce
  .number({ error: 'Comissão inválida' })
  .min(0, 'Comissão inválida')
  .max(100, 'Comissão inválida')
  .transform(v => v / 100);

export const updateClinicSchema = z.object({
  clinicId: z.string().regex(OBJECT_ID, 'Clínica inválida'),
  name: z
    .string()
    .trim()
    .min(3, 'Nome demasiado curto')
    .max(120, 'Nome demasiado longo'),
  legalName: z.preprocess(
    emptyToNull,
    z.string().trim().max(160, 'Denominação demasiado longa').nullable(),
  ),
  nipc: nipcField,
  address: z.preprocess(
    emptyToNull,
    z.string().trim().max(240, 'Morada demasiado longa').nullable(),
  ),
  phone: z.preprocess(
    emptyToNull,
    z.string().trim().max(30, 'Telefone demasiado longo').nullable(),
  ),
  email: z.preprocess(
    emptyToNull,
    z.email('Email inválido').toLowerCase().nullable(),
  ),
  maxConcurrentAppointments: z.coerce
    .number({ error: 'Capacidade inválida' })
    .int('Capacidade inválida')
    .min(1, 'Capacidade mínima: 1')
    .max(20, 'Capacidade máxima: 20'),
  onlineMinNoticeHours: z.coerce
    .number({ error: 'Antecedência inválida' })
    .int('Antecedência inválida')
    .min(0, 'Antecedência inválida')
    .max(168, 'Antecedência máxima: 168 h (1 semana)'),
  onlineMaxAdvanceDays: z.coerce
    .number({ error: 'Horizonte inválido' })
    .int('Horizonte inválido')
    .min(1, 'Horizonte mínimo: 1 dia')
    .max(365, 'Horizonte máximo: 365 dias'),
  cancellationMinNoticeHours: z.coerce
    .number({ error: 'Antecedência de cancelamento inválida' })
    .int('Antecedência de cancelamento inválida')
    .min(0, 'Antecedência de cancelamento inválida')
    .max(168, 'Antecedência máxima: 168 h (1 semana)'),
  bookableOnline: checkboxField,
  defaultDoctorCommission: commissionPercentField,
});
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;

// -----------------------------------------------------------------------------
// 2b. CLÍNICAS — horários de funcionamento
// -----------------------------------------------------------------------------

const timeRangeSchema = z
  .object({
    start: z.string().regex(HHMM, 'Hora inválida (HH:mm)'),
    end: z.string().regex(HHMM, 'Hora inválida (HH:mm)'),
  })
  .refine(r => r.start < r.end, {
    message: 'A hora de fim deve ser posterior à de início',
  });

const openingDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6), // 0 = domingo (contrato do model)
    ranges: z.array(timeRangeSchema).max(6), // vazio = encerrado
  })
  .refine(
    d => {
      // Intervalos do mesmo dia sem sobreposição (HH:mm de largura fixa →
      // comparação lexicográfica é segura)
      const sorted = [...d.ranges].sort((a, b) => (a.start < b.start ? -1 : 1));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end) return false;
      }
      return true;
    },
    { message: 'Intervalos sobrepostos no mesmo dia' },
  );

export const updateClinicHoursSchema = z.object({
  clinicId: z.string().regex(OBJECT_ID, 'Clínica inválida'),
  // Campo hidden com JSON — o editor de horários (client) serializa a
  // estrutura completa dos 7 dias
  openingHours: z.preprocess(
    v => {
      if (typeof v !== 'string') return v;
      try {
        return JSON.parse(v);
      } catch {
        return v; // deixa o Zod reportar tipo inválido
      }
    },
    z
      .array(openingDaySchema)
      .length(7, 'Horário deve cobrir os 7 dias da semana')
      .refine(
        arr => new Set(arr.map(d => d.weekday)).size === 7,
        'Dia da semana duplicado ou em falta',
      ),
  ),
});
export type UpdateClinicHoursInput = z.infer<typeof updateClinicHoursSchema>;
