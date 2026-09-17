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
  WAREHOUSE_KINDS,
  type StockMovementType,
  type WarehouseKind,
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
    // Compra: custo unitário (cêntimos), lote e validade — rastreabilidade
    // FEFO e valorização do consumo por local. Todos opcionais
    unitCostCents: z.preprocess(
      emptyToNull,
      z.coerce.number().int().min(0).max(100_000_000).nullable(),
    ),
    lot: z.preprocess(
      emptyToNull,
      z.string().trim().max(60, 'Lote demasiado longo').nullable(),
    ),
    expiryDate: z.preprocess(
      emptyToNull,
      z.coerce.date({ error: 'Validade inválida' }).nullable(),
    ),
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

// -----------------------------------------------------------------------------
// 4. STOCK POR LOCAL (set/2026) — locais, requisições, níveis, contagens
// -----------------------------------------------------------------------------

export const upsertLocationSchema = z.object({
  id: z.preprocess(
    emptyToNull,
    z.string().regex(OBJECT_ID, 'Local inválido').nullable(),
  ),
  clinicId: z.string().regex(OBJECT_ID, 'Clínica inválida'),
  name: z
    .string()
    .trim()
    .min(2, 'Nome demasiado curto')
    .max(80, 'Nome demasiado longo'),
  // 'central' nunca se cria pelo form (é o Armazém Geral auto-provisionado)
  kind: z.enum(
    WAREHOUSE_KINDS.filter(k => k !== 'central') as [
      WarehouseKind,
      ...WarehouseKind[],
    ],
    { error: 'Tipo de local inválido' },
  ),
  description: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Descrição demasiado longa').nullable(),
  ),
  responsibleUserId: z.preprocess(
    emptyToNull,
    z.string().regex(OBJECT_ID, 'Responsável inválido').nullable(),
  ),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export type UpsertLocationInput = z.infer<typeof upsertLocationSchema>;

export const toggleLocationActiveSchema = z.object({
  id: z.string().regex(OBJECT_ID, 'Local inválido'),
  active: z.preprocess(v => v === 'true' || v === true, z.boolean()),
});

// Requisição: central → local da MESMA clínica (par atómico no ledger).
// Aceita várias linhas de uma vez (a Isabel leva uma caixa de cada coisa).
export const requisitionLineSchema = z.object({
  productId: z.string().regex(OBJECT_ID, 'Produto inválido'),
  quantity: quantityField,
});
export const requisitionSchema = z.object({
  toWarehouseId: z.string().regex(OBJECT_ID, 'Local inválido'),
  lines: z
    .array(requisitionLineSchema)
    .min(1, 'Indique pelo menos um produto')
    .max(100, 'Máximo 100 linhas por requisição'),
  note: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Nota demasiado longa').nullable(),
  ),
});
export type RequisitionInput = z.infer<typeof requisitionSchema>;

// Devolução: local → central (material não usado que volta ao armazém)
export const returnToCentralSchema = z.object({
  fromWarehouseId: z.string().regex(OBJECT_ID, 'Local inválido'),
  productId: z.string().regex(OBJECT_ID, 'Produto inválido'),
  quantity: quantityField,
  note: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Nota demasiado longa').nullable(),
  ),
});

export const stockLevelSchema = z
  .object({
    productId: z.string().regex(OBJECT_ID, 'Produto inválido'),
    warehouseId: z.string().regex(OBJECT_ID, 'Local inválido'),
    min: z.coerce.number().min(0, 'Mínimo inválido').max(1_000_000),
    max: z.coerce.number().min(0, 'Máximo inválido').max(1_000_000),
  })
  .refine(d => d.max === 0 || d.max >= d.min, {
    message: 'Máximo tem de ser ≥ mínimo',
    path: ['max'],
  });
export type StockLevelInput = z.infer<typeof stockLevelSchema>;

export const openCountSchema = z.object({
  warehouseId: z.string().regex(OBJECT_ID, 'Local inválido'),
});

export const closeCountSchema = z.object({
  countId: z.string().regex(OBJECT_ID, 'Contagem inválida'),
  // { productId: counted } — só linhas efetivamente contadas
  counted: z
    .array(
      z.object({
        productId: z.string().regex(OBJECT_ID, 'Produto inválido'),
        counted: z.coerce
          .number({ error: 'Quantidade inválida' })
          .min(0, 'Não pode ser negativa')
          .max(1_000_000),
      }),
    )
    .min(1, 'Conte pelo menos um produto'),
  note: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, 'Nota demasiado longa').nullable(),
  ),
});
export type CloseCountInput = z.infer<typeof closeCountSchema>;

/** Pura: diferença de uma linha de contagem → movimento a gerar (ou nada) */
export function countLineDelta(
  expected: number,
  counted: number,
): { type: 'consumption' | 'adjustment-in'; quantity: number } | null {
  const diff = Math.round((counted - expected) * 1000) / 1000;
  if (diff === 0) return null;
  return diff < 0
    ? { type: 'consumption', quantity: -diff }
    : { type: 'adjustment-in', quantity: diff };
}
