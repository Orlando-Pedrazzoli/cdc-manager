// 📄 src/lib/validations/supplier.ts
// =============================================================================
// CDC Manager — Validações: Fornecedores / Laboratórios (E3)
// =============================================================================

import { z } from 'zod';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;
const optionalShort = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label} demasiado longo`).nullable(),
  );
const checkbox = z.preprocess(
  v => v === 'on' || v === 'true' || v === true,
  z.boolean(),
);

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Indique o nome do fornecedor')
    .max(120, 'Nome demasiado longo'),
  isLab: checkbox,
  nif: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z]{5,20}$/, 'NIF inválido')
      .nullable(),
  ),
  contactName: optionalShort(80, 'Nome do contacto'),
  phone: optionalShort(30, 'Telefone'),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email('Email inválido').max(120).nullable(),
  ),
  address: optionalShort(200, 'Morada'),
  defaultLeadDays: z.preprocess(
    emptyToNull,
    z.coerce
      .number()
      .int('Dias inválidos')
      .min(0)
      .max(120, 'Máximo 120 dias')
      .nullable(),
  ),
  notes: optionalShort(500, 'Notas'),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const supplierIdSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Fornecedor inválido'),
});
