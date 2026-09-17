// 📄 src/lib/stock-ledger.ts
// =============================================================================
// CDC Manager — Ledger de stock: helpers partilhados pelas actions
// -----------------------------------------------------------------------------
// Extraído de actions/stock.ts (set/2026) quando o módulo passou a ter
// vários ficheiros de actions (stock.ts, stock-locations.ts). Ficheiros
// 'use server' só podem exportar async — helpers síncronos vivem aqui.
//
//   applyCacheDelta      → atualiza Product.stockCache DENTRO da transação.
//                          Saídas condicionadas a saldo suficiente.
//   ensureCentralWarehouse → armazém central da clínica (auto-provisiona
//                          "Armazém Geral", idempotente; migra legado sem kind)
//   fmtQty               → "12 Unidade" para mensagens/auditoria
// =============================================================================

import mongoose from 'mongoose';
import Product from '@/models/Product';
import Warehouse, { type WarehouseDoc } from '@/models/Warehouse';
import { PRODUCT_UNIT_LABEL } from '@/lib/domain';

export function fmtQty(q: number, unit: string): string {
  return `${q} ${PRODUCT_UNIT_LABEL[unit as keyof typeof PRODUCT_UNIT_LABEL] ?? unit}`;
}

/**
 * Aplica um delta ao stockCache do produto DENTRO da transação.
 * Saídas (delta < 0): condicionado a saldo suficiente — devolve false se
 * não houver (o caller aborta a transação).
 * Entradas (delta > 0): $inc na entrada existente ou $push da primeira.
 */
export async function applyCacheDelta(
  productId: string | mongoose.Types.ObjectId,
  warehouseId: mongoose.Types.ObjectId,
  delta: number,
  mongooseSession: mongoose.ClientSession,
): Promise<boolean> {
  if (delta < 0) {
    const res = await Product.updateOne(
      {
        _id: productId,
        stockCache: {
          $elemMatch: { warehouseId, quantity: { $gte: -delta } },
        },
      },
      { $inc: { 'stockCache.$.quantity': delta } },
      { session: mongooseSession },
    );
    return res.modifiedCount === 1;
  }
  const inc = await Product.updateOne(
    { _id: productId, 'stockCache.warehouseId': warehouseId },
    { $inc: { 'stockCache.$.quantity': delta } },
    { session: mongooseSession },
  );
  if (inc.modifiedCount === 1) return true;
  const push = await Product.updateOne(
    { _id: productId, 'stockCache.warehouseId': { $ne: warehouseId } },
    { $push: { stockCache: { warehouseId, quantity: delta } } },
    { session: mongooseSession },
  );
  return push.modifiedCount === 1;
}

/**
 * Armazém CENTRAL da clínica (isDefault + kind 'central').
 * Auto-provisiona "Armazém Geral" (idempotente) e adota o legado criado
 * antes de existir `kind` (isDefault sem kind → 'central').
 */
export async function ensureCentralWarehouse(
  clinicId: string,
): Promise<WarehouseDoc> {
  const existing = await Warehouse.findOne({
    clinicId,
    isDefault: true,
    active: true,
  });
  if (existing) {
    if (existing.kind !== 'central') {
      existing.kind = 'central';
      await existing.save();
    }
    return existing;
  }
  try {
    return await Warehouse.create({
      clinicId,
      name: 'Armazém Geral',
      kind: 'central',
      isDefault: true,
      active: true,
    });
  } catch (err) {
    const isDup =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 11000;
    if (!isDup) throw err;
    const again = await Warehouse.findOne({ clinicId, isDefault: true });
    if (!again) throw err;
    return again;
  }
}

/** Saldo atual de um produto num local, a partir do cache */
export function cacheBalance(
  product: {
    stockCache: { warehouseId: mongoose.Types.ObjectId; quantity: number }[];
  },
  warehouseId: string | mongoose.Types.ObjectId,
): number {
  const wid = String(warehouseId);
  return (
    product.stockCache.find(c => String(c.warehouseId) === wid)?.quantity ?? 0
  );
}
