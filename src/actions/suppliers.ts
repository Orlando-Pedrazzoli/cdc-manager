// 📄 src/actions/suppliers.ts
// =============================================================================
// CDC Manager — Server Actions: Fornecedores / Laboratórios (E3)
// -----------------------------------------------------------------------------
// RBAC: admin + receção (é a receção quem lida com os laboratórios).
// Never delete: desativar em vez de apagar (o histórico de pedidos aponta
// para o fornecedor).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Supplier from '@/models/Supplier';
import { supplierSchema, supplierIdSchema } from '@/lib/validations/supplier';

export type SupplierFormState =
  | { success: true; supplierId: string }
  | { error: string }
  | undefined;

async function requireStaff() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para gerir fornecedores.');
  }
  await dbConnect();
  return session.user;
}

function parse(formData: FormData) {
  return supplierSchema.safeParse({
    name: formData.get('name'),
    isLab: formData.get('isLab'),
    nif: formData.get('nif'),
    contactName: formData.get('contactName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    address: formData.get('address'),
    defaultLeadDays: formData.get('defaultLeadDays'),
    notes: formData.get('notes'),
  });
}

function revalidateAll() {
  revalidatePath('/admin/fornecedores');
  revalidatePath('/admin/proteses');
}

export async function createSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  try {
    const user = await requireStaff();
    const parsed = parse(formData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const dup = await Supplier.findOne({ name: parsed.data.name })
      .collation({ locale: 'pt', strength: 2 })
      .select('_id');
    if (dup) return { error: 'Já existe um fornecedor com esse nome.' };

    const created = await Supplier.create({
      ...parsed.data,
      createdByUserId: user.id,
    });
    await logAudit({
      userId: user.id,
      action: 'create',
      entityType: 'Supplier',
      entityId: String(created._id),
      summary: `Fornecedor criado: ${parsed.data.name}${parsed.data.isLab ? ' (laboratório)' : ''}`,
    });
    revalidateAll();
    return { success: true, supplierId: String(created._id) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function updateSupplierAction(
  supplierId: string,
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  try {
    const user = await requireStaff();
    const idOk = supplierIdSchema.safeParse({ id: supplierId });
    if (!idOk.success) return { error: 'Fornecedor inválido.' };
    const parsed = parse(formData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const dup = await Supplier.findOne({
      name: parsed.data.name,
      _id: { $ne: supplierId },
    })
      .collation({ locale: 'pt', strength: 2 })
      .select('_id');
    if (dup) return { error: 'Já existe um fornecedor com esse nome.' };

    const res = await Supplier.updateOne(
      { _id: supplierId },
      { $set: parsed.data },
    );
    if (res.matchedCount !== 1) return { error: 'Fornecedor não encontrado.' };
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Supplier',
      entityId: supplierId,
      summary: `Fornecedor atualizado: ${parsed.data.name}`,
    });
    revalidateAll();
    return { success: true, supplierId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function toggleSupplierActiveAction(
  supplierId: string,
): Promise<{ error?: string }> {
  try {
    const user = await requireStaff();
    const idOk = supplierIdSchema.safeParse({ id: supplierId });
    if (!idOk.success) return { error: 'Fornecedor inválido.' };
    const doc = await Supplier.findById(supplierId).select('active name');
    if (!doc) return { error: 'Fornecedor não encontrado.' };
    doc.set('active', !doc.active);
    await doc.save();
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Supplier',
      entityId: supplierId,
      summary: `Fornecedor ${doc.active ? 'reativado' : 'desativado'}: ${doc.name}`,
    });
    revalidateAll();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
