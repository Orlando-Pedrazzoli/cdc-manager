// 📄 src/actions/waitlist.ts
'use server';
// =============================================================================
// CDC Manager — Lista de espera: "Paciente quer outro horário" (8.ª ronda/10)
// Receção e gestão. Ver src/lib/waitlist.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import User, { canOperateClinic } from '@/models/User';
import Waitlist, { WAITLIST_PREFERENCES } from '@/models/Waitlist';
import type { WaitlistPreference } from '@/lib/waitlist';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
/** Estados em que ainda faz sentido pedir outro horário */
const OPEN_STATUSES = ['pending', 'confirmed'];

export type WaitlistResult = { success?: true; error?: string };

async function requireStaff(clinicId: string | null) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para gerir a lista de espera.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status clinicIds')
    .lean();
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== role ||
    (clinicId && !canOperateClinic(user, clinicId))
  ) {
    throw new Error('Sem permissões para esta clínica.');
  }
  return session.user;
}

/** Põe (ou atualiza) o pedido de outro horário de uma marcação */
export async function addToWaitlistAction(
  appointmentId: string,
  preference: WaitlistPreference,
  note: string,
): Promise<WaitlistResult> {
  try {
    if (!OBJECT_ID.test(appointmentId)) return { error: 'Marcação inválida.' };
    if (!(WAITLIST_PREFERENCES as readonly string[]).includes(preference)) {
      return { error: 'Escolha se o paciente quer mais cedo ou mais tarde.' };
    }
    await dbConnect();
    const appt = await Appointment.findById(appointmentId)
      .select('clinicId patientId doctorId treatmentTypeId startAt status')
      .lean();
    if (!appt) return { error: 'Marcação não encontrada.' };
    const user = await requireStaff(String(appt.clinicId));
    if (!OPEN_STATUSES.includes(appt.status)) {
      return { error: 'Só marcações pendentes ou confirmadas podem ir para a lista de espera.' };
    }
    const cleanNote = note.trim().slice(0, 300) || null;
    const existing = await Waitlist.findOne({
      appointmentId: appt._id,
      status: 'active',
    }).select('_id');
    if (existing) {
      await Waitlist.updateOne(
        { _id: existing._id },
        { $set: { preference, note: cleanNote } },
      );
    } else {
      await Waitlist.create({
        clinicId: appt.clinicId,
        patientId: appt.patientId,
        treatmentTypeId: appt.treatmentTypeId,
        doctorId: appt.doctorId ?? null,
        appointmentId: appt._id,
        preference,
        fromDate: new Date(),
        untilDate: appt.startAt,
        status: 'active',
        createdByUserId: user.id,
        note: cleanNote,
      });
    }
    await logAudit({
      userId: user.id,
      action: existing ? 'update' : 'create',
      entityType: 'Waitlist',
      entityId: appointmentId,
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: `Lista de espera: paciente quer outro horário (${preference})`,
    });
    revalidatePath('/admin/agenda');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

/** Tira um pedido da lista (já foi remarcado, ou o paciente desistiu) */
export async function closeWaitlistAction(
  waitlistId: string,
  outcome: 'fulfilled' | 'cancelled',
): Promise<WaitlistResult> {
  try {
    if (!OBJECT_ID.test(waitlistId)) return { error: 'Pedido inválido.' };
    await dbConnect();
    const entry = await Waitlist.findById(waitlistId)
      .select('clinicId patientId status')
      .lean();
    if (!entry) return { error: 'Pedido não encontrado.' };
    const user = await requireStaff(entry.clinicId ? String(entry.clinicId) : null);
    if (entry.status !== 'active') return { success: true };
    await Waitlist.updateOne(
      { _id: entry._id },
      { $set: { status: outcome, closedByUserId: user.id, closedAt: new Date() } },
    );
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'Waitlist',
      entityId: waitlistId,
      patientId: String(entry.patientId),
      clinicId: entry.clinicId ? String(entry.clinicId) : null,
      summary:
        outcome === 'fulfilled'
          ? 'Lista de espera: pedido resolvido'
          : 'Lista de espera: pedido retirado',
    });
    revalidatePath('/admin/agenda');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

/**
 * 9.ª ronda/17: o paciente liga e quer o médico X no dia X, mas a agenda
 * desse dia ainda não tem horário (ou está cheia). Fica o pedido; a agenda
 * avisa quando esse dia passar a ter vaga.
 */
export async function addDayRequestAction(input: {
  clinicId: string;
  patientId: string;
  doctorId: string;
  date: string; // YYYY-MM-DD
  note: string;
}): Promise<WaitlistResult> {
  try {
    if (
      !OBJECT_ID.test(input.clinicId) ||
      !OBJECT_ID.test(input.patientId) ||
      !OBJECT_ID.test(input.doctorId)
    ) {
      return { error: 'Escolha o paciente e o médico.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { error: 'Indique o dia pedido.' };
    }
    if (input.date < todayLisbon()) {
      return { error: 'O dia pedido já passou.' };
    }
    const user = await requireStaff(input.clinicId);
    const [patient, doctor] = await Promise.all([
      Patient.findById(input.patientId).select('status').lean(),
      Doctor.findOne({
        _id: input.doctorId,
        active: true,
        'clinicSchedules.clinicId': input.clinicId,
      })
        .select('_id')
        .lean(),
    ]);
    if (!patient || patient.status !== 'active') {
      return { error: 'Paciente não encontrado ou inativo.' };
    }
    if (!doctor) return { error: 'Este médico não trabalha nesta clínica.' };

    const from = lisbonToUtc(input.date, 0);
    const until = lisbonToUtc(input.date, 24 * 60 - 1);
    const duplicate = await Waitlist.exists({
      clinicId: input.clinicId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      appointmentId: null,
      status: 'active',
      fromDate: from,
    });
    if (duplicate) return { error: 'Este pedido já está na lista de espera.' };

    const created = await Waitlist.create({
      clinicId: input.clinicId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      treatmentTypeId: null,
      appointmentId: null,
      preference: 'any',
      fromDate: from,
      untilDate: until,
      status: 'active',
      createdByUserId: user.id,
      note: input.note.trim().slice(0, 300) || null,
    });
    await logAudit({
      userId: user.id,
      action: 'create',
      entityType: 'Waitlist',
      entityId: String(created._id),
      patientId: input.patientId,
      clinicId: input.clinicId,
      summary: `Lista de espera: pedido para o dia ${input.date}`,
    });
    revalidatePath('/admin/agenda');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
