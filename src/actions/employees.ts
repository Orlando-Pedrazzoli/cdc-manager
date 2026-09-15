// 📄 src/actions/employees.ts
// =============================================================================
// CDC Manager — Server Actions: Colaboradores / RH (Fase 6A, E16)
// SÓ ADMIN. Históricos append-only. Never delete (active=false).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Employee from '@/models/Employee';
import {
  employeeSchema,
  raiseSchema,
  categoryChangeSchema,
  warningSchema,
} from '@/lib/validations/employee';

export type EmployeeFormState =
  | { success: true; employeeId: string }
  | { error: string }
  | undefined;
const OID = /^[0-9a-fA-F]{24}$/;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin')
    throw new Error('Área reservada à administração.');
  await dbConnect();
  return session.user;
}
function parse(fd: FormData) {
  return employeeSchema.safeParse({
    name: fd.get('name'),
    category: fd.get('category'),
    contractType: fd.get('contractType') || 'sem-termo',
    startDate: fd.get('startDate'),
    endDate: fd.get('endDate'),
    nif: fd.get('nif'),
    niss: fd.get('niss'),
    phone: fd.get('phone'),
    email: fd.get('email'),
    clinicIds: fd.getAll('clinicIds'),
    initialSalaryCents: fd.get('initialSalaryEuros'),
    socialSecurityRate: fd.get('socialSecurityRate'),
    irsRate: fd.get('irsRate'),
    schedule: fd.get('schedule'),
    benefits: fd.get('benefits'),
    notes: fd.get('notes'),
  });
}
const toDate = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`) : null);

export async function createEmployeeAction(
  _p: EmployeeFormState,
  fd: FormData,
): Promise<EmployeeFormState> {
  try {
    const user = await requireAdmin();
    const parsed = parse(fd);
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    const created = await Employee.create({
      ...d,
      startDate: toDate(d.startDate),
      endDate: toDate(d.endDate),
      currentSalaryCents: d.initialSalaryCents,
      createdByUserId: user.id,
    });
    await logAudit({
      userId: user.id,
      action: 'create',
      entityType: 'Employee',
      entityId: String(created._id),
      summary: `Colaborador criado: ${d.name} (${d.category})`,
    });
    revalidatePath('/admin/colaboradores');
    return { success: true, employeeId: String(created._id) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function updateEmployeeAction(
  employeeId: string,
  _p: EmployeeFormState,
  fd: FormData,
): Promise<EmployeeFormState> {
  try {
    const user = await requireAdmin();
    if (!OID.test(employeeId)) return { error: 'Colaborador inválido.' };
    const parsed = parse(fd);
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    const emp = await Employee.findById(employeeId);
    if (!emp) return { error: 'Colaborador não encontrado.' };
    emp.set({
      ...d,
      startDate: toDate(d.startDate),
      endDate: toDate(d.endDate),
    });
    if (emp.currentSalaryCents == null)
      emp.set('currentSalaryCents', d.initialSalaryCents);
    await emp.save();
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Employee',
      entityId: employeeId,
      summary: `Colaborador atualizado: ${d.name}`,
    });
    revalidatePath(`/admin/colaboradores/${employeeId}`);
    revalidatePath('/admin/colaboradores');
    return { success: true, employeeId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function toggleEmployeeActiveAction(
  employeeId: string,
): Promise<{ error?: string }> {
  try {
    const user = await requireAdmin();
    const emp = await Employee.findById(employeeId).select('active name');
    if (!emp) return { error: 'Colaborador não encontrado.' };
    emp.set('active', !emp.active);
    await emp.save();
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Employee',
      entityId: employeeId,
      summary: `Colaborador ${emp.active ? 'reativado' : 'desativado'}: ${emp.name}`,
    });
    revalidatePath('/admin/colaboradores');
    revalidatePath(`/admin/colaboradores/${employeeId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export type HistoryState = { success: true } | { error: string } | undefined;

export async function addRaiseAction(
  _p: HistoryState,
  fd: FormData,
): Promise<HistoryState> {
  try {
    const user = await requireAdmin();
    const parsed = raiseSchema.safeParse({
      employeeId: fd.get('employeeId'),
      at: fd.get('at'),
      newSalaryCents: fd.get('newSalaryEuros'),
      note: fd.get('note'),
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    const res = await Employee.updateOne(
      { _id: d.employeeId },
      {
        $push: {
          raises: {
            at: toDate(d.at),
            newSalaryCents: d.newSalaryCents,
            note: d.note,
            byUserId: user.id,
          },
        },
        $set: { currentSalaryCents: d.newSalaryCents },
      },
    );
    if (res.matchedCount !== 1) return { error: 'Colaborador não encontrado.' };
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Employee',
      entityId: d.employeeId,
      summary: `Aumento registado: ${(d.newSalaryCents / 100).toFixed(2)} € em ${d.at}`,
    });
    revalidatePath(`/admin/colaboradores/${d.employeeId}`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function addCategoryChangeAction(
  _p: HistoryState,
  fd: FormData,
): Promise<HistoryState> {
  try {
    const user = await requireAdmin();
    const parsed = categoryChangeSchema.safeParse({
      employeeId: fd.get('employeeId'),
      at: fd.get('at'),
      category: fd.get('category'),
      note: fd.get('note'),
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    const res = await Employee.updateOne(
      { _id: d.employeeId },
      {
        $push: {
          categoryChanges: {
            at: toDate(d.at),
            category: d.category,
            note: d.note,
            byUserId: user.id,
          },
        },
        $set: { category: d.category },
      },
    );
    if (res.matchedCount !== 1) return { error: 'Colaborador não encontrado.' };
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Employee',
      entityId: d.employeeId,
      summary: `Mudança de categoria: ${d.category} em ${d.at}`,
    });
    revalidatePath(`/admin/colaboradores/${d.employeeId}`);
    revalidatePath('/admin/colaboradores');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function addWarningAction(
  _p: HistoryState,
  fd: FormData,
): Promise<HistoryState> {
  try {
    const user = await requireAdmin();
    const parsed = warningSchema.safeParse({
      employeeId: fd.get('employeeId'),
      at: fd.get('at'),
      text: fd.get('text'),
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    const res = await Employee.updateOne(
      { _id: d.employeeId },
      {
        $push: {
          warnings: { at: toDate(d.at), text: d.text, byUserId: user.id },
        },
      },
    );
    if (res.matchedCount !== 1) return { error: 'Colaborador não encontrado.' };
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Employee',
      entityId: d.employeeId,
      summary: `Advertência registada em ${d.at}`,
    });
    revalidatePath(`/admin/colaboradores/${d.employeeId}`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
