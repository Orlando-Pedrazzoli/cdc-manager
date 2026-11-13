// 📄 src/actions/product-sales.ts
// =============================================================================
// CDC Manager — Server Actions: produtos e venda ao balcão (7.ª ronda/B2b)
// -----------------------------------------------------------------------------
//   Catálogo (só a GESTÃO)
//     · saveSaleProductAction     — criar/editar nome, PVP com IVA, taxa de IVA
//     · setSaleProductActiveAction — tirar de venda / voltar a pôr
//   Vendas
//     · createProductSaleAction — receção e gestão, na clínica onde operam;
//       sem médico, fora das comissões. Preço e IVA vêm do catálogo no
//       servidor (nunca do browser).
//     · setSaleFiscalDocumentAction — anotar o n.º da fatura passada
//     · voidProductSaleAction — anular com motivo (só a gestão)
// Tudo fica no registo de auditoria. Contas em lib/product-sales.ts.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/domain';
import {
  SALE_MAX_LINES,
  SALE_MAX_QTY,
  formatEuro,
  isVatRate,
  parsePriceToCents,
  saleLineTotals,
} from '@/lib/product-sales';
import Patient from '@/models/Patient';
import ProductSale from '@/models/ProductSale';
import SaleProduct from '@/models/SaleProduct';
import User, { canOperateClinic } from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export type ProductActionState =
  | { success: true; message: string }
  | { error: string }
  | undefined;

async function requireUser(roles: readonly string[]) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !roles.includes(role)) {
    throw new Error('Sem permissões.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status clinicIds')
    .lean();
  if (!user || user.status !== 'active' || user.role !== role) {
    throw new Error(
      'Conta inativa ou permissões alteradas. Inicie sessão novamente.',
    );
  }
  return { id: session.user.id, user };
}

function refresh() {
  revalidatePath('/admin/produtos');
}

// -----------------------------------------------------------------------------
// CATÁLOGO
// -----------------------------------------------------------------------------
export async function saveSaleProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  let me;
  try {
    me = await requireUser(['admin']);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ');
  const priceCents = parsePriceToCents(String(formData.get('price') ?? ''));
  const vatRate = Number(formData.get('vatRate'));

  if (name.length < 2) return { error: 'Indique o nome do produto.' };
  if (name.length > 120) return { error: 'Nome demasiado longo (máx. 120).' };
  if (priceCents == null) {
    return { error: 'Preço inválido. Exemplo: 12,50' };
  }
  if (!isVatRate(vatRate)) return { error: 'Taxa de IVA inválida.' };

  if (id) {
    if (!OBJECT_ID.test(id)) return { error: 'Produto inválido.' };
    const before = await SaleProduct.findById(id).select('name priceCents vatRate').lean();
    if (!before) return { error: 'Produto não encontrado.' };
    await SaleProduct.updateOne({ _id: id }, { $set: { name, priceCents, vatRate } });
    await logAudit({
      userId: me.id,
      action: 'update',
      entityType: 'SaleProduct',
      entityId: id,
      summary: `Produto de venda atualizado: ${name} — ${formatEuro(priceCents)} (IVA ${vatRate}%); antes ${formatEuro(before.priceCents)} (IVA ${before.vatRate}%)`,
      changedFields: ['name', 'priceCents', 'vatRate'],
    });
    refresh();
    return { success: true, message: 'Produto atualizado.' };
  }

  const created = await SaleProduct.create({
    name,
    priceCents,
    vatRate,
    createdByUserId: me.id,
  });
  await logAudit({
    userId: me.id,
    action: 'create',
    entityType: 'SaleProduct',
    entityId: String(created._id),
    summary: `Produto de venda criado: ${name} — ${formatEuro(priceCents)} (IVA ${vatRate}%)`,
    changedFields: [],
  });
  refresh();
  return { success: true, message: 'Produto criado.' };
}

export async function setSaleProductActiveAction(
  productId: string,
  active: boolean,
): Promise<{ error?: string }> {
  let me;
  try {
    me = await requireUser(['admin']);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!OBJECT_ID.test(productId)) return { error: 'Produto inválido.' };
  const res = await SaleProduct.updateOne({ _id: productId }, { $set: { active } });
  if (res.matchedCount === 0) return { error: 'Produto não encontrado.' };
  await logAudit({
    userId: me.id,
    action: 'update',
    entityType: 'SaleProduct',
    entityId: productId,
    summary: active ? 'Produto de venda reativado' : 'Produto de venda retirado de venda',
    changedFields: ['active'],
  });
  refresh();
  return {};
}

