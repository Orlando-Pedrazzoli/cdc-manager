// 📄 src/lib/validations/stock.ts
// =============================================================================
// CDC Manager — Validações Zod: Stock
// -----------------------------------------------------------------------------
// Três blocos:
//   1. PRODUTO — criar/editar/ativar. family é texto livre (taxonomia
//      emergente: o autocomplete alimenta-se das famílias já usadas).
//   2. MOVIMENTO MANUAL — entrada (purchase/adjustment-in) e saída
//      (consumption/adjustment-out/waste), quantity SEMPRE positiva
//      (direção pelo tipo — convenção do ledger). Acertos e quebras exigem
//      nota (auditabilidade do never-delete: corrige-se com movimento
//      contrário e o porquê fica escrito).
//   3. TRANSFERÊNCIA — clínica origem ≠ destino, par atómico na action.
//
// signedDelta é a única aritmética do módulo (pura, testável): converte
// (tipo, quantidade) no delta com sinal aplicado ao saldo.
// =============================================================================

import { z } from 'zod';
import {
  PRODUCT_UNITS,
  MANUAL_IN_TYPES,
  MANUAL_OUT_TYPES,
  STOCK_INBOUND_TYPES,
  type StockMovementType,
} from '@/lib/domain';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const emptyToNull = (v: unknown) =>
  v === undefined || (typeof v === 'string' && v.trim() === '') ? null : v;

// -----------------------------------------------------------------------------
// Pura: delta com sinal a aplicar ao saldo (e testável no sandbox)
// -----------------------------------------------------------------------------
export function signedDelta(type: StockMovementType, quantity: number): number {
  return STOCK_INBOUND_TYPES.includes(type) ? quantity : -quantity;
}

// -----------------------------------------------------------------------------
// 1. PRODUTO
// -----------------------------------------------------------------------------

// Quantidades em unidades inteiras ou fracionadas (ml/g) — até 3 casas
const quantityField = z.coerce
  .number({ error: 'Quantidade inválida' })
  .positive('Quantidade deve ser positiva')
  .max(1_000_000, 'Quantidade fora do intervalo')
  .refine(v => Math.round(v * 1000) === v * 1000, {
    message: 'Máximo 3 casas decimais',
  });

const productBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nome demasiado curto')
    .max(160, 'Nome demasiado longo'),
  // Texto livre; null = sem família. O autocomplete client sugere as
  // famílias existentes mas nunca restringe
  family: z.preprocess(
    emptyToNull,
    z.string().trim().max(80, 'Família demasiado longa').nullable(),
  ),
  unit: z.enum(PRODUCT_UNITS, { error: 'Selecione a unidade' }),
  minStock: z.coerce
    .number({ error: 'Mínimo inválido' })
    .min(0, 'Mínimo não pode ser negativo')
    .max(1_000_000, 'Mínimo fora do intervalo')
    .default(0),
  supplierName: z.preprocess(
    emptyToNull,
    z.string().trim().max(120, 'Fornecedor demasiado longo').nullable(),
  ),
  supplierRef: z.preprocess(
    emptyToNull,
    z.string().trim().max(80, 'Referência demasiado longa').nullable(),
  ),
});

export const createProductSchema = productBaseSchema;
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productBaseSchema.extend({
  id: z.string().regex(OBJECT_ID, 'Produto inválido'),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const toggleProductActiveSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Produto inválido'),
  active: z.preprocess(v => v === 'true' || v === true, z.boolean()),
});
export type ToggleProductActiveInput = z.infer<
  typeof toggleProductActiveSchema
>;

// -----------------------------------------------------------------------------
// 2. MOVIMENTO MANUAL (entrada/saída no armazém default da clínica)
// -----------------------------------------------------------------------------

const movementBase = {
  productId: z.string().regex(OBJECT_ID, 'Produto inválido'),
  clinicId: z.string().regex(OBJECT_ID, 'Clínica inválida'),
  quantity: quantityField,
  note: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Nota demasiado longa').nullable(),
  ),
};

// Entradas: acertos exigem nota com o motivo (auditabilidade)
export const stockEntrySchema = z
  .object({
    ...movementBase,
    type: z.enum(MANUAL_IN_TYPES, { error: 'Tipo de entrada inválido' }),
  })
  .refine(d => d.type !== 'adjustment-in' || !!d.note, {
    message: 'Acertos exigem nota com o motivo',
    path: ['note'],
  });
export type StockEntryInput = z.infer<typeof stockEntrySchema>;

// Saídas: acertos e quebras exigem nota (simetria auditável)
export const stockExitSchema = z
  .object({
    ...movementBase,
    type: z.enum(MANUAL_OUT_TYPES, { error: 'Tipo de saída inválido' }),
  })
  .refine(
    d => !(d.type === 'adjustment-out' || d.type === 'waste') || !!d.note,
    { message: 'Acertos e quebras exigem nota com o motivo', path: ['note'] },
  );
export type StockExitInput = z.infer<typeof stockExitSchema>;

// -----------------------------------------------------------------------------
// 3. TRANSFERÊNCIA entre clínicas (par atómico transfer-out + transfer-in)
// -----------------------------------------------------------------------------

export const stockTransferSchema = z
  .object({
    productId: z.string().regex(OBJECT_ID, 'Produto inválido'),
    fromClinicId: z.string().regex(OBJECT_ID, 'Clínica de origem inválida'),
    toClinicId: z.string().regex(OBJECT_ID, 'Clínica de destino inválida'),
    quantity: quantityField,
    note: z.preprocess(
      emptyToNull,
      z.string().trim().max(300, 'Nota demasiado longa').nullable(),
    ),
  })
  .refine(d => d.fromClinicId !== d.toClinicId, {
    message: 'Origem e destino têm de ser clínicas diferentes',
    path: ['toClinicId'],
  });
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
