// 📄 src/actions/stock-locations.ts
// =============================================================================
// CDC Manager — Actions: Stock por LOCAL (set/2026, pedido da Isabel)
// -----------------------------------------------------------------------------
// O modelo em dois níveis:
//   Fornecedor ─entrada─▶ ARMAZÉM CENTRAL ─requisição─▶ LOCAL (gabinete…)
//                          (actions/stock.ts)          (este ficheiro)
//
//   1. LOCAIS       criar/editar/desativar Warehouse com kind ≠ 'central'
//   2. REQUISIÇÃO   central → local (par transfer-out/transfer-in, atómico,
//                   multi-linha). É a "baixa" do armazém que a Isabel pediu
//   3. DEVOLUÇÃO    local → central (material não usado volta)
//   4. NÍVEIS       min/max por produto × local (par level)
//   5. CONTAGEM     abrir (congela o esperado) → fechar (gera consumption /
//                   adjustment-in por diferença, numa transação). É AQUI que o
//                   consumo do gabinete se apura — nunca pela consulta.
//
// RBAC: por decisão da Isabel (set/2026) só o ADMINISTRADOR regista
// requisições e contagens. A receção pode ver. Mudar aqui quando a
// operação passar a assistentes.
// =============================================================================

'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  upsertLocationSchema,
  toggleLocationActiveSchema,
  requisitionSchema,
  returnToCentralSchema,
  stockLevelSchema,
  openCountSchema,
  closeCountSchema,
  countLineDelta,
} from '@/lib/validations/stock';
import {
  applyCacheDelta,
  ensureCentralWarehouse,
  cacheBalance,
  fmtQty,
} from '@/lib/stock-ledger';
import { WAREHOUSE_KIND_LABEL } from '@/lib/domain';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import StockLevel from '@/models/StockLevel';
import StockCount from '@/models/StockCount';
import Warehouse from '@/models/Warehouse';

export type StockLocationActionState =
  | { error: string }
  | { success: true; id?: string }
  | undefined;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    return { ok: false, error: 'Só o administrador pode fazer esta operação.' };
  }
  await dbConnect();
  return { ok: true, userId: session.user.id };
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Dados inválidos.';
}

function revalidateStock(warehouseId?: string) {
  revalidatePath('/admin/stock');
  revalidatePath('/admin/stock/locais');
  if (warehouseId) revalidatePath(`/admin/stock/locais/${warehouseId}`);
}

