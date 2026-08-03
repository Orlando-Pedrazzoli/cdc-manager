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
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
