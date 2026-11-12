// 📄 src/actions/recalls.ts
// =============================================================================
// CDC Manager — Actions: fila de Recalls (admin + receção)
// -----------------------------------------------------------------------------
// Uma única action paramétrica aplica as ações da receção sobre um ciclo
// (contact/book/dismiss/unreachable/reopen), validadas pela máquina de
// transições de validations/recalls.ts. RBAC igual à Cobrança: admin vê
// tudo; receção só opera recalls das clínicas onde trabalha.
//
// 'contact' incrementa contactAttempts e regista lastContactedAt — no
// Sprint 6 o disparo WhatsApp automático usa exatamente estes campos.
// Conversão em consulta ('book') é manual na v1: a receção marca na agenda
// e regista aqui; a ligação automática bookedAppointmentId fica p/ Sprint 6.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  recallIdSchema,
  recallContactSchema,
  canApplyRecallAction,
  canRegisterContact,
  RECALL_ACTION_TARGET,
  RECALL_OUTCOME_LABEL,
  RECALL_OUTCOME_TARGET,
  type RecallUserAction,
} from '@/lib/validations/recalls';
import Recall from '@/models/Recall';
import User, { canOperateClinic } from '@/models/User';

export type RecallsActionState =
  | { error: string }
  | { success: true }
  | undefined;

const ACTION_SUMMARY: Record<RecallUserAction, string> = {
  contact: 'Recall: tentativa de contacto registada',
  book: 'Recall convertido em consulta',
  dismiss: 'Recall dispensado',
  unreachable: 'Recall marcado incontactável',
  reopen: 'Recall reaberto para a fila',
};

async function applyRecallAction(
  action: RecallUserAction,
  formData: FormData,
): Promise<RecallsActionState> {
  try {
    const parsed = recallIdSchema.safeParse({ id: formData.get('id') });
    if (!parsed.success) return { error: 'Recall inválido.' };

    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    ) {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();

    const recall = await Recall.findById(parsed.data.id);
    if (!recall) return { error: 'Recall não encontrado.' };

    // Receção: só nas clínicas onde opera (mesma regra da Cobrança)
    const user = await User.findById(session.user.id)
      .select('role status clinicIds')
      .lean();
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== session.user.role ||
      !canOperateClinic(user, String(recall.clinicId))
    ) {
      return { error: 'Sem permissões nesta clínica.' };
    }

    if (!canApplyRecallAction(action, recall.status)) {
      return { error: 'Ação não permitida no estado atual do recall.' };
    }

    recall.set('status', RECALL_ACTION_TARGET[action]);
    if (action === 'contact') {
      recall.set('contactAttempts', (recall.contactAttempts ?? 0) + 1);
      recall.set('lastContactedAt', new Date());
    }
    await recall.save();

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Recall',
      entityId: String(recall._id),
      patientId: String(recall.patientId),
      clinicId: String(recall.clinicId),
      summary: ACTION_SUMMARY[action],
      changedFields:
        action === 'contact'
          ? ['status', 'contactAttempts', 'lastContactedAt']
          : ['status'],
    });

    revalidatePath('/admin/recalls');
    return { success: true };
  } catch (err) {
    console.error(`[recalls] ${action}:`, err);
    return { error: 'Erro inesperado ao atualizar o recall.' };
  }
}

// -----------------------------------------------------------------------------
// 6.ª ronda/09 (Victor, nov. 2026) — REGISTAR UM CONTACTO com o resultado
// -----------------------------------------------------------------------------
// Cada botão da fila (Agendado, Não atendeu, Retornar mais tarde, Pediu para
// ligar depois, Deixou mensagem, Não tem interesse, Número errado) grava uma
// entrada em Recall.contacts com o colaborador e a hora — é o registo de
// produtividade. O estado do ciclo segue RECALL_OUTCOME_TARGET.
export async function registerRecallContactAction(
  _prev: RecallsActionState,
  formData: FormData,
): Promise<RecallsActionState> {
  try {
    const parsed = recallContactSchema.safeParse({
      id: formData.get('id'),
      outcome: formData.get('outcome'),
      note: formData.get('note'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const { id, outcome, note } = parsed.data;

    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    ) {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();

    const recall = await Recall.findById(id);
    if (!recall) return { error: 'Recall não encontrado.' };

    const user = await User.findById(session.user.id)
      .select('role status clinicIds')
      .lean();
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== session.user.role ||
      !canOperateClinic(user, String(recall.clinicId))
    ) {
      return { error: 'Sem permissões nesta clínica.' };
    }
    if (!canRegisterContact(recall.status)) {
      return { error: 'Este recall já está fechado — reabra-o primeiro.' };
    }

    const now = new Date();
    recall.contacts.push({ at: now, userId: session.user.id, outcome, note });
    recall.set('status', RECALL_OUTCOME_TARGET[outcome]);
    recall.set('lastOutcome', outcome);
    recall.set('contactAttempts', (recall.contactAttempts ?? 0) + 1);
    recall.set('lastContactedAt', now);
    await recall.save();

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Recall',
      entityId: String(recall._id),
      patientId: String(recall.patientId),
      clinicId: String(recall.clinicId),
      summary: `Recall: contacto registado — ${RECALL_OUTCOME_LABEL[outcome]}`,
      changedFields: ['status', 'contacts', 'contactAttempts', 'lastContactedAt'],
    });

    revalidatePath('/admin/recalls');
    return { success: true };
  } catch (err) {
    console.error('[recalls] contacto:', err);
    return { error: 'Erro inesperado ao registar o contacto.' };
  }
}

// Wrappers exportados (ficheiro 'use server' exporta só async functions)

export async function markRecallContactedAction(
  _prev: RecallsActionState,
  formData: FormData,
): Promise<RecallsActionState> {
  return applyRecallAction('contact', formData);
}

export async function markRecallBookedAction(
  _prev: RecallsActionState,
  formData: FormData,
): Promise<RecallsActionState> {
  return applyRecallAction('book', formData);
}

export async function dismissRecallAction(
  _prev: RecallsActionState,
  formData: FormData,
): Promise<RecallsActionState> {
  return applyRecallAction('dismiss', formData);
}

export async function markRecallUnreachableAction(
  _prev: RecallsActionState,
  formData: FormData,
): Promise<RecallsActionState> {
  return applyRecallAction('unreachable', formData);
}

export async function reopenRecallAction(
  _prev: RecallsActionState,
  formData: FormData,
): Promise<RecallsActionState> {
  return applyRecallAction('reopen', formData);
}
