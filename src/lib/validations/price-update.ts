// 📄 src/lib/validations/price-update.ts
// CDC Manager — Validação do pedido de atualização de preços (E8)
import { z } from 'zod';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const num = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return v;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export const priceUpdateSchema = z
  .object({
    scope: z.enum(['all', 'category', 'lines']),
    category: z.string().trim().max(60).nullable().default(null),
    lineIds: z.preprocess(
      v => {
        if (typeof v !== 'string' || !v.trim()) return [];
        try {
          return JSON.parse(v);
        } catch {
          return 'invalid';
        }
      },
      z.array(z.string().regex(OBJECT_ID)).max(500).default([]),
    ),
    mode: z.enum(['percent', 'amount']),
    value: z.preprocess(
      num,
      z.number({ error: 'Valor inválido' }).min(-100).max(1_000_000),
    ),
    rounding: z.enum(['cent', 'half-euro', 'euro']).default('cent'),
    reason: z.string().trim().max(200).nullable().default(null),
  })
  .superRefine((d, ctx) => {
    if (d.scope === 'category' && !d.category) {
      ctx.addIssue({ code: 'custom', message: 'Escolha a categoria' });
    }
    if (d.scope === 'lines' && d.lineIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Escolha pelo menos uma linha' });
    }
    if (d.mode === 'percent' && d.value === 0) {
      ctx.addIssue({ code: 'custom', message: 'A percentagem não pode ser 0' });
    }
    if (d.mode === 'amount' && d.value === 0) {
      ctx.addIssue({ code: 'custom', message: 'O valor não pode ser 0' });
    }
  });
export type PriceUpdateInput = z.infer<typeof priceUpdateSchema>;