// -----------------------------------------------------------------------------
// VENDA AO BALCÃO
// -----------------------------------------------------------------------------
export async function createProductSaleAction(input: {
  clinicId: string;
  patientId: string | null;
  paymentMethod: string;
  note?: string;
  lines: { productId: string; quantity: number }[];
}): Promise<{ success: true; totalCents: number } | { error: string }> {
  let me;
  try {
    me = await requireUser(['admin', 'receptionist']);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!OBJECT_ID.test(input.clinicId) || !canOperateClinic(me.user, input.clinicId)) {
    return { error: 'Sem permissões para esta clínica.' };
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.paymentMethod)) {
    return { error: 'Escolha o meio de pagamento.' };
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { error: 'Acrescente pelo menos um produto.' };
  }
  if (input.lines.length > SALE_MAX_LINES) {
    return { error: `Máximo de ${SALE_MAX_LINES} produtos por venda.` };
  }
  for (const l of input.lines) {
    if (
      !OBJECT_ID.test(l.productId) ||
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > SALE_MAX_QTY
    ) {
      return { error: 'Quantidade inválida.' };
    }
  }
  const note = (input.note ?? '').trim();
  if (note.length > 300) return { error: 'Observação demasiado longa (máx. 300).' };

  let patientId: string | null = null;
  if (input.patientId) {
    if (!OBJECT_ID.test(input.patientId)) return { error: 'Paciente inválido.' };
    const patient = await Patient.findById(input.patientId).select('status').lean();
    if (!patient || patient.status === 'anonymized') {
      return { error: 'Paciente não encontrado.' };
    }
    patientId = input.patientId;
  }

  // Preço e IVA SEMPRE do catálogo, lidos agora no servidor
  const ids = [...new Set(input.lines.map(l => l.productId))];
  const products = await SaleProduct.find({ _id: { $in: ids }, active: true })
    .select('name priceCents vatRate')
    .lean();
  const byId = new Map(products.map(p => [String(p._id), p]));
  const lines = [];
  for (const l of input.lines) {
    const p = byId.get(l.productId);
    if (!p) return { error: 'Um dos produtos já não está à venda. Atualize a página.' };
    const t = saleLineTotals({
      unitPriceCents: p.priceCents,
      quantity: l.quantity,
      vatRate: p.vatRate,
    });
    lines.push({
      productId: p._id,
      name: p.name,
      quantity: l.quantity,
      unitPriceCents: p.priceCents,
      vatRate: p.vatRate,
      totalCents: t.totalCents,
      vatCents: t.vatCents,
    });
  }
  const totalCents = lines.reduce((a, l) => a + l.totalCents, 0);
  const vatCents = lines.reduce((a, l) => a + l.vatCents, 0);

  const sale = await ProductSale.create({
    clinicId: input.clinicId,
    patientId,
    lines,
    totalCents,
    vatCents,
    paymentMethod: input.paymentMethod as PaymentMethod,
    note: note || null,
    soldAt: new Date(),
    soldByUserId: me.id,
  });
  await logAudit({
    userId: me.id,
    action: 'create',
    entityType: 'ProductSale',
    entityId: String(sale._id),
    patientId: patientId ?? undefined,
    clinicId: input.clinicId,
    summary: `Venda ao balcão: ${lines.map(l => `${l.quantity}× ${l.name}`).join(', ')} — ${formatEuro(totalCents)}`,
    changedFields: [],
  });
  refresh();
  if (patientId) revalidatePath(`/admin/pacientes/${patientId}`);
  return { success: true, totalCents };
}

async function loadSale(saleId: string, me: Awaited<ReturnType<typeof requireUser>>) {
  if (!OBJECT_ID.test(saleId)) throw new Error('Venda inválida.');
  const sale = await ProductSale.findById(saleId).select('clinicId patientId voidedAt totalCents');
  if (!sale) throw new Error('Venda não encontrada.');
  if (!canOperateClinic(me.user, String(sale.clinicId))) {
    throw new Error('Sem permissões para esta clínica.');
  }
  return sale;
}

export async function setSaleFiscalDocumentAction(
  saleId: string,
  rawNumber: string,
): Promise<{ error?: string }> {
  let me;
  let sale;
  try {
    me = await requireUser(['admin', 'receptionist']);
    sale = await loadSale(saleId, me);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (sale.voidedAt) return { error: 'A venda está anulada.' };
  const number = String(rawNumber ?? '').trim();
  if (number.length > 60) return { error: 'N.º de documento demasiado longo.' };
  await ProductSale.updateOne(
    { _id: saleId },
    { $set: { fiscalDocument: number || null } },
  );
  await logAudit({
    userId: me.id,
    action: 'update',
    entityType: 'ProductSale',
    entityId: saleId,
    clinicId: String(sale.clinicId),
    summary: number
      ? `Venda ao balcão: documento fiscal ${number}`
      : 'Venda ao balcão: documento fiscal removido',
    changedFields: ['fiscalDocument'],
  });
  refresh();
  return {};
}

export async function voidProductSaleAction(
  saleId: string,
  rawReason: string,
): Promise<{ error?: string }> {
  let me;
  let sale;
  try {
    me = await requireUser(['admin']);
    sale = await loadSale(saleId, me);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (sale.voidedAt) return {};
  const reason = String(rawReason ?? '').trim();
  if (reason.length < 5) return { error: 'Indique o motivo da anulação.' };
  if (reason.length > 300) return { error: 'Motivo demasiado longo (máx. 300).' };
  await ProductSale.updateOne(
    { _id: saleId, voidedAt: null },
    { $set: { voidedAt: new Date(), voidedByUserId: me.id, voidReason: reason } },
  );
  await logAudit({
    userId: me.id,
    action: 'update',
    entityType: 'ProductSale',
    entityId: saleId,
    clinicId: String(sale.clinicId),
    summary: `Venda ao balcão anulada (${formatEuro(sale.totalCents)}): ${reason}`,
    changedFields: ['voidedAt', 'voidReason'],
  });
  refresh();
  return {};
}
