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
// De lib/domain (e não de models/Doctor): este ficheiro também corre no
// browser, para o formulário validar antes de enviar — sem arrastar o Mongoose.
import { SPECIALTIES } from '@/lib/domain';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// -----------------------------------------------------------------------------
// Estruturas de horário
// -----------------------------------------------------------------------------
const timeRangeSchema = z
  .object({
    start: z
      .string({ error: 'Falta a hora de início' })
      .regex(HHMM, 'Hora de início inválida'),
    end: z
      .string({ error: 'Falta a hora de fim' })
      .regex(HHMM, 'Hora de fim inválida'),
  })
  .refine(r => r.start < r.end, {
    message: 'A hora de fim deve ser posterior à de início',
  });

const weeklyScheduleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    ranges: z.array(timeRangeSchema).max(6),
    // 5.ª ronda/07: quinzenal — data em que trabalha (mesmo dia da semana)
    biweeklyAnchor: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de referência inválida')
      .nullable()
      .optional(),
  })
  .refine(
    w => {
      if (!w.biweeklyAnchor) return true;
      const [y, m, d] = w.biweeklyAnchor.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === w.weekday;
    },
    {
      message:
        'Turno quinzenal: a data de referência tem de calhar nesse dia da semana',
    },
  )
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
    { message: 'Há períodos sobrepostos neste dia' },
  );

const clinicScheduleSchema = z.object({
  clinicId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Clínica inválida'),
  // Ativar "Trabalha em X" sem nenhum período criava um médico invisível na
  // agenda dessa clínica (a coluna só aparece com semana-tipo com períodos)
  // — o caso real do "médico novo cuja agenda não abre". Pelo menos um
  // período por clínica ativada.
  weeklySchedule: z
    .array(weeklyScheduleSchema)
    .max(7)
    .refine(days => days.some(d => d.ranges.length > 0), {
      message:
        'Defina pelo menos um período (dia e horas) em cada clínica ativada — sem horário o médico não aparece na agenda dessa clínica.',
    }),
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
    .array(clinicScheduleSchema, {
      error: 'Não foi possível ler os horários — recarregue a página',
    })
    .min(1, 'Ative pelo menos uma clínica ("Trabalha em…") e defina o horário')
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
    .number({ error: 'Comissão inválida — indique um número entre 0 e 100' })
    .min(0, 'A comissão não pode ser negativa')
    .max(100, 'A comissão não pode passar de 100%')
    .transform(v => v / 100)
    .nullable(),
);

const specialtiesField = z.preprocess(
  // Vários checkboxes com o mesmo name chegam como string ou array
  // (ausente = nenhuma assinalada)
  v => (v == null ? [] : typeof v === 'string' ? [v] : v),
  z
    .array(z.enum(SPECIALTIES, { error: 'Especialidade inválida' }), {
      error: 'Selecione pelo menos uma especialidade',
    })
    .min(1, 'Selecione pelo menos uma especialidade'),
);

// -----------------------------------------------------------------------------
// Schemas principais
// -----------------------------------------------------------------------------
export const createDoctorSchema = z.object({
  name: z
    .string({ error: 'Indique o nome do profissional' })
    .trim()
    .min(3, 'Indique o nome do profissional (mínimo 3 letras)')
    .max(120, 'Nome demasiado longo (máximo 120 caracteres)'),
  // 9.ª ronda (ponto 19): nome completo para atestados e relatórios
  fullName: z.preprocess(
    emptyToNull,
    z
      .string({ error: 'Nome completo inválido' })
      .trim()
      .min(5, 'Nome completo demasiado curto (mínimo 5 letras)')
      .max(160, 'Nome completo demasiado longo (máximo 160 caracteres)')
      .nullable()
      .optional(),
  ),
  // Cédula profissional (OMD) — numérica. Opcional no registo, mas será
  // exigida quando o médico emitir receitas/consentimentos (B.6): a UI
  // sinaliza quem não a tem para o admin regularizar antes disso.
  licenseNumber: z.preprocess(
    emptyToNull,
    z
      .string({ error: 'Cédula inválida — apenas dígitos (máx. 10)' })
      .trim()
      .regex(
        /^\d{1,10}$/,
        'Cédula inválida — apenas dígitos, sem espaços nem letras (máx. 10)',
      )
      .nullable(),
  ),
  // 8.ª ronda/09: data de nascimento (aviso de aniversário, só para a gestão)
  birthDate: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida')
      .refine(v => v <= new Date().toISOString().slice(0, 10), {
        message: 'A data de nascimento não pode ser no futuro',
      })
      .nullable()
      .optional(),
  ),
  specialties: specialtiesField,
  clinicSchedules: clinicSchedulesField,
  commissionRate: commissionField.default(null),
  // E18: objetivo mensal de produção em euros ("" = sem objetivo)
  monthlyGoalCents: z.preprocess(
    v => {
      if (typeof v !== 'string' && typeof v !== 'number') return v;
      const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? Math.round(n * 100) : NaN;
    },
    z
      .number({
        error: 'Objetivo inválido — indique um valor em euros (ex.: 15000)',
      })
      .int('Objetivo inválido — indique um valor em euros (ex.: 15000)')
      .min(0, 'O objetivo não pode ser negativo')
      .max(100_000_000, 'Objetivo demasiado alto')
      .nullable()
      .default(null),
  ),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida')
    .default('#2743A6'),
  // Conta de acesso do médico (User role doctor)
  email: z.preprocess(
    emptyToNull,
    z
      .email('Email inválido — confirme o formato (nome@dominio.pt)')
      .toLowerCase()
      .nullable(),
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
