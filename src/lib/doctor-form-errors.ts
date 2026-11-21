// 📄 src/lib/doctor-form-errors.ts
// =============================================================================
// CDC Manager — Médicos: validação do formulário com erros POR CAMPO
// -----------------------------------------------------------------------------
// O formulário do médico é longo (identificação, especialidades, horários por
// clínica, conta de acesso). Antes, a action devolvia só a PRIMEIRA mensagem
// do Zod, sem dizer a que campo pertencia — e, quando faltava um campo, a
// mensagem era a técnica ("Invalid input: expected array…").
//
// Este módulo é PURO (sem base de dados) e corre nos dois lados:
//   · no browser, antes de enviar — o aviso aparece logo, junto ao campo;
//   · na action, como validação autoritativa — devolve a mesma estrutura.
//
// Devolve TODOS os problemas de uma vez: um por campo e, nos horários, um por
// clínica/dia, para o formulário os mostrar no sítio certo.
// =============================================================================

import type { z } from 'zod';
import {
  createDoctorSchema,
  updateDoctorSchema,
  type CreateDoctorInput,
  type UpdateDoctorInput,
} from '@/lib/validations/doctor';

export const DOCTOR_FIELDS = [
  'name',
  'licenseNumber',
  'birthDate',
  'commissionRate',
  'monthlyGoalCents',
  'color',
  'specialties',
  'email',
] as const;
export type DoctorField = (typeof DOCTOR_FIELDS)[number];

/** Nome do campo como aparece no ecrã (resumo dos erros) */
export const DOCTOR_FIELD_LABEL: Record<DoctorField, string> = {
  name: 'Nome',
  licenseNumber: 'Cédula profissional',
  birthDate: 'Data de nascimento',
  commissionRate: 'Comissão base',
  monthlyGoalCents: 'Objetivo mensal',
  color: 'Cor nas agendas',
  specialties: 'Especialidades',
  email: 'Email do profissional',
};

export interface DoctorScheduleError {
  /** null = problema do conjunto dos horários (ex.: nenhuma clínica ativada) */
  clinicId: string | null;
  /** 0–6; null = problema da clínica inteira */
  weekday: number | null;
  message: string;
}

export interface DoctorFormErrors {
  fields: Partial<Record<DoctorField, string>>;
  schedule: DoctorScheduleError[];
  /** Problema que não pertence a nenhum campo (permissões, falha ao gravar) */
  form?: string;
}

export function emptyDoctorFormErrors(): DoctorFormErrors {
  return { fields: {}, schedule: [] };
}

export function countDoctorFormErrors(e: DoctorFormErrors): number {
  return Object.keys(e.fields).length + e.schedule.length + (e.form ? 1 : 0);
}

/**
 * FormData → objeto para o schema. `Object.fromEntries` ficava só com o
 * ÚLTIMO valor de cada nome: com várias especialidades assinaladas, só a
 * última era gravada. As especialidades vão sempre como lista (vazia se
 * nenhuma estiver assinalada, para o schema avisar em vez de ignorar).
 */
export function doctorFormRaw(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'specialties') raw[key] = value;
  }
  raw.specialties = formData.getAll('specialties').map(String);
  return raw;
}

// -----------------------------------------------------------------------------
// Issues do Zod → erros por campo / por clínica e dia
// -----------------------------------------------------------------------------
interface RawSchedule {
  clinicId?: unknown;
  weeklySchedule?: { weekday?: unknown }[];
}

function parseRawSchedules(v: unknown): RawSchedule[] {
  let parsed = v;
  if (typeof v === 'string') {
    try {
      parsed = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? (parsed as RawSchedule[]) : [];
}

function isDoctorField(v: unknown): v is DoctorField {
  return (DOCTOR_FIELDS as readonly string[]).includes(String(v));
}

export function doctorErrorsFromIssues(
  issues: z.core.$ZodIssue[],
  raw: Record<string, unknown>,
): DoctorFormErrors {
  const errors = emptyDoctorFormErrors();
  const rawSchedules = parseRawSchedules(raw.clinicSchedules);

  for (const issue of issues) {
    const [head, ...rest] = issue.path;

    if (head === 'clinicSchedules') {
      // Caminho: [clinicSchedules, i, 'weeklySchedule', j, 'ranges', k, …]
      const entry = typeof rest[0] === 'number' ? rawSchedules[rest[0]] : null;
      const clinicId =
        entry && typeof entry.clinicId === 'string' ? entry.clinicId : null;
      const day =
        entry && rest[1] === 'weeklySchedule' && typeof rest[2] === 'number'
          ? entry.weeklySchedule?.[rest[2]]
          : null;
      const weekday =
        day && typeof day.weekday === 'number' ? day.weekday : null;
      const duplicate = errors.schedule.some(
        s =>
          s.clinicId === clinicId &&
          s.weekday === weekday &&
          s.message === issue.message,
      );
      if (!duplicate) {
        errors.schedule.push({ clinicId, weekday, message: issue.message });
      }
      continue;
    }

    if (isDoctorField(head)) {
      // Uma mensagem por campo: a primeira é a mais relevante
      if (!errors.fields[head]) errors.fields[head] = issue.message;
      continue;
    }

    if (!errors.form) errors.form = issue.message;
  }
  return errors;
}

// -----------------------------------------------------------------------------
// Validação completa (schema + regras que cruzam campos)
// -----------------------------------------------------------------------------
export type DoctorFormValidation<T> =
  { ok: true; data: T } | { ok: false; errors: DoctorFormErrors };

const truthy = (v: unknown) => v === true || v === 'on' || v === 'true';

export function validateCreateDoctor(
  raw: Record<string, unknown>,
): DoctorFormValidation<CreateDoctorInput> {
  const parsed = createDoctorSchema.safeParse(raw);
  const errors = parsed.success
    ? emptyDoctorFormErrors()
    : doctorErrorsFromIssues(parsed.error.issues, raw);

  // Convite assinalado sem email: avisar no campo do email
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  if (
    truthy(raw.sendActivationInvite) &&
    email === '' &&
    !errors.fields.email
  ) {
    errors.fields.email =
      'Indique o email para enviar o convite (ou desmarque o convite).';
  }

  if (parsed.success && countDoctorFormErrors(errors) === 0) {
    return { ok: true, data: parsed.data };
  }
  return { ok: false, errors };
}

export function validateUpdateDoctor(
  raw: Record<string, unknown>,
): DoctorFormValidation<UpdateDoctorInput> {
  const parsed = updateDoctorSchema.safeParse(raw);
  if (parsed.success) {
    // Campo que o formulário não enviou = não mexer. Os que têm valor por
    // omissão no schema (comissão, objetivo, cor) viriam preenchidos com esse
    // valor e apagariam o que está gravado.
    const data = { ...parsed.data };
    for (const key of [
      'commissionRate',
      'monthlyGoalCents',
      'color',
    ] as const) {
      if (!(key in raw)) delete data[key];
    }
    return { ok: true, data };
  }
  return {
    ok: false,
    errors: doctorErrorsFromIssues(parsed.error.issues, raw),
  };
}

/** Frase curta para toast / linha junto ao botão */
export function doctorErrorsSummary(e: DoctorFormErrors): string {
  const n = countDoctorFormErrors(e);
  if (n === 0) return '';
  if (n === 1) {
    return (
      e.form ??
      Object.values(e.fields)[0] ??
      e.schedule[0]?.message ??
      'Há um campo por corrigir.'
    );
  }
  return `Há ${n} pontos por corrigir — veja os campos assinalados.`;
}