function parseLines(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string') return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// 1. LOCAIS
// -----------------------------------------------------------------------------

export async function upsertLocationAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = upsertLocationSchema.safeParse({
      id: formData.get('id'),
      clinicId: formData.get('clinicId'),
      name: formData.get('name'),
      kind: formData.get('kind'),
      description: formData.get('description'),
      responsibleUserId: formData.get('responsibleUserId'),
      sortOrder: formData.get('sortOrder'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { id, ...data } = parsed.data;

    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    if (id) {
      const existing = await Warehouse.findById(id);
      if (!existing) return { error: 'Local não encontrado.' };
      if (existing.kind === 'central' || existing.isDefault) {
        return { error: 'O armazém central não pode ser editado aqui.' };
      }
      // Clínica é imutável: um local não muda de edifício
      existing.name = data.name;
      existing.kind = data.kind;
      existing.description = data.description;
      existing.responsibleUserId = data.responsibleUserId
        ? new mongoose.Types.ObjectId(data.responsibleUserId)
        : null;
      existing.sortOrder = data.sortOrder;
      try {
        await existing.save();
      } catch (err) {
        if (isDup(err)) return { error: 'Já existe um local com esse nome.' };
        throw err;
      }
      await logAudit({
        userId: gate.userId,
        action: 'update',
        entityType: 'Warehouse',
        entityId: id,
        clinicId: String(existing.clinicId),
        summary: `Local de stock editado: ${data.name}`,
      });
      revalidateStock(id);
      return { success: true, id };
    }

    // Garantir que a clínica já tem central antes de criar sub-locais
    await ensureCentralWarehouse(data.clinicId);
    let created;
    try {
      created = await Warehouse.create({
        clinicId: data.clinicId,
        name: data.name,
        kind: data.kind,
        description: data.description,
        responsibleUserId: data.responsibleUserId,
        sortOrder: data.sortOrder,
        isDefault: false,
        active: true,
      });
    } catch (err) {
      if (isDup(err)) return { error: 'Já existe um local com esse nome.' };
      throw err;
    }
    await logAudit({
      userId: gate.userId,
      action: 'create',
      entityType: 'Warehouse',
      entityId: String(created._id),
      clinicId: data.clinicId,
      summary: `Local de stock criado: ${data.name} (${WAREHOUSE_KIND_LABEL[data.kind]})`,
    });
    revalidateStock();
    return { success: true, id: String(created._id) };
  } catch (err) {
    console.error('[stock-locations] upsert:', err);
    return { error: 'Erro inesperado ao gravar o local.' };
  }
}

function isDup(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

export async function toggleLocationActiveAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = toggleLocationActiveSchema.safeParse({
      id: formData.get('id'),
      active: formData.get('active'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    const wh = await Warehouse.findById(parsed.data.id);
    if (!wh) return { error: 'Local não encontrado.' };
    if (wh.isDefault)
      return { error: 'O armazém central não pode ser desativado.' };

    if (!parsed.data.active) {
      // Never-delete: só se desativa um local VAZIO — o stock tem de voltar
      // ao central primeiro (devolução), senão "desaparece" do inventário
      const withStock = await Product.countDocuments({
        stockCache: {
          $elemMatch: { warehouseId: wh._id, quantity: { $gt: 0 } },
        },
      });
      if (withStock > 0) {
        return {
          error: `Este local ainda tem ${withStock} produto(s) com saldo — devolva-os ao armazém central antes de o desativar.`,
        };
      }
      const openCount = await StockCount.exists({
        warehouseId: wh._id,
        status: 'open',
      });
      if (openCount)
        return { error: 'Feche a contagem aberta antes de desativar.' };
    }
    wh.active = parsed.data.active;
    await wh.save();
    await logAudit({
      userId: gate.userId,
      action: 'update',
      entityType: 'Warehouse',
      entityId: String(wh._id),
      clinicId: String(wh.clinicId),
      summary: `Local ${parsed.data.active ? 'reativado' : 'desativado'}: ${wh.name}`,
      changedFields: ['active'],
    });
    revalidateStock(String(wh._id));
    return { success: true };
  } catch (err) {
    console.error('[stock-locations] toggle:', err);
    return { error: 'Erro inesperado.' };
  }
}

// -----------------------------------------------------------------------------
// 2. REQUISIÇÃO central → local (multi-linha, atómica)
// -----------------------------------------------------------------------------

export async function requisitionAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = requisitionSchema.safeParse({
      toWarehouseId: formData.get('toWarehouseId'),
      lines: parseLines(formData.get('lines')),
      note: formData.get('note'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;

    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    const to = await Warehouse.findById(data.toWarehouseId).lean();
    if (!to || !to.active) return { error: 'Local de destino inválido.' };
    if (to.isDefault)
      return { error: 'O destino tem de ser um local, não o armazém central.' };
    const central = await ensureCentralWarehouse(String(to.clinicId));

    // Agregar linhas repetidas do mesmo produto
    const qtyByProduct = new Map<string, number>();
    for (const l of data.lines) {
      qtyByProduct.set(
        l.productId,
        (qtyByProduct.get(l.productId) ?? 0) + l.quantity,
      );
    }
    const products = await Product.find({
      _id: { $in: [...qtyByProduct.keys()] },
    })
      .select('name unit costCents stockCache active')
      .lean();
    if (products.length !== qtyByProduct.size)
      return { error: 'Produto não encontrado.' };

    const transferGroupId = new mongoose.Types.ObjectId();
    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        for (const p of products) {
          const qty = qtyByProduct.get(String(p._id))!;
          const outOk = await applyCacheDelta(
            p._id,
            central._id,
            -qty,
            mongooseSession,
          );
          if (!outOk) {
            throw new Error(
              `Stock insuficiente no armazém central para "${p.name}" — saldo: ${fmtQty(cacheBalance(p, central._id), p.unit)}.`,
            );
          }
          const inOk = await applyCacheDelta(
            p._id,
            to._id,
            qty,
            mongooseSession,
          );
          if (!inOk)
            throw new Error(`Erro ao registar a entrada em ${to.name}.`);
          await StockMovement.create(
            [
              {
                productId: p._id,
                warehouseId: central._id,
                type: 'transfer-out',
                quantity: qty,
                unitCostCents: p.costCents ?? 0,
                transferGroupId,
                createdByUserId: gate.userId,
                note: data.note ?? `Requisição → ${to.name}`,
              },
              {
                productId: p._id,
                warehouseId: to._id,
                type: 'transfer-in',
                quantity: qty,
                unitCostCents: p.costCents ?? 0,
                transferGroupId,
                createdByUserId: gate.userId,
                note: data.note ?? `Requisição ← ${central.name}`,
              },
            ],
            { session: mongooseSession, ordered: true },
          );
        }
      });
    } catch (txErr) {
      return {
        error:
          txErr instanceof Error
            ? txErr.message
            : 'Erro ao registar a requisição.',
      };
    } finally {
      await mongooseSession.endSession();
    }

    await logAudit({
      userId: gate.userId,
      action: 'create',
      entityType: 'StockMovement',
      entityId: String(transferGroupId),
      clinicId: String(to.clinicId),
      summary: `Requisição para ${to.name}: ${products.length} produto(s)`,
    });
    revalidateStock(String(to._id));
    return { success: true, id: String(transferGroupId) };
  } catch (err) {
    console.error('[stock-locations] requisition:', err);
    return { error: 'Erro inesperado ao registar a requisição.' };
  }
}

// -----------------------------------------------------------------------------
// 3. DEVOLUÇÃO local → central
// -----------------------------------------------------------------------------

export async function returnToCentralAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = returnToCentralSchema.safeParse({
      fromWarehouseId: formData.get('fromWarehouseId'),
      productId: formData.get('productId'),
      quantity: formData.get('quantity'),
      note: formData.get('note'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;
    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    const from = await Warehouse.findById(data.fromWarehouseId).lean();
    if (!from || from.isDefault) return { error: 'Local de origem inválido.' };
    const central = await ensureCentralWarehouse(String(from.clinicId));
    const product = await Product.findById(data.productId).lean();
    if (!product) return { error: 'Produto não encontrado.' };

    const transferGroupId = new mongoose.Types.ObjectId();
    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        const outOk = await applyCacheDelta(
          product._id,
          from._id,
          -data.quantity,
          mongooseSession,
        );
        if (!outOk) {
          throw new Error(
            `Stock insuficiente em ${from.name} — saldo: ${fmtQty(cacheBalance(product, from._id), product.unit)}.`,
          );
        }
        await applyCacheDelta(
          product._id,
          central._id,
          data.quantity,
          mongooseSession,
        );
        await StockMovement.create(
          [
            {
              productId: product._id,
              warehouseId: from._id,
              type: 'transfer-out',
              quantity: data.quantity,
              unitCostCents: product.costCents ?? 0,
              transferGroupId,
              createdByUserId: gate.userId,
              note: data.note ?? `Devolução → ${central.name}`,
            },
            {
              productId: product._id,
              warehouseId: central._id,
              type: 'transfer-in',
              quantity: data.quantity,
              unitCostCents: product.costCents ?? 0,
              transferGroupId,
              createdByUserId: gate.userId,
              note: data.note ?? `Devolução ← ${from.name}`,
            },
          ],
          { session: mongooseSession, ordered: true },
        );
      });
    } catch (txErr) {
      return {
        error:
          txErr instanceof Error
            ? txErr.message
            : 'Erro ao registar a devolução.',
      };
    } finally {
      await mongooseSession.endSession();
    }

    await logAudit({
      userId: gate.userId,
      action: 'create',
      entityType: 'StockMovement',
      entityId: String(transferGroupId),
      clinicId: String(from.clinicId),
      summary: `Devolução ao central de ${from.name}: ${product.name} — ${fmtQty(data.quantity, product.unit)}`,
    });
    revalidateStock(String(from._id));
    return { success: true };
  } catch (err) {
    console.error('[stock-locations] return:', err);
    return { error: 'Erro inesperado ao registar a devolução.' };
  }
}

