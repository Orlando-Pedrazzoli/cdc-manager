'use server';
// =============================================================================
// CDC Manager — Ajustes manuais ao pagamento dos médicos (8.ª ronda/14)
// Só a gestão. Ver src/models/DoctorPayAdjustment.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Doctor from '@/models/Doctor';
import DoctorPayAdjustment from '@/models/DoctorPayAdjustment';
import User from '@/models/User';
import { signedAdjustmentCents, signedEuros } from '@/lib/pay-statement';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export type PayAdjustmentState =
  | { success: true; message: string }
  | { error: string }
  | undefined;

async function requireAdmin(): Promise<{ id: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    return { error: 'Área reservada à gestão.' };
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    return { error: 'Conta inativa ou permissões alteradas.' };
  }
  return { id: session.user.id };
}

const addSchema = z.object({
  doctorId: z.string().regex(OBJECT_ID, 'Escolha o profissional'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido'),
  kind: z.enum(['add', 'deduct']),
  amount: z.string(),
  description: z
    .string()
    .trim()
    .min(3, 'Escreva a descrição do ajuste')
    .max(160, 'Descrição demasiado longa'),
});

export async function addPayAdjustmentAction(
  _prev: PayAdjustmentState,
  formData: FormData,
): Promise<PayAdjustmentState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const parsed = addSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const d = parsed.data;
  const amountCents = signedAdjustmentCents(d.amount, d.kind);
  if (amountCents === null) {
    return { error: 'Indique um valor em euros maior que zero (ex.: 45,50).' };
  }
  const doctor = await Doctor.findById(d.doctorId).select('name').lean();
  if (!doctor) return { error: 'Profissional não encontrado.' };

  const created = await DoctorPayAdjustment.create({
    doctorId: d.doctorId,
    month: d.month,
    description: d.description,
    amountCents,
    createdByUserId: guard.id,
  });
  await logAudit({
    userId: guard.id,
    action: 'create',
    entityType: 'DoctorPayAdjustment',
    entityId: String(created._id),
    summary: `Ajuste ao pagamento de ${doctor.name} (${d.month}): ${signedEuros(amountCents)} — ${d.description}`,
  });
  revalidatePath('/admin/relatorios/comissoes');
  return {
    success: true,
    message: `Ajuste lançado a ${doctor.name}: ${signedEuros(amountCents)}.`,
  };
}

export async function removePayAdjustmentAction(
  _prev: PayAdjustmentState,
  formData: FormData,
): Promise<PayAdjustmentState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const id = String(formData.get('id') ?? '');
  if (!OBJECT_ID.test(id)) return { error: 'Ajuste inválido.' };
  const adj = await DoctorPayAdjustment.findById(id);
  if (!adj) return { error: 'Ajuste não encontrado.' };
  if (adj.removedAt) return { success: true, message: 'Já estava retirado.' };
  adj.set('removedAt', new Date());
  adj.set('removedByUserId', guard.id);
  await adj.save();
  await logAudit({
    userId: guard.id,
    action: 'update',
    entityType: 'DoctorPayAdjustment',
    entityId: id,
    summary: `Ajuste ao pagamento retirado (${adj.month}): ${signedEuros(adj.amountCents)} — ${adj.description}`,
    changedFields: ['removedAt'],
  });
  revalidatePath('/admin/relatorios/comissoes');
  return { success: true, message: 'Ajuste retirado.' };
}
