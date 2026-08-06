// 📄 src/actions/stock.ts
// =============================================================================
// CDC Manager — Actions: Stock (admin + receção)
// -----------------------------------------------------------------------------
// PRODUTOS: criar/editar/ativar (catálogo global; a receção regista — é
// quem recebe as encomendas).
//
// MOVIMENTOS: cada registo é uma TRANSAÇÃO MongoDB que insere o movimento
// no ledger E atualiza o stockCache do produto no mesmo commit:
//   · Saídas: update CONDICIONADO ($elemMatch quantity >= qtd) — se não
//     modificar nada, aborta com "stock insuficiente". É o anti-double-
//     booking do stock: duas baixas concorrentes nunca deixam saldo
//     negativo.
//   · Entradas: $inc na entrada de cache existente ou $push da primeira.
//
// TRANSFERÊNCIA: par transfer-out (origem) + transfer-in (destino) com
// transferGroupId partilhado, tudo na MESMA transação — ou acontece o par
// completo ou nada.
//
// ARMAZÉNS v1: um "Armazém Geral" default por clínica, auto-provisionado
// de forma idempotente no primeiro movimento (sem UI de gestão até haver
// necessidade real de sub-armazéns).
//
// RBAC: admin em tudo; receção via canOperateClinic na clínica do
// movimento (transferências: basta operar a ORIGEM — quem envia regista;
// a entrada no destino é a outra metade do par atómico).
// =============================================================================

'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  createProductSchema,
  updateProductSchema,
  toggleProductActiveSchema,
  stockEntrySchema,
  stockExitSchema,
  stockTransferSchema,
  signedDelta,
} from '@/lib/validations/stock';
import { PRODUCT_UNIT_LABEL, STOCK_MOVEMENT_LABEL } from '@/lib/domain';
import {
  stockProductPublicId,
  signDocumentUpload,
  fetchDocumentAssetInfo,
  destroyDocumentAsset,
  type CloudinaryUploadTicket,
} from '@/lib/cloudinary';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import Warehouse from '@/models/Warehouse';
import User, { canOperateClinic } from '@/models/User';

export type StockActionState =
  | { error: string }
  | { success: true }
  | undefined;

// -----------------------------------------------------------------------------
// Helpers locais (ficheiro 'use server': exports só async — estes não são)
// -----------------------------------------------------------------------------

async function requireOperator(
  clinicId: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (
    !session?.user?.id ||
    !['admin', 'receptionist'].includes(session.user.role ?? '')
  ) {
    return { ok: false, error: 'Sem permissões.' };
  }
  await dbConnect();
  if (clinicId) {
    const user = await User.findById(session.user.id)
      .select('role clinicIds')
      .lean();
    if (!user || !canOperateClinic(user, clinicId)) {
      return { ok: false, error: 'Sem permissões nesta clínica.' };
    }
  }
  return { ok: true, userId: session.user.id };
}

