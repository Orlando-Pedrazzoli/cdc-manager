// 📄 src/lib/validations/employee.ts
// CDC Manager — Validações: ficha de colaborador (E16)
import { z } from 'zod';
import { EMPLOYEE_CONTRACT_TYPES } from '@/lib/domain';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;
const text = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max).nullable().default(null),
  );
const euros = z.preprocess(
  v => {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  },
  z.number({ error: 'Valor inválido' }).int().min(0).nullable().default(null),
);
const pct = z.preprocess(
  v => {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const s = String(v).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  },
  z
    .number({ error: 'Percentagem inválida' })
    .min(0)
    .max(100)
    .nullable()
    .default(null),
);
const dateStr = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .nullable()
    .default(null),
);

export const employeeSchema = z.object({
  name: z.string().trim().min(2, 'Indique o nome').max(120),
  category: z
    .string()
    .trim()
    .min(2, 'Indique a categoria profissional')
    .max(80),
  contractType: z.enum(EMPLOYEE_CONTRACT_TYPES).default('sem-termo'),
  startDate: dateStr,
  endDate: dateStr,
  nif: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{9}$/, 'NIF deve ter 9 dígitos')
      .nullable()
      .default(null),
  ),
  niss: text(20),
  phone: text(30),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email('Email inválido').max(120).nullable().default(null),
  ),
  clinicIds: z.preprocess(
    v => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
    z.array(z.string().regex(OBJECT_ID)).default([]),
  ),
  initialSalaryCents: euros,
  socialSecurityRate: pct,
  irsRate: pct,
  schedule: text(300),
  benefits: text(1000),
  notes: text(2000),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const raiseSchema = z.object({
  employeeId: z.string().regex(OBJECT_ID),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  newSalaryCents: z.preprocess(
    v => {
      const s = String(v ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n) ? Math.round(n * 100) : NaN;
    },
    z
      .number({ error: 'Valor inválido' })
      .int()
      .min(1, 'Indique o novo salário'),
  ),
  note: text(500),
});
export const categoryChangeSchema = z.object({
  employeeId: z.string().regex(OBJECT_ID),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  category: z.string().trim().min(2, 'Indique a nova categoria').max(80),
  note: text(500),
});
export const warningSchema = z.object({
  employeeId: z.string().regex(OBJECT_ID),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  text: z.string().trim().min(5, 'Descreva a advertência').max(2000),
});
