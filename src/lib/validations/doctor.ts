// 📄 src/lib/validations/doctor.ts
// =============================================================================
// CDC Manager — Validações Zod: Médico
// -----------------------------------------------------------------------------
// Validação dos dados do médico, incluindo a REGRA DE NEGÓCIO prometida no
// model: os horários do mesmo médico em clínicas diferentes nunca podem
// sobrepor-se no tempo (ninguém está no Colombo e na Buraca ao mesmo tempo).
//
// Os horários (clinicSchedules) chegam do formulário como JSON num campo
// hidden — FormData é plano e a estrutura é aninhada; o schema faz o parse
// seguro e valida a estrutura completa:
//   1. cada intervalo: HH:mm válido e start < end
//   2. dentro do mesmo dia/clínica: intervalos sem sobreposição e ordenados
//   3. entre clínicas: mesmo dia da semana sem qualquer sobreposição
//   4. clínicas sem duplicados
// =============================================================================

import { z } from 'zod';
import { SPECIALTIES } from '@/models/Doctor';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// -----------------------------------------------------------------------------
// Estruturas de horário
// -----------------------------------------------------------------------------
const timeRangeSchema = z
  .object({
    start: z.string().regex(HHMM, 'Hora inválida (HH:mm)'),
    end: z.string().regex(HHMM, 'Hora inválida (HH:mm)'),
  })
  .refine(r => r.start < r.end, {
    message: 'A hora de fim deve ser posterior à de início',
  });

const weeklyScheduleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    ranges: z.array(timeRangeSchema).max(6),
  })
  .refine(
    w => {
      // Intervalos do mesmo dia sem sobreposição (comparação lexicográfica
      // de HH:mm é segura: largura fixa)
      const sorted = [...w.ranges].sort((a, b) => (a.start < b.start ? -1 : 1));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end) return false;
      }
      return true;
    },
    { message: 'Intervalos sobrepostos no mesmo dia' },
  );

const clinicScheduleSchema = z.object({
  clinicId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Clínica inválida'),
  weeklySchedule: z.array(weeklyScheduleSchema).max(7),
  bookableOnline: z.boolean().default(true),
});

export type ClinicScheduleInput = z.infer<typeof clinicScheduleSchema>;

// -----------------------------------------------------------------------------
// Sobreposição ENTRE clínicas (helper puro, exportado para testes/reuso)
// -----------------------------------------------------------------------------
const WEEKDAY_PT = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

/**
 * Devolve a descrição do primeiro conflito encontrado, ou null se ok.
 * Conflito = o mesmo dia da semana tem intervalos sobrepostos em clínicas
 * DIFERENTES (dentro da mesma clínica já foi validado acima).
 */
export function findCrossClinicOverlap(
  schedules: ClinicScheduleInput[],
): string | null {
  for (let weekday = 0; weekday <= 6; weekday++) {
    // Todos os intervalos deste dia, etiquetados com a clínica
    const all: { clinicId: string; start: string; end: string }[] = [];
    for (const cs of schedules) {
      const day = cs.weeklySchedule.find(w => w.weekday === weekday);
      if (!day) continue;
      for (const r of day.ranges) {
        all.push({ clinicId: cs.clinicId, ...r });
      }
    }
    all.sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1];
      const cur = all[i];
      if (cur.start < prev.end && cur.clinicId !== prev.clinicId) {
        return `Horários sobrepostos à ${WEEKDAY_PT[weekday]}: ${prev.start}–${prev.end} numa clínica e ${cur.start}–${cur.end} noutra. O médico não pode estar em duas clínicas ao mesmo tempo.`;
      }
    }
  }
  return null;
}

const clinicSchedulesField = z.preprocess(
  // Campo hidden com JSON — parse seguro
  v => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return v; // deixa o Zod reportar tipo inválido
    }
  },
  z
    .array(clinicScheduleSchema)
    .min(1, 'O médico deve ter horário em pelo menos uma clínica')
    .refine(
      arr => new Set(arr.map(s => s.clinicId)).size === arr.length,
      'Clínica duplicada nos horários',
    )
    .superRefine((arr, ctx) => {
      const conflict = findCrossClinicOverlap(arr);
      if (conflict) {
        ctx.addIssue({ code: 'custom', message: conflict });
      }
    }),
);

// -----------------------------------------------------------------------------
// Blocos simples
// -----------------------------------------------------------------------------
const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

// Comissão no formulário em PERCENTAGEM (40 = 40% para o médico);
// guardada como fração (0.40). Vazio = usa o default da clínica.
const commissionField = z.preprocess(
  emptyToNull,
  z.coerce
    .number()
    .min(0, 'Comissão inválida')
    .max(100, 'Comissão inválida')
    .transform(v => v / 100)
    .nullable(),
);

const specialtiesField = z.preprocess(
  // Vários checkboxes com o mesmo name chegam como string ou array
  v => (typeof v === 'string' ? [v] : v),
  z.array(z.enum(SPECIALTIES)).min(1, 'Selecione pelo menos uma especialidade'),
);

// -----------------------------------------------------------------------------
// Schemas principais
// -----------------------------------------------------------------------------
export const createDoctorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Nome demasiado curto')
    .max(120, 'Nome demasiado longo'),
  // Cédula profissional (OMD) — numérica. Opcional no registo, mas será
  // exigida quando o médico emitir receitas/consentimentos (B.6): a UI
  // sinaliza quem não a tem para o admin regularizar antes disso.
  licenseNumber: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, 'Cédula inválida — apenas dígitos (máx. 10)')
      .nullable(),
  ),
  specialties: specialtiesField,
  clinicSchedules: clinicSchedulesField,
  commissionRate: commissionField.default(null),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida')
    .default('#2743A6'),
  // Conta de acesso do médico (User role doctor)
  email: z.preprocess(
    emptyToNull,
    z.email('Email inválido').toLowerCase().nullable(),
  ),
  sendActivationInvite: z.coerce.boolean().default(false),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;

export const updateDoctorSchema = createDoctorSchema
  .omit({ email: true, sendActivationInvite: true })
  .partial();

export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;

// -----------------------------------------------------------------------------
// Exceções de agenda (férias, dias especiais)
// -----------------------------------------------------------------------------
export const doctorExceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    // '' = global (as duas clínicas)
    clinicId: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/)
        .nullable(),
    ),
    type: z.enum(['unavailable', 'custom']),
    ranges: z.preprocess(v => {
      if (typeof v !== 'string') return v ?? [];
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }, z.array(timeRangeSchema).max(6).default([])),
    reason: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()),
  })
  .refine(e => e.type === 'unavailable' || e.ranges.length > 0, {
    message: 'Horário especial requer pelo menos um intervalo',
  });

export type DoctorExceptionInput = z.infer<typeof doctorExceptionSchema>;
