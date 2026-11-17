// 📄 src/actions/expiry-items.ts
'use server';
// =============================================================================
// CDC Manager — Prazos de validade: gravar e arquivar (8.ª ronda/16 e 17)
// Só a gestão. Ver src/models/ExpiryItem.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Doctor from '@/models/Doctor';
import ExpiryItem, { EXPIRY_SCOPES } from '@/models/ExpiryItem';
import User from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export type ExpiryActionState =
  | { success: true; message: string }
  | { error: string }
  | undefined;

const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;
const text = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().default(null));

const schema = z.object({
  id: z.preprocess(emptyToNull, z.string().regex(OBJECT_ID).nullable().default(null)),
  scope: z.enum(EXPIRY_SCOPES),
  doctorId: z.preprocess(
    emptyToNull,
    z.string().regex(OBJECT_ID, 'Médico inválido').nullable().default(null),
  ),
  name: z.string().trim().min(2, 'Indique o nome do documento ou do serviço').max(120),
  company: text(120),
  contact: text(120),
  phone: text(40),
  email: text(120),
  notes: text(500),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique a data de validade'),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Área reservada à gestão.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    throw new Error('Conta inativa ou permissões alteradas.');
  }
  return session.user;
}

export async function saveExpiryItemAction(
  _prev: ExpiryActionState,
  formData: FormData,
): Promise<ExpiryActionState> {
  try {
    const user = await requireAdmin();
    const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const d = parsed.data;
    if (d.scope === 'doctor') {
      if (!d.doctorId) return { error: 'Escolha o médico.' };
      const exists = await Doctor.exists({ _id: d.doctorId });
      if (!exists) return { error: 'Médico não encontrado.' };
    }
    const fields = {
      scope: d.scope,
      doctorId: d.scope === 'doctor' ? d.doctorId : null,
      name: d.name,
      company: d.scope === 'partner' ? d.company : null,
      contact: d.scope === 'partner' ? d.contact : null,
      phone: d.scope === 'partner' ? d.phone : null,
      email: d.scope === 'partner' ? d.email : null,
      notes: d.notes,
      expiresAt: new Date(`${d.expiresAt}T12:00:00Z`),
      updatedByUserId: user.id,
    };
    let entityId: string;
    if (d.id) {
      const res = await ExpiryItem.updateOne({ _id: d.id }, { $set: fields });
      if (res.matchedCount === 0) return { error: 'Registo não encontrado.' };
      entityId = d.id;
    } else {
      const created = await ExpiryItem.create({
        ...fields,
        createdByUserId: user.id,
      });
      entityId = String(created._id);
    }
    await logAudit({
      userId: user.id,
      action: d.id ? 'update' : 'create',
      entityType: 'ExpiryItem',
      entityId,
      summary: `Prazo ${d.id ? 'atualizado' : 'criado'}: ${d.name} (validade ${d.expiresAt})`,
    });
    revalidatePath('/admin/prazos');
    revalidatePath('/admin/dashboard');
    return { success: true, message: d.id ? 'Prazo atualizado.' : 'Prazo registado.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

/** Arquivar (deixa de avisar) ou repor. Nada é apagado. */
export async function setExpiryItemActiveAction(
  id: string,
  active: boolean,
): Promise<ExpiryActionState> {
  try {
    const user = await requireAdmin();
    if (!OBJECT_ID.test(id)) return { error: 'Registo inválido.' };
    const item = await ExpiryItem.findByIdAndUpdate(
      id,
      { $set: { active, updatedByUserId: user.id } },
      { new: true },
    )
      .select('name')
      .lean();
    if (!item) return { error: 'Registo não encontrado.' };
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'ExpiryItem',
      entityId: id,
      summary: `Prazo ${active ? 'reposto' : 'arquivado'}: ${item.name}`,
    });
    revalidatePath('/admin/prazos');
    revalidatePath('/admin/dashboard');
    return { success: true, message: active ? 'Prazo reposto.' : 'Prazo arquivado.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
