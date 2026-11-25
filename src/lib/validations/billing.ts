// 📄 src/lib/validations/billing.ts
// =============================================================================
// CDC Manager — Validações Zod: cobrança no balcão
// =============================================================================

import { z } from 'zod';
import { PAYMENT_METHODS } from '@/lib/domain';
import { isValidNif } from '@/lib/validations/patient';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export const checkoutSchema = z.object({
  clinicId: z.string().regex(OBJECT_ID),
  patientId: z.string().regex(OBJECT_ID),
  // IDs dos atos selecionados (JSON do modal)
  procedureIds: z.preprocess(
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
      .array(z.string().regex(OBJECT_ID))
      .min(1, 'Selecione pelo menos um ato a cobrar')
      .max(60),
  ),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: 'Selecione o meio de pagamento',
  }),
  // NIF para o documento (dedução IRS); '' → null (consumidor final)
  nif: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .regex(/^\d{9}$/, 'NIF deve ter 9 dígitos')
      .refine(isValidNif, 'NIF inválido (dígito de controlo)')
      .nullable(),
  ),
  // Fase 5C: valor pago AGORA. Entra do formulário em EUROS ("120,50"),
  // sai daqui em CÊNTIMOS inteiros; '' ou ausente = null = total.
  paidNowCents: z.preprocess(
    v => {
      if (typeof v !== 'string' && typeof v !== 'number') return null;
      const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? Math.round(n * 100) : NaN;
    },
    z.number({ error: 'Valor inválido' }).int().min(0).nullable().default(null),
  ),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// --- Registar pagamento numa fatura com saldo (Fase 5C) -------------------------
export const registerPaymentSchema = z.object({
  invoiceId: z.string().regex(OBJECT_ID, 'Fatura inválida'),
  amountEuros: z.preprocess(
    v => {
      const s = String(v ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n) ? Math.round(n * 100) : NaN;
    },
    z.number({ error: 'Valor inválido' }).int().min(1, 'Indique o valor'),
  ),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: 'Selecione o meio de pagamento',
  }),
  note: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(200).nullable().default(null),
  ),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

// --- Anular fatura (Fase 1, E2) -----------------------------------------------
// voidProcedures = resposta ao "Quer criar uma linha de balanço? Sim/Não":
//   true  → erro foi nos TRATAMENTOS: atos anulados + estorno de comissão
//   false → erro foi no DOCUMENTO (NIF, meio de pagamento…): atos voltam à
//           fila de cobrança para nova fatura
export const voidInvoiceSchema = z.object({
  invoiceId: z.string().regex(OBJECT_ID, 'Fatura inválida'),
  reason: z
    .string()
    .trim()
    .min(3, 'Indique o motivo da anulação')
    .max(300, 'Motivo demasiado longo'),
  voidProcedures: z.preprocess(
    v => v === 'true' || v === 'on' || v === true,
    z.boolean(),
  ),
  // 25/11 (Isabel): 'void' = anular (só no próprio dia); 'credit-total' =
  // nota de crédito total (qualquer dia). Default 'void' (formulário antigo).
  mode: z.preprocess(
    v => (v == null || v === '' ? 'void' : v),
    z.enum(['void', 'credit-total']),
  ),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

// --- Nota de crédito parcial (25/11, Isabel) ---------------------------------
//   kind 'lines' → lineIndexes "0,2" (linhas da fatura) + voidProcedures
//   kind 'value' → valueEuros + description (ex.: desconto esquecido)
export const partialCreditNoteSchema = z
  .object({
    invoiceId: z.string().regex(OBJECT_ID, 'Fatura inválida'),
    kind: z.enum(['lines', 'value']),
    reason: z
      .string()
      .trim()
      .min(3, 'Indique o motivo da nota de crédito')
      .max(300, 'Motivo demasiado longo'),
    lineIndexes: z.preprocess(
      v =>
        String(v ?? '')
          .split(',')
          .map(x => x.trim())
          .filter(Boolean)
          .map(Number),
      z.array(z.number().int().min(0)),
    ),
    valueCents: z.preprocess(
      v => {
        const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
        if (s === '') return 0;
        const n = Number(s);
        return Number.isFinite(n) ? Math.round(n * 100) : NaN;
      },
      z.number({ error: 'Valor inválido' }).int().min(0),
    ),
    description: z.preprocess(
      v => (v == null ? '' : String(v).trim()),
      z.string().max(120, 'Descrição demasiado longa'),
    ),
    voidProcedures: z.preprocess(
      v => v === 'true' || v === 'on' || v === true,
      z.boolean(),
    ),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'lines' && d.lineIndexes.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Escolha pelo menos uma linha.' });
    if (d.kind === 'value' && d.valueCents <= 0)
      ctx.addIssue({ code: 'custom', message: 'Indique o valor a creditar.' });
  });
export type PartialCreditNoteInput = z.infer<typeof partialCreditNoteSchema>;
