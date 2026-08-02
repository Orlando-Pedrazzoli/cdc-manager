// 📄 src/actions/appointments.ts
// =============================================================================
// CDC Manager — Server Actions: Marcações
// -----------------------------------------------------------------------------
// Criação, transições de estado, cancelamento e remarcação — com a defesa em
// duas camadas contra dupla marcação prometida no model:
//   camada 1: a UI só oferece slots vindos de computeFreeSlots
//   camada 2: AQUI — re-verificação isSlotAvailable DENTRO de uma transação
//             MongoDB; dois cliques simultâneos no mesmo slot → um ganha,
//             o outro recebe "horário já não disponível"
//
// MÁQUINA DE ESTADOS (única fonte das transições válidas):
//   pending    → confirmed | cancelled
//   confirmed  → checked-in | cancelled | no-show
//   checked-in → in-progress | no-show | cancelled
//   in-progress→ completed
//   (completed / cancelled / no-show são terminais)
//
// RBAC multi-clínica: staff; receptionist limitada às suas clinicIds via
// canOperateClinic — a receção da Buraca não mexe na agenda do Colombo.
//
// Remarcação = cancelar + criar nova ligadas (rescheduledFrom/To) na MESMA
// transação — a nova pode ser noutra clínica (referência Buraca↔Colombo).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Clinic from '@/models/Clinic';
import TreatmentType from '@/models/TreatmentType';
import { canOperateClinic } from '@/models/User';
import User from '@/models/User';
import {
  isSlotAvailable,
  lisbonToUtc,
  hhmmToMin,
  workingRangesForDate,
} from '@/lib/availability';
import { logAudit } from '@/lib/audit';

// -----------------------------------------------------------------------------
// Tipos de estado
// -----------------------------------------------------------------------------
export type AppointmentFormState =
  | { error: string }
  | { success: true; appointmentId: string }
  | undefined;

// -----------------------------------------------------------------------------
// RBAC
// -----------------------------------------------------------------------------
async function requireStaffForClinic(clinicId: string) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para gerir a agenda.');
  }
  // canOperateClinic precisa dos clinicIds — a sessão pode não os ter; ler da BD
  const user = await User.findById(session.user.id).select('role clinicIds');
  if (!user || !canOperateClinic(user, clinicId)) {
    throw new Error('Sem permissões para esta clínica.');
  }
  return session.user;
}

const isObjectId = (v: string) => /^[0-9a-fA-F]{24}$/.test(v);

// -----------------------------------------------------------------------------
// Transições válidas (única fonte)
// -----------------------------------------------------------------------------
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['in-progress', 'no-show', 'cancelled'],
  'in-progress': ['completed'],
  completed: [],
  cancelled: [],
  'no-show': [],
};

const STATUS_TIMESTAMP: Partial<Record<AppointmentStatus, string>> = {
  confirmed: 'confirmedAt',
  'checked-in': 'checkedInAt',
  'in-progress': 'startedAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

// -----------------------------------------------------------------------------
// CRIAR MARCAÇÃO (balcão/admin)
// -----------------------------------------------------------------------------
const createSchema = z.object({
  clinicId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  patientId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Selecione o paciente'),
  doctorId: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .nullable(),
  ),
  treatmentTypeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Selecione o ato'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida'),
  note: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(500).nullable(),
  ),
});

