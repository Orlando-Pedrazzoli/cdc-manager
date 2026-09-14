// 📄 src/actions/lab-cases.ts
// =============================================================================
// CDC Manager — Actions: casos de laboratório (próteses)
// -----------------------------------------------------------------------------
// RBAC: staff (admin + receção) — é a receção quem envia, recebe e cobra o
// laboratório. Transições:
//   sent → received → delivered ; qualquer estado ativo → cancelled
// "Nova data prevista" (reschedule) é a ferramenta da COBRANÇA: liga-se ao
// laboratório, renegoceia-se a chegada e regista-se a nova data + nota —
// o alerta de atraso recalcula sozinho. Tudo com audit log; nunca apagar.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { lisbonToUtc } from '@/lib/availability';
import LabCase from '@/models/LabCase';
import Patient from '@/models/Patient';
import Supplier from '@/models/Supplier';
import { LAB_WORK_TYPE_LABEL } from '@/lib/domain';
import {
  createLabCaseSchema,
  labCaseIdSchema,
  rescheduleLabCaseSchema,
  cancelLabCaseSchema,
} from '@/lib/validations/lab';

export type LabCaseActionState =
  | { success: true }
  | { error: string }
  | undefined;

async function requireStaff() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para gerir próteses.');
  }
  await dbConnect();
  return session.user;
}

function fail(e: unknown): { error: string } {
  console.error('[lab-cases]', e);
  return {
    error: e instanceof Error ? e.message : 'Erro inesperado — tente de novo.',
  };
}

// Datas de calendário guardadas ao meio-dia de Lisboa (sem deriva de fuso)
const midday = (dateStr: string) => lisbonToUtc(dateStr, 12 * 60);

function revalidateAll() {
  revalidatePath('/admin/proteses');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/agenda');
  revalidatePath('/admin/pacientes/[id]', 'page');
  revalidatePath('/doutor/pacientes/[id]', 'page');
}

