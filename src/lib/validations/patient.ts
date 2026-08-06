// 📄 src/lib/validations/patient.ts
// =============================================================================
// CDC Manager — Validações Zod: Paciente
// -----------------------------------------------------------------------------
// Fonte única de validação dos dados administrativos do paciente, usada por
// actions/patients.ts (server) e reutilizável nos formulários (client).
//
// Decisões:
//   - NIF com CHECKSUM real (módulo 11), não só "9 dígitos": um dígito errado
//     na receção é apanhado na hora, não na primeira fatura Moloni recusada.
//   - Telefone NORMALIZADO para E.164 na validação: aceita como a receção
//     escreve ("912 345 678", "00351912345678", "+351 912345678") e guarda
//     sempre '+351912345678'. Números estrangeiros (+34..., +55...) aceites —
//     pacientes imigrantes são comuns. O WhatsApp (Sprint 6) exige E.164;
//     normalizar À ENTRADA evita uma migração de limpeza depois.
//   - Campos vazios de formulário ("") convertem para null — os inputs HTML
//     enviam string vazia, o Mongo guarda null, e o Zod faz a ponte.
//   - birthDate chega como 'YYYY-MM-DD' (input type=date) e sai como Date.
// =============================================================================

import { z } from 'zod';

// -----------------------------------------------------------------------------
// NIF — validação com dígito de controlo (módulo 11)
// -----------------------------------------------------------------------------

/** Valida um NIF português: 9 dígitos + checksum módulo 11 */
export function isValidNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  // Prefixos atribuídos pela AT (singulares, coletivas, entidades públicas…)
  if (!/^[123568]|^45|^7[0-9]|^9[0189]/.test(nif)) return false;
  const digits = nif.split('').map(Number);
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === digits[8];
}

// -----------------------------------------------------------------------------
// Telefone — normalização para E.164
// -----------------------------------------------------------------------------

/**
 * Normaliza para E.164 ou devolve null se irreconhecível.
 *   '912 345 678'      → '+351912345678'  (9 dígitos PT: móvel 9x, fixo 2x/3x)
 *   '00351912345678'   → '+351912345678'
 *   '+34 600 111 222'  → '+34600111222'   (internacional mantém o indicativo)
 */
export function normalizePhonePT(raw: string): string | null {
  // Remove tudo o que não é dígito ou '+' inicial
  let s = raw.trim().replace(/[\s().\-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  if (s.startsWith('+')) {
    const digits = s.slice(1);
    if (!/^\d{7,15}$/.test(digits)) return null; // E.164: máx. 15 dígitos
    // Caso PT explícito: exigir os 9 dígitos nacionais corretos
    if (digits.startsWith('351')) {
      const national = digits.slice(3);
      return /^[239]\d{8}$/.test(national) ? `+351${national}` : null;
    }
    return `+${digits}`;
  }

  // Sem indicativo: assumir PT se forem 9 dígitos a começar por 2, 3 ou 9
  if (/^[239]\d{8}$/.test(s)) return `+351${s}`;

  return null;
}

// -----------------------------------------------------------------------------
// Blocos reutilizáveis
// -----------------------------------------------------------------------------

// '' → null; string preenchida → trim
const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const nifField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .refine(isValidNif, 'NIF inválido — verifique os 9 dígitos')
    .nullable(),
);

const phoneField = z.preprocess(
  emptyToNull,
  z
    .string()
    .transform((v, ctx) => {
      const normalized = normalizePhonePT(v);
      if (!normalized) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Telefone inválido — 9 dígitos (PT) ou indicativo internacional +…',
        });
        return z.NEVER;
      }
      return normalized;
    })
    .nullable(),
);

const emailField = z.preprocess(
  emptyToNull,
  z.email('Email inválido').toLowerCase().nullable(),
);

const birthDateField = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .transform((v, ctx) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Data inválida' });
        return z.NEVER;
      }
      if (d > new Date()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Data de nascimento no futuro',
        });
        return z.NEVER;
      }
      if (d.getUTCFullYear() < 1900) {
        ctx.addIssue({ code: 'custom', message: 'Data demasiado antiga' });
        return z.NEVER;
      }
      return d;
    })
    .nullable(),
);

const postalCodeField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{3}$/, 'Código postal inválido (formato 0000-000)')
    .nullable(),
);

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const objectIdField = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido')
    .nullable(),
);

// -----------------------------------------------------------------------------
// Schema principal — criação de paciente
// -----------------------------------------------------------------------------
export const createPatientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Nome demasiado curto')
    .max(160, 'Nome demasiado longo'),
  birthDate: birthDateField.default(null),
  nif: nifField.default(null),
  phone: phoneField.default(null),
  email: emailField.default(null),
  street: optionalText(200).default(null),
  postalCode: postalCodeField.default(null),
  city: optionalText(100).default(null),
  profession: optionalText(100).default(null),
  preferredChannel: z
    .enum(['whatsapp', 'sms', 'email', 'phone'])
    .default('whatsapp'),
  preferredDoctorId: objectIdField.default(null),
  notes: optionalText(2000).default(null),
  // RGPD — checkboxes do formulário ('on' | ausente). A action converte
  // true → Date atual no campo consents.*At correspondente
  consentDataProcessing: z.coerce.boolean().default(false),
  consentReminders: z.coerce.boolean().default(false),
  consentMarketing: z.coerce.boolean().default(false),
  // Convite de ativação do portal no ato da criação (exige email OU telefone)
  sendActivationInvite: z.coerce.boolean().default(false),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

// -----------------------------------------------------------------------------
// Edição — mesmos campos, todos opcionais (PATCH semantics)
// -----------------------------------------------------------------------------
export const updatePatientSchema = createPatientSchema
  .omit({ sendActivationInvite: true })
  .partial();

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

// -----------------------------------------------------------------------------
// Pesquisa/listagem (query params da página /admin/pacientes)
// -----------------------------------------------------------------------------
export const searchPatientsSchema = z.object({
  // Texto livre: nome, telefone (qualquer formato) ou nº de processo
  q: z.string().trim().max(80).optional().default(''),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active'),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});

export type SearchPatientsInput = z.infer<typeof searchPatientsSchema>;