export async function createAppointmentAction(
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  await dbConnect();

  let staff;
  try {
    staff = await requireStaffForClinic(data.clinicId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  // Referências têm de existir e estar ativas
  const [clinic, patient, treatment, doctor] = await Promise.all([
    Clinic.findById(data.clinicId),
    Patient.findById(data.patientId).select('status name'),
    TreatmentType.findById(data.treatmentTypeId).select(
      'name durationMin bufferMin',
    ),
    data.doctorId ? Doctor.findById(data.doctorId) : Promise.resolve(null),
  ]);
  if (!clinic || !clinic.isActive) return { error: 'Clínica inválida.' };
  if (!patient || patient.status !== 'active') {
    return { error: 'Paciente inválido ou inativo.' };
  }
  if (!treatment) return { error: 'Ato inválido.' };
  if (data.doctorId && (!doctor || !doctor.active)) {
    return { error: 'Médico inválido ou inativo.' };
  }

  const totalMin = treatment.durationMin + (treatment.bufferMin ?? 0);
  const startMin = hhmmToMin(data.start);
  const startAt = lisbonToUtc(data.date, startMin);
  const endAt = new Date(startAt.getTime() + totalMin * 60_000);

  if (startAt.getTime() <= Date.now()) {
    return { error: 'A marcação tem de ser no futuro.' };
  }

  // Com médico: o slot tem de caber no horário efetivo dele nesta clínica
  if (doctor) {
    const ranges = workingRangesForDate(doctor, clinic, data.date);
    const fits = ranges.some(
      r => startMin >= r.start && startMin + totalMin <= r.end,
    );
    if (!fits) {
      return {
        error: 'Fora do horário do médico nesta clínica (ou dia indisponível).',
      };
    }
  }

  // --- Transação: re-verificar + criar atomicamente -------------------------
  const session = await mongoose.startSession();
  try {
    let appointmentId = '';
    await session.withTransaction(async () => {
      const free = await isSlotAvailable({
        clinicId: data.clinicId,
        doctorId: data.doctorId,
        startAt,
        endAt,
        session,
      });
      if (!free.ok) {
        throw new Error(
          free.reason === 'doctor-busy'
            ? 'O médico já tem marcação nesse horário (nesta ou na outra clínica).'
            : 'A clínica já está com a capacidade cheia nesse horário.',
        );
      }
      const [created] = await Appointment.create(
        [
          {
            clinicId: data.clinicId,
            patientId: data.patientId,
            doctorId: data.doctorId,
            treatmentTypeId: data.treatmentTypeId,
            startAt,
            endAt,
            status: 'pending',
            channel: 'front-desk',
            createdByUserId: staff.id,
            note: data.note,
          },
        ],
        { session },
      );
      appointmentId = created._id.toString();
    });

    await logAudit({
      userId: staff.id,
      action: 'create',
      entityType: 'Appointment',
      entityId: appointmentId,
      patientId: data.patientId,
      clinicId: data.clinicId,
      summary: `Marcação criada: ${treatment.name} a ${data.date} ${data.start}`,
    });

    revalidatePath('/admin/agenda');
    return { success: true, appointmentId };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await session.endSession();
  }
}

// -----------------------------------------------------------------------------
// TRANSIÇÃO DE ESTADO (confirmar, check-in, iniciar, concluir, falta)
// -----------------------------------------------------------------------------
export async function transitionAppointmentAction(
  appointmentId: string,
  to: AppointmentStatus,
  options?: { cancelReason?: string },
): Promise<{ error?: string }> {
  if (!isObjectId(appointmentId)) return { error: 'Marcação inválida.' };

  await dbConnect();
  const appt = await Appointment.findById(appointmentId).select(
    'status clinicId patientId',
  );
  if (!appt) return { error: 'Marcação não encontrada.' };

  let staff;
  try {
    staff = await requireStaffForClinic(String(appt.clinicId));
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (!TRANSITIONS[appt.status as AppointmentStatus].includes(to)) {
    return {
      error: `Transição inválida: ${appt.status} → ${to}.`,
    };
  }

  const $set: Record<string, unknown> = { status: to };
  const tsField = STATUS_TIMESTAMP[to];
  if (tsField) $set[tsField] = new Date();
  if (to === 'confirmed') $set.confirmedVia = 'front-desk';
  if (to === 'cancelled') {
    $set.cancelledBy = 'clinic';
    $set.cancelReason = options?.cancelReason?.trim().slice(0, 300) || null;
  }

  await Appointment.updateOne({ _id: appointmentId }, { $set });
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Appointment',
    entityId: appointmentId,
    patientId: String(appt.patientId),
    clinicId: String(appt.clinicId),
    summary: `Marcação: ${appt.status} → ${to}${options?.cancelReason ? ` (${options.cancelReason})` : ''}`,
    changedFields: ['status'],
  });

  revalidatePath('/admin/agenda');
  return {};
}

// -----------------------------------------------------------------------------
// REMARCAR (cancela a antiga + cria a nova, ligadas, na mesma transação)
// -----------------------------------------------------------------------------
const rescheduleSchema = z.object({
  clinicId: z.string().regex(/^[0-9a-fA-F]{24}$/), // clínica da NOVA marcação
  doctorId: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .nullable(),
  ),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export async function rescheduleAppointmentAction(
  appointmentId: string,
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  if (!isObjectId(appointmentId)) return { error: 'Marcação inválida.' };
  const parsed = rescheduleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  await dbConnect();
  const original = await Appointment.findById(appointmentId);
  if (!original) return { error: 'Marcação não encontrada.' };
  if (!['pending', 'confirmed'].includes(original.status)) {
    return {
      error: 'Só marcações pendentes/confirmadas podem ser remarcadas.',
    };
  }

  // Staff tem de poder operar AMBAS as clínicas (origem e destino)
  let staff;
  try {
    staff = await requireStaffForClinic(String(original.clinicId));
    if (data.clinicId !== String(original.clinicId)) {
      await requireStaffForClinic(data.clinicId);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }

  const [clinic, treatment, doctor] = await Promise.all([
    Clinic.findById(data.clinicId),
    TreatmentType.findById(original.treatmentTypeId).select(
      'name durationMin bufferMin',
    ),
    data.doctorId ? Doctor.findById(data.doctorId) : Promise.resolve(null),
  ]);
  if (!clinic || !clinic.isActive) return { error: 'Clínica inválida.' };
  if (!treatment) return { error: 'Ato da marcação original inválido.' };
  if (data.doctorId && (!doctor || !doctor.active)) {
    return { error: 'Médico inválido ou inativo.' };
  }

  const totalMin = treatment.durationMin + (treatment.bufferMin ?? 0);
  const startMin = hhmmToMin(data.start);
  const startAt = lisbonToUtc(data.date, startMin);
  const endAt = new Date(startAt.getTime() + totalMin * 60_000);
  if (startAt.getTime() <= Date.now()) {
    return { error: 'A nova marcação tem de ser no futuro.' };
  }
  if (doctor) {
    const ranges = workingRangesForDate(doctor, clinic, data.date);
    const fits = ranges.some(
      r => startMin >= r.start && startMin + totalMin <= r.end,
    );
    if (!fits) {
      return { error: 'Fora do horário do médico nesta clínica.' };
    }
  }

  const session = await mongoose.startSession();
  try {
    let newId = '';
    await session.withTransaction(async () => {
      const free = await isSlotAvailable({
        clinicId: data.clinicId,
        doctorId: data.doctorId,
        startAt,
        endAt,
        session,
        excludeAppointmentId: appointmentId, // o próprio slot antigo não conta
      });
      if (!free.ok) {
        throw new Error(
          free.reason === 'doctor-busy'
            ? 'O médico já tem marcação nesse horário.'
            : 'A clínica já está com a capacidade cheia nesse horário.',
        );
      }
      const [created] = await Appointment.create(
        [
          {
            clinicId: data.clinicId,
            patientId: original.patientId,
            doctorId: data.doctorId,
            treatmentTypeId: original.treatmentTypeId,
            startAt,
            endAt,
            status: 'pending',
            channel: 'front-desk',
            createdByUserId: staff.id,
            note: original.note,
            rescheduledFromId: original._id,
          },
        ],
        { session },
      );
      newId = created._id.toString();
      await Appointment.updateOne(
        { _id: original._id },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy: 'clinic',
            cancelReason: 'Remarcada',
            rescheduledToId: created._id,
          },
        },
        { session },
      );
    });

    await logAudit({
      userId: staff.id,
      action: 'update',
      entityType: 'Appointment',
      entityId: appointmentId,
      patientId: String(original.patientId),
      clinicId: String(original.clinicId),
      summary: `Remarcada para ${data.date} ${data.start}${data.clinicId !== String(original.clinicId) ? ' (outra clínica)' : ''}`,
    });

    revalidatePath('/admin/agenda');
    return { success: true, appointmentId: newId };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await session.endSession();
  }
}

// -----------------------------------------------------------------------------
// PESQUISA DE PACIENTE para o picker da agenda (leve, top 8)
// -----------------------------------------------------------------------------
export async function findPatientsAction(
  q: string,
): Promise<{ id: string; label: string }[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return [];
  }
  const term = q.trim();
  if (term.length < 2) return [];

  await dbConnect();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const digits = term.replace(/\D/g, '');
  const or: Record<string, unknown>[] = [];
  if (/^\d{1,6}$/.test(term)) or.push({ processNumber: Number(term) });
  if (digits.length >= 6) or.push({ phone: { $regex: escape(digits) } });
  const words = term
    .split(/\s+/)
    .filter(Boolean)
    .map(w => ({ name: { $regex: escape(w), $options: 'i' } }));
  if (words.length > 0) {
    or.push(words.length === 1 ? words[0] : { $and: words });
  }

  const patients = await Patient.find({ status: 'active', $or: or })
    .limit(8)
    .select('processNumber name phone')
    .lean();

  return patients.map(p => ({
    id: String(p._id),
    label: `${p.processNumber} · ${p.name}${p.phone ? ` · ${p.phone}` : ''}`,
  }));
}