// -----------------------------------------------------------------------------
// CRIAR (registar envio ao laboratório)
// -----------------------------------------------------------------------------
export async function createLabCaseAction(
  _prev: LabCaseActionState,
  formData: FormData,
): Promise<LabCaseActionState> {
  try {
    const user = await requireStaff();
    const parsed = createLabCaseSchema.safeParse({
      clinicId: formData.get('clinicId'),
      patientId: formData.get('patientId'),
      doctorId: formData.get('doctorId'),
      labName: formData.get('labName'),
      workType: formData.get('workType'),
      toothNotes: formData.get('toothNotes'),
      shade: formData.get('shade'),
      notes: formData.get('notes'),
      costCents: formData.get('costEuros'),
      sentDate: formData.get('sentDate'),
      dueDate: formData.get('dueDate'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const [patient, supplier] = await Promise.all([
      Patient.findById(data.patientId).select('name'),
      Supplier.findById(data.supplierId).select('name isLab active'),
    ]);
    if (!patient) return { error: 'Paciente não encontrado.' };
    if (!supplier || !supplier.isLab || !supplier.active) {
      return { error: 'Laboratório inválido ou inativo.' };
    }

    const created = await LabCase.create({
      clinicId: data.clinicId,
      patientId: data.patientId,
      doctorId: data.doctorId,
      supplierId: supplier._id,
      labName: supplier.name, // snapshot
      workType: data.workType,
      toothNotes: data.toothNotes,
      shade: data.shade,
      notes: data.notes,
      costCents: data.costCents,
      status: 'sent',
      sentAt: midday(data.sentDate),
      dueDate: midday(data.dueDate),
      createdByUserId: user.id,
    });

    await logAudit({
      userId: user.id,
      action: 'create',
      entityType: 'LabCase',
      entityId: String(created._id),
      patientId: data.patientId,
      clinicId: data.clinicId,
      summary: `Pedido ao laboratório: ${LAB_WORK_TYPE_LABEL[data.workType]} → ${supplier.name} (prevista ${data.dueDate})`,
    });

    revalidateAll();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// RECEBIDA na clínica (desliga o alerta de atraso)
// -----------------------------------------------------------------------------
export async function receiveLabCaseAction(
  formData: FormData,
): Promise<LabCaseActionState> {
  try {
    const user = await requireStaff();
    const parsed = labCaseIdSchema.safeParse({ id: formData.get('id') });
    if (!parsed.success) return { error: 'Caso inválido.' };

    // Transição condicionada ao estado — cliques simultâneos não se pisam
    const res = await LabCase.updateOne(
      { _id: parsed.data.id, status: 'sent' },
      { $set: { status: 'received', receivedAt: new Date() } },
    );
    if (res.modifiedCount !== 1) {
      return { error: 'Este caso já não está no laboratório.' };
    }

    const doc = await LabCase.findById(parsed.data.id)
      .select('patientId clinicId labName')
      .lean();
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'LabCase',
      entityId: parsed.data.id,
      patientId: doc ? String(doc.patientId) : undefined,
      clinicId: doc ? String(doc.clinicId) : undefined,
      summary: `Prótese recebida do laboratório${doc ? ` ${doc.labName}` : ''}`,
    });

    revalidateAll();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// COLOCADA / entregue ao paciente (fecho do caso)
// -----------------------------------------------------------------------------
export async function deliverLabCaseAction(
  formData: FormData,
): Promise<LabCaseActionState> {
  try {
    const user = await requireStaff();
    const parsed = labCaseIdSchema.safeParse({ id: formData.get('id') });
    if (!parsed.success) return { error: 'Caso inválido.' };

    const res = await LabCase.updateOne(
      { _id: parsed.data.id, status: 'received' },
      { $set: { status: 'delivered', deliveredAt: new Date() } },
    );
    if (res.modifiedCount !== 1) {
      return {
        error:
          'Só uma prótese recebida na clínica pode ser marcada como colocada.',
      };
    }

    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'LabCase',
      entityId: parsed.data.id,
      summary: 'Prótese colocada/entregue ao paciente',
    });

    revalidateAll();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// NOVA DATA PREVISTA (após cobrar o laboratório)
// -----------------------------------------------------------------------------
export async function rescheduleLabCaseAction(
  formData: FormData,
): Promise<LabCaseActionState> {
  try {
    const user = await requireStaff();
    const parsed = rescheduleLabCaseSchema.safeParse({
      id: formData.get('id'),
      newDueDate: formData.get('newDueDate'),
      note: formData.get('note'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    const doc = await LabCase.findById(parsed.data.id);
    if (!doc) return { error: 'Caso não encontrado.' };
    if (doc.status !== 'sent') {
      return { error: 'Só casos no laboratório podem mudar a data prevista.' };
    }

    const noteLine = `Nova data prevista ${parsed.data.newDueDate} (registada por cobrança ao laboratório)${parsed.data.note ? ` — ${parsed.data.note}` : ''}`;
    await LabCase.updateOne(
      { _id: doc._id },
      {
        $set: {
          dueDate: midday(parsed.data.newDueDate),
          notes: doc.notes ? `${doc.notes}\n${noteLine}` : noteLine,
        },
      },
    );

    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'LabCase',
      entityId: parsed.data.id,
      patientId: String(doc.patientId),
      clinicId: String(doc.clinicId),
      summary: `Prótese: ${noteLine}`,
    });

    revalidateAll();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// CANCELAR (never-delete: motivo + autor)
// -----------------------------------------------------------------------------
export async function cancelLabCaseAction(
  formData: FormData,
): Promise<LabCaseActionState> {
  try {
    const user = await requireStaff();
    const parsed = cancelLabCaseSchema.safeParse({
      id: formData.get('id'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    const res = await LabCase.updateOne(
      { _id: parsed.data.id, status: { $in: ['sent', 'received'] } },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledByUserId: user.id,
          cancelReason: parsed.data.reason,
        },
      },
    );
    if (res.modifiedCount !== 1) {
      return { error: 'Este caso já não pode ser cancelado.' };
    }

    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'LabCase',
      entityId: parsed.data.id,
      summary: `Prótese cancelada — ${parsed.data.reason}`,
    });

    revalidateAll();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
