// 📄 src/lib/validations/procedure.ts
// =============================================================================
// CDC Manager — Validações Zod: atos clínicos e notas de consulta
// -----------------------------------------------------------------------------
// Convenções: dinheiro em CÊNTIMOS INTEIROS (o form envia euros "45" ou
// "45,50" → preprocess converte); dentes em notação FDI, o form envia CSV
// ("11, 26") → array validado; ''→null nos opcionais.
// =============================================================================

import { z } from 'zod';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// FDI: definitivos 11-48, decíduos 51-85 (quadrantes 1-8, posições 1-8/1-5)
export const FDI_REGEX =
  /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

/**
 * "45" / "45,5" / "45.50" / "1 234,50" → cêntimos inteiros (4550).
 * Rejeita negativos, vazio e lixo. Math.round mata o erro binário
 * (45.1 * 100 = 4509.999...).
 */
export const eurosToCentsField = z.preprocess(
  v => {
    if (typeof v !== 'string' && typeof v !== 'number') return v;
    const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return undefined;
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN; // deixa o z.number() acusar
    return Math.round(n * 100);
  },
  z
    .number({ error: 'Preço inválido' })
    .int()
    .min(0, 'O preço não pode ser negativo')
    .max(10_000_000, 'Preço demasiado alto'), // teto sanidade: 100 000 €
);

/** "11, 26" / "11 26" / "" → ['11','26'] validados FDI (vazio = sem dentes) */
export const toothNumbersField = z.preprocess(
  v => {
    if (Array.isArray(v)) return v;
    if (typeof v !== 'string') return [];
    return v
      .split(/[\s,;]+/)
      .map(t => t.trim())
      .filter(t => t !== '');
  },
  z
    .array(
      z.string().regex(FDI_REGEX, 'Dente inválido (notação FDI, ex.: 11, 26)'),
    )
    .max(32, 'Demasiados dentes'),
);

const optionalText = (max: number) =>
  z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable(),
  );

// --- Registar ato durante a consulta -----------------------------------------
export const addProcedureSchema = z.object({
  appointmentId: z.string().regex(OBJECT_ID),
  treatmentTypeId: z.string().regex(OBJECT_ID, 'Selecione o ato'),
  priceEuros: eurosToCentsField, // já chega às actions em CÊNTIMOS
  toothNumbers: toothNumbersField,
  notes: optionalText(1000),
});
export type AddProcedureInput = z.infer<typeof addProcedureSchema>;

// --- Anular ato (never delete) -----------------------------------------------
export const voidProcedureSchema = z.object({
  procedureId: z.string().regex(OBJECT_ID),
  reason: z.string().trim().min(3, 'Indique o motivo da anulação').max(300),
});
export type VoidProcedureInput = z.infer<typeof voidProcedureSchema>;

// --- Nota clínica (append-only na ficha) -------------------------------------
export const addClinicalNoteSchema = z.object({
  appointmentId: z.string().regex(OBJECT_ID),
  text: z
    .string()
    .trim()
    .min(1, 'A nota não pode ficar vazia')
    .max(5000, 'Nota demasiado longa (máx. 5000 caracteres)'),
});
export type AddClinicalNoteInput = z.infer<typeof addClinicalNoteSchema>;

// --- Concluir consulta -------------------------------------------------------
export const completeConsultationSchema = z.object({
  appointmentId: z.string().regex(OBJECT_ID),
  finalNote: optionalText(5000),
});
export type CompleteConsultationInput = z.infer<
  typeof completeConsultationSchema
>;

// --- Anamnese (atualização integral da secção estruturada) -------------------
// Alergias/medicação chegam como JSON (hidden input do form — padrão do
// projeto, ver clinicSchedules no DoctorForm); condições como JSON de
// [{condition, detail}].
const jsonArrayOfStrings = z.preprocess(
  v => {
    if (Array.isArray(v)) return v;
    if (typeof v !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  z.array(z.string().trim().min(1).max(160)).max(40),
);

export const updateAnamnesisSchema = z.object({
  patientId: z.string().regex(OBJECT_ID),
  allergies: jsonArrayOfStrings,
  currentMedications: jsonArrayOfStrings,
  systemicConditions: z.preprocess(
    v => {
      if (Array.isArray(v)) return v;
      if (typeof v !== 'string') return [];
      try {
        const parsed: unknown = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    z
      .array(
        z.object({
          condition: z.string().trim().min(1).max(60),
          detail: z.preprocess(
            d => (typeof d === 'string' && d.trim() === '' ? null : d),
            z.string().trim().max(300).nullable(),
          ),
        }),
      )
      .max(30),
  ),
  // 'yes' | 'no' | '' (não perguntado) → boolean | null
  smoker: z.preprocess(
    v => (v === 'yes' ? true : v === 'no' ? false : null),
    z.boolean().nullable(),
  ),
  anamnesisNotes: optionalText(3000),
});
export type UpdateAnamnesisInput = z.infer<typeof updateAnamnesisSchema>;