// -----------------------------------------------------------------------------
// 4. NÍVEIS min/max por produto × local
// -----------------------------------------------------------------------------

export async function setStockLevelAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = stockLevelSchema.safeParse({
      productId: formData.get('productId'),
      warehouseId: formData.get('warehouseId'),
      min: formData.get('min'),
      max: formData.get('max'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;
    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    await StockLevel.updateOne(
      { productId: data.productId, warehouseId: data.warehouseId },
      {
        $set: { min: data.min, max: data.max, updatedByUserId: gate.userId },
        $setOnInsert: {
          productId: data.productId,
          warehouseId: data.warehouseId,
        },
      },
      { upsert: true },
    );
    revalidateStock(data.warehouseId);
    return { success: true };
  } catch (err) {
    console.error('[stock-locations] level:', err);
    return { error: 'Erro inesperado ao gravar o nível.' };
  }
}

// -----------------------------------------------------------------------------
// 5. CONTAGEM — abrir / fechar
// -----------------------------------------------------------------------------

/**
 * Abre a contagem do local: congela o saldo esperado de cada produto que
 * tem cache neste local OU nível definido (mesmo com saldo 0 — se está
 * parametrizado para o gabinete, conta-se). Uma aberta por local.
 */
export async function openCountAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = openCountSchema.safeParse({
      warehouseId: formData.get('warehouseId'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    const wh = await Warehouse.findById(parsed.data.warehouseId).lean();
    if (!wh || !wh.active) return { error: 'Local inválido.' };

    const already = await StockCount.findOne({
      warehouseId: wh._id,
      status: 'open',
    })
      .select('_id')
      .lean();
    if (already) return { success: true, id: String(already._id) };

    const levels = await StockLevel.find({ warehouseId: wh._id })
      .select('productId')
      .lean();
    const products = await Product.find({
      $or: [
        { 'stockCache.warehouseId': wh._id },
        { _id: { $in: levels.map(l => l.productId) } },
      ],
    })
      .select('name unit costCents stockCache')
      .sort({ name: 1 })
      .lean();
    if (products.length === 0) {
      return {
        error:
          'Este local ainda não tem produtos — faça primeiro uma requisição.',
      };
    }

    const count = await StockCount.create({
      clinicId: wh.clinicId,
      warehouseId: wh._id,
      status: 'open',
      openedByUserId: gate.userId,
      lines: products.map(p => ({
        productId: p._id,
        nameSnapshot: p.name,
        unitSnapshot: p.unit,
        expected: cacheBalance(p, wh._id),
        counted: null,
        unitCostCents: p.costCents ?? 0,
      })),
    });
    revalidateStock(String(wh._id));
    return { success: true, id: String(count._id) };
  } catch (err) {
    if (isDup(err))
      return { error: 'Já existe uma contagem aberta neste local.' };
    console.error('[stock-locations] openCount:', err);
    return { error: 'Erro inesperado ao abrir a contagem.' };
  }
}

/**
 * Fecha a contagem: para cada linha contada gera o movimento da diferença
 * (falta → consumption, sobra → adjustment-in) numa transação e atualiza
 * Warehouse.lastCountAt. Linhas não contadas são removidas (não se assume
 * nada). O saldo de referência é o `expected` congelado na abertura —
 * requisições feitas DURANTE a contagem são somadas ao esperado.
 */
export async function closeCountAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const parsed = closeCountSchema.safeParse({
      countId: formData.get('countId'),
      counted: parseLines(formData.get('counted')),
      note: formData.get('note'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;
    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };

    const count = await StockCount.findById(data.countId);
    if (!count || count.status !== 'open')
      return { error: 'Contagem não está aberta.' };
    const wh = await Warehouse.findById(count.warehouseId).lean();
    if (!wh) return { error: 'Local inválido.' };

    const countedById = new Map(
      data.counted.map(c => [c.productId, c.counted]),
    );

    // Movimentos ocorridos no local desde a abertura (requisições, devoluções)
    // ajustam o esperado — senão uma requisição feita a meio apareceria
    // como "sobra"
    const since = await StockMovement.aggregate<{
      _id: mongoose.Types.ObjectId;
      delta: number;
    }>([
      {
        $match: {
          warehouseId: wh._id,
          createdAt: { $gt: count.createdAt },
          type: {
            $in: [
              'transfer-in',
              'transfer-out',
              'purchase',
              'adjustment-in',
              'adjustment-out',
              'waste',
              'consumption',
            ],
          },
        },
      },
      {
        $group: {
          _id: '$productId',
          delta: {
            $sum: {
              $cond: [
                {
                  $in: ['$type', ['transfer-in', 'purchase', 'adjustment-in']],
                },
                '$quantity',
                { $multiply: ['$quantity', -1] },
              ],
            },
          },
        },
      },
    ]);
    const deltaSince = new Map(since.map(s => [String(s._id), s.delta]));

    const lines = count.lines.filter(l => countedById.has(String(l.productId)));
    if (lines.length === 0) return { error: 'Conte pelo menos um produto.' };

    let consumedValueCents = 0;
    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        for (const line of lines) {
          const pid = String(line.productId);
          const counted = countedById.get(pid)!;
          const expected = line.expected + (deltaSince.get(pid) ?? 0);
          line.expected = expected;
          line.counted = counted;
          const mv = countLineDelta(expected, counted);
          if (!mv) continue;

          if (mv.type === 'consumption') {
            // Saída condicionada: se o cache já estiver abaixo (não devia),
            // regista na mesma — a realidade física vence o registo
            const ok = await applyCacheDelta(
              line.productId,
              wh._id,
              -mv.quantity,
              mongooseSession,
            );
            if (!ok) {
              await Product.updateOne(
                { _id: line.productId, 'stockCache.warehouseId': wh._id },
                { $set: { 'stockCache.$.quantity': counted } },
                { session: mongooseSession },
              );
            }
            consumedValueCents += Math.round(
              mv.quantity * (line.unitCostCents ?? 0),
            );
          } else {
            await applyCacheDelta(
              line.productId,
              wh._id,
              mv.quantity,
              mongooseSession,
            );
          }
          await StockMovement.create(
            [
              {
                productId: line.productId,
                warehouseId: wh._id,
                type: mv.type,
                quantity: mv.quantity,
                unitCostCents: line.unitCostCents ?? 0,
                countId: count._id,
                createdByUserId: gate.userId,
                note:
                  mv.type === 'consumption'
                    ? `Consumo apurado em contagem (${wh.name}): esperado ${expected}, contado ${counted}`
                    : `Sobra em contagem (${wh.name}): esperado ${expected}, contado ${counted}`,
              },
            ],
            { session: mongooseSession },
          );
        }
        // Remover linhas não contadas (DocumentArray: pull em vez de reatribuir)
        for (const l of [...count.lines]) {
          if (!countedById.has(String(l.productId))) count.lines.pull(l);
        }
        count.status = 'closed';
        count.closedAt = new Date();
        count.closedByUserId = new mongoose.Types.ObjectId(gate.userId);
        count.consumedValueCents = consumedValueCents;
        count.note = data.note;
        await count.save({ session: mongooseSession });
        await Warehouse.updateOne(
          { _id: wh._id },
          { $set: { lastCountAt: count.closedAt } },
          { session: mongooseSession },
        );
      });
    } catch (txErr) {
      return {
        error:
          txErr instanceof Error ? txErr.message : 'Erro ao fechar a contagem.',
      };
    } finally {
      await mongooseSession.endSession();
    }

    await logAudit({
      userId: gate.userId,
      action: 'update',
      entityType: 'StockCount',
      entityId: String(count._id),
      clinicId: String(count.clinicId),
      summary: `Contagem fechada em ${wh.name}: ${lines.length} produto(s), consumo ${(consumedValueCents / 100).toFixed(2)} €`,
    });
    revalidateStock(String(wh._id));
    return { success: true, id: String(count._id) };
  } catch (err) {
    console.error('[stock-locations] closeCount:', err);
    return { error: 'Erro inesperado ao fechar a contagem.' };
  }
}

/** Cancela uma contagem aberta sem gerar movimentos (nada foi registado) */
export async function discardCountAction(
  _prev: StockLocationActionState,
  formData: FormData,
): Promise<StockLocationActionState> {
  try {
    const countId = String(formData.get('countId') ?? '');
    if (!mongoose.isValidObjectId(countId))
      return { error: 'Contagem inválida.' };
    const gate = await requireAdmin();
    if (!gate.ok) return { error: gate.error };
    const count = await StockCount.findOne({ _id: countId, status: 'open' });
    if (!count) return { error: 'Contagem não está aberta.' };
    // Aberta e sem efeitos no ledger: apagar é seguro (exceção documentada
    // ao never-delete — só existia como rascunho)
    await StockCount.deleteOne({ _id: count._id });
    revalidateStock(String(count.warehouseId));
    return { success: true };
  } catch (err) {
    console.error('[stock-locations] discardCount:', err);
    return { error: 'Erro inesperado.' };
  }
}