/** Armazém default da clínica — auto-provisiona "Armazém Geral" (idempotente) */
async function ensureDefaultWarehouse(clinicId: string) {
  const existing = await Warehouse.findOne({
    clinicId,
    isDefault: true,
    active: true,
  });
  if (existing) return existing;
  try {
    return await Warehouse.create({
      clinicId,
      name: 'Armazém Geral',
      isDefault: true,
      active: true,
    });
  } catch (err) {
    // Corrida com outro pedido: o índice {clinicId, name} unique rebenta —
    // o armazém já existe, volta a ler
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

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Dados inválidos.';
}

function fmtQty(q: number, unit: string): string {
  return `${q} ${PRODUCT_UNIT_LABEL[unit as keyof typeof PRODUCT_UNIT_LABEL] ?? unit}`;
}

/**
 * Aplica um delta ao stockCache do produto DENTRO da transação.
 * Saídas (delta < 0): condicionado a saldo suficiente — devolve false se
 * não houver (o caller aborta a transação).
 * Entradas (delta > 0): $inc na entrada existente ou $push da primeira.
 */
async function applyCacheDelta(
  productId: string,
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
  // Entrada: tenta a entrada de cache existente…
  const inc = await Product.updateOne(
    { _id: productId, 'stockCache.warehouseId': warehouseId },
    { $inc: { 'stockCache.$.quantity': delta } },
    { session: mongooseSession },
  );
  if (inc.modifiedCount === 1) return true;
  // …ou cria a primeira para este armazém
  const push = await Product.updateOne(
    { _id: productId, 'stockCache.warehouseId': { $ne: warehouseId } },
    { $push: { stockCache: { warehouseId, quantity: delta } } },
    { session: mongooseSession },
  );
  return push.modifiedCount === 1;
}

// -----------------------------------------------------------------------------
// 1. PRODUTOS
// -----------------------------------------------------------------------------

export async function createProductAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const parsed = createProductSchema.safeParse({
      name: formData.get('name'),
      family: formData.get('family'),
      unit: formData.get('unit'),
      minStock: formData.get('minStock'),
      supplierName: formData.get('supplierName'),
      supplierRef: formData.get('supplierRef'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;

    const gate = await requireOperator(null);
    if (!gate.ok) return { error: gate.error };

    const product = await Product.create({
      ...data,
      costCents: 0,
      stockCache: [],
      active: true,
    });

    await logAudit({
      userId: gate.userId,
      action: 'create',
      entityType: 'Product',
      entityId: String(product._id),
      summary: `Produto criado: ${data.name}${data.family ? ` (${data.family})` : ''}`,
    });

    revalidatePath('/admin/stock');
    return { success: true };
  } catch (err) {
    console.error('[stock] createProduct:', err);
    return { error: 'Erro inesperado ao criar o produto.' };
  }
}

export async function updateProductAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const parsed = updateProductSchema.safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      family: formData.get('family'),
      unit: formData.get('unit'),
      minStock: formData.get('minStock'),
      supplierName: formData.get('supplierName'),
      supplierRef: formData.get('supplierRef'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { id, ...fields } = parsed.data;

    const gate = await requireOperator(null);
    if (!gate.ok) return { error: gate.error };

    const doc = await Product.findById(id);
    if (!doc) return { error: 'Produto não encontrado.' };

    const changedFields: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (doc.get(key) !== value) changedFields.push(key);
    }
    doc.set(fields);
    await doc.save();

    await logAudit({
      userId: gate.userId,
      action: 'update',
      entityType: 'Product',
      entityId: String(doc._id),
      summary: `Produto atualizado: ${fields.name}`,
      changedFields,
    });

    revalidatePath('/admin/stock');
    revalidatePath(`/admin/stock/${id}`);
    return { success: true };
  } catch (err) {
    console.error('[stock] updateProduct:', err);
    return { error: 'Erro inesperado ao atualizar o produto.' };
  }
}

export async function toggleProductActiveAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const parsed = toggleProductActiveSchema.safeParse({
      id: formData.get('id'),
      active: formData.get('active'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { id, active } = parsed.data;

    const gate = await requireOperator(null);
    if (!gate.ok) return { error: gate.error };

    const doc = await Product.findByIdAndUpdate(
      id,
      { active },
      { returnDocument: 'after' },
    );
    if (!doc) return { error: 'Produto não encontrado.' };

    await logAudit({
      userId: gate.userId,
      action: active ? 'update' : 'delete',
      entityType: 'Product',
      entityId: String(doc._id),
      summary: `Produto ${active ? 'reativado' : 'desativado'}: ${doc.name}`,
      changedFields: ['active'],
    });

    revalidatePath('/admin/stock');
    revalidatePath(`/admin/stock/${id}`);
    return { success: true };
  } catch (err) {
    console.error('[stock] toggleProductActive:', err);
    return { error: 'Erro inesperado ao alterar o estado do produto.' };
  }
}

// -----------------------------------------------------------------------------
// 1b. FOTO DO PRODUTO (opcional) — mesmo fluxo em 3 passos dos documentos
//     clínicos (lib/cloudinary.ts): ticket → upload direto → confirmação
//     verificada. Aqui não é dado de saúde, mas mantém-se 'authenticated'
//     — UM só fluxo de assets no projeto. Substituir = re-upload para o
//     MESMO public_id. Remover apaga o asset (produto não é registo
//     clínico — o never-delete aplica-se ao ledger, não à foto).
// -----------------------------------------------------------------------------

export async function createProductImageTicketAction(input: {
  productId: string;
}): Promise<
  { ok: true; ticket: CloudinaryUploadTicket } | { ok: false; error: string }
> {
  const gate = await requireOperator(null);
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!/^[0-9a-fA-F]{24}$/.test(input.productId)) {
    return { ok: false, error: 'Produto inválido.' };
  }
  const product = await Product.findById(input.productId).select('_id').lean();
  if (!product) return { ok: false, error: 'Produto não encontrado.' };

  try {
    // Foto de catálogo, não clínica: o Cloudinary encolhe NA RECEÇÃO e
    // guarda só o resultado (~200 KB) — foto de telemóvel entra direto
    const ticket = signDocumentUpload(stockProductPublicId(input.productId), {
      incomingTransformation: 'c_limit,w_1600,q_auto',
    });
    return { ok: true, ticket };
  } catch (err) {
    console.error('[stock] assinatura de upload de foto falhou:', err);
    return {
      ok: false,
      error: 'Cloudinary não configurado — verifique as variáveis de ambiente.',
    };
  }
}

export async function setProductImageAction(input: {
  productId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireOperator(null);
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!/^[0-9a-fA-F]{24}$/.test(input.productId)) {
    return { ok: false, error: 'Produto inválido.' };
  }
  const product = await Product.findById(input.productId);
  if (!product) return { ok: false, error: 'Produto não encontrado.' };

  const publicId = stockProductPublicId(input.productId);
  const asset = await fetchDocumentAssetInfo(publicId);
  if (!asset) {
    return { ok: false, error: 'Upload não encontrado — tente novamente.' };
  }
  if (asset.resourceType !== 'image') {
    // Ficheiro não-imagem: apagar o asset órfão e recusar
    await destroyDocumentAsset(publicId, asset.resourceType);
    return { ok: false, error: 'A foto tem de ser uma imagem (JPEG/PNG).' };
  }

  product.imagePublicId = publicId;
  await product.save();

  await logAudit({
    userId: gate.userId,
    action: 'update',
    entityType: 'Product',
    entityId: String(product._id),
    summary: `Foto do produto atualizada: ${product.name}`,
    changedFields: ['imagePublicId'],
  });

  revalidatePath('/admin/stock');
  revalidatePath(`/admin/stock/${input.productId}`);
  return { ok: true };
}

export async function removeProductImageAction(input: {
  productId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireOperator(null);
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!/^[0-9a-fA-F]{24}$/.test(input.productId)) {
    return { ok: false, error: 'Produto inválido.' };
  }
  const product = await Product.findById(input.productId);
  if (!product || !product.imagePublicId) {
    return { ok: false, error: 'Produto sem foto.' };
  }

  // Best-effort: se o destroy falhar, a referência sai na mesma (o asset
  // órfão pode limpar-se depois na Media Library)
  await destroyDocumentAsset(product.imagePublicId, 'image');
  product.imagePublicId = null;
  await product.save();

  await logAudit({
    userId: gate.userId,
    action: 'update',
    entityType: 'Product',
    entityId: String(product._id),
    summary: `Foto do produto removida: ${product.name}`,
    changedFields: ['imagePublicId'],
  });

  revalidatePath('/admin/stock');
  revalidatePath(`/admin/stock/${input.productId}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// 2. MOVIMENTO MANUAL (entrada ou saída no armazém default da clínica)
// -----------------------------------------------------------------------------

async function registerMovement(
  kind: 'entry' | 'exit',
  formData: FormData,
): Promise<StockActionState> {
  try {
    const schema = kind === 'entry' ? stockEntrySchema : stockExitSchema;
    const parsed = schema.safeParse({
      productId: formData.get('productId'),
      clinicId: formData.get('clinicId'),
      quantity: formData.get('quantity'),
      type: formData.get('type'),
      note: formData.get('note'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;

    const gate = await requireOperator(data.clinicId);
    if (!gate.ok) return { error: gate.error };

    const product = await Product.findById(data.productId).lean();
    if (!product) return { error: 'Produto não encontrado.' };
    // Entradas só em produtos ativos; saídas permitem esgotar inativos
    if (kind === 'entry' && !product.active) {
      return { error: 'Produto inativo — reative-o antes de dar entrada.' };
    }

    const warehouse = await ensureDefaultWarehouse(data.clinicId);
    const delta = signedDelta(data.type, data.quantity);

    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        const applied = await applyCacheDelta(
          data.productId,
          warehouse._id,
          delta,
          mongooseSession,
        );
        if (!applied) {
          const current =
            product.stockCache.find(
              c => String(c.warehouseId) === String(warehouse._id),
            )?.quantity ?? 0;
          throw new Error(
            `Stock insuficiente — saldo atual nesta clínica: ${fmtQty(current, product.unit)}.`,
          );
        }
        await StockMovement.create(
          [
            {
              productId: data.productId,
              warehouseId: warehouse._id,
              type: data.type,
              quantity: data.quantity,
              unitCostCents: 0,
              createdByUserId: gate.userId,
              note: data.note,
            },
          ],
          { session: mongooseSession },
        );
      });
    } catch (txErr) {
      return {
        error:
          txErr instanceof Error
            ? txErr.message
            : 'Erro ao registar o movimento.',
      };
    } finally {
      await mongooseSession.endSession();
    }

    await logAudit({
      userId: gate.userId,
      action: 'create',
      entityType: 'StockMovement',
      entityId: data.productId,
      clinicId: data.clinicId,
      summary: `${STOCK_MOVEMENT_LABEL[data.type]}: ${product.name} — ${fmtQty(data.quantity, product.unit)}`,
    });

    revalidatePath('/admin/stock');
    revalidatePath(`/admin/stock/${data.productId}`);
    return { success: true };
  } catch (err) {
    console.error(`[stock] ${kind}:`, err);
    return { error: 'Erro inesperado ao registar o movimento.' };
  }
}

export async function registerStockEntryAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  return registerMovement('entry', formData);
}

export async function registerStockExitAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  return registerMovement('exit', formData);
}

// -----------------------------------------------------------------------------
// 3. TRANSFERÊNCIA entre clínicas (par atómico)
// -----------------------------------------------------------------------------

export async function transferStockAction(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const parsed = stockTransferSchema.safeParse({
      productId: formData.get('productId'),
      fromClinicId: formData.get('fromClinicId'),
      toClinicId: formData.get('toClinicId'),
      quantity: formData.get('quantity'),
      note: formData.get('note'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;

    // Quem envia regista: RBAC na clínica de ORIGEM
    const gate = await requireOperator(data.fromClinicId);
    if (!gate.ok) return { error: gate.error };

    const product = await Product.findById(data.productId).lean();
    if (!product) return { error: 'Produto não encontrado.' };

    const [fromWh, toWh] = await Promise.all([
      ensureDefaultWarehouse(data.fromClinicId),
      ensureDefaultWarehouse(data.toClinicId),
    ]);
    const transferGroupId = new mongoose.Types.ObjectId();

    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        // Saída na origem — condicionada a saldo suficiente
        const outOk = await applyCacheDelta(
          data.productId,
          fromWh._id,
          -data.quantity,
          mongooseSession,
        );
        if (!outOk) {
          const current =
            product.stockCache.find(
              c => String(c.warehouseId) === String(fromWh._id),
            )?.quantity ?? 0;
          throw new Error(
            `Stock insuficiente na origem — saldo atual: ${fmtQty(current, product.unit)}.`,
          );
        }
        // Entrada no destino
        const inOk = await applyCacheDelta(
          data.productId,
          toWh._id,
          data.quantity,
          mongooseSession,
        );
        if (!inOk) throw new Error('Erro ao registar a entrada no destino.');

        // O par no ledger, ligado pelo transferGroupId
        await StockMovement.create(
          [
            {
              productId: data.productId,
              warehouseId: fromWh._id,
              type: 'transfer-out',
              quantity: data.quantity,
              unitCostCents: 0,
              transferGroupId,
              createdByUserId: gate.userId,
              note: data.note,
            },
            {
              productId: data.productId,
              warehouseId: toWh._id,
              type: 'transfer-in',
              quantity: data.quantity,
              unitCostCents: 0,
              transferGroupId,
              createdByUserId: gate.userId,
              note: data.note,
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
            : 'Erro ao registar a transferência.',
      };
    } finally {
      await mongooseSession.endSession();
    }

    await logAudit({
      userId: gate.userId,
      action: 'create',
      entityType: 'StockMovement',
      entityId: data.productId,
      clinicId: data.fromClinicId,
      summary: `Transferência: ${product.name} — ${fmtQty(data.quantity, product.unit)} entre clínicas`,
    });

    revalidatePath('/admin/stock');
    revalidatePath(`/admin/stock/${data.productId}`);
    return { success: true };
  } catch (err) {
    console.error('[stock] transfer:', err);
    return { error: 'Erro inesperado ao registar a transferência.' };
  }
}
