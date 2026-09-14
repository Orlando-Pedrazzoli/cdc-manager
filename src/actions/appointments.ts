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
//
// Fase 2 (paridade Dentoral):
//   · cancelar exige MOTIVO (≥3 chars) e grava cancelledByUserId (P7)
//   · createWalkInAction: urgência sem marcação → já 'checked-in' à hora
//     atual, sem validação de slot, isUrgent=true (P5)
// =============================================================================

'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment, {
  STAFF_BOOKING_CHANNELS,
  type AppointmentStatus,
} from '@/models/Appointment';
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
import Notification from '@/models/Notification';
import { logAudit } from '@/lib/audit';
import {
  sendAppointmentConfirmationEmail,
  sendDoctorNewAppointmentEmail,
} from '@/lib/resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

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
// NOTIFICAÇÕES PÓS-CRIAÇÃO (best-effort — falha NUNCA reverte a marcação)
// -----------------------------------------------------------------------------
// 1. Paciente: email de "consulta marcada" com botão de confirmação (um
//    clique → /confirmar/[token]) — só com email na ficha E consentimento
//    de lembretes (RGPD)
// 2. Médico: email "nova marcação na sua agenda" para o email da CONTA
//    (User com role doctor ligado por doctorId — o perfil Doctor não tem
//    email próprio de propósito)
// 3. Ambos ficam registados no outbox Notification (auditoria + timeline)
async function notifyNewAppointment(params: {
  appointmentId: string;
  confirmToken: string;
  patient: {
    _id: mongoose.Types.ObjectId;
    name: string;
    email?: string | null;
    consents?: { remindersAt?: Date | null } | null;
  };
  doctor: { _id: mongoose.Types.ObjectId; name: string } | null;
  clinicName: string;
  clinicAddress: string | null;
  treatmentName: string;
  startAt: Date;
  timeLabel: string; // HH:mm de parede (Lisboa)
  note: string | null;
}): Promise<void> {
  const rawDate = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(params.startAt);
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  // --- Paciente --------------------------------------------------------------
  if (params.patient.email && params.patient.consents?.remindersAt) {
    const result = await sendAppointmentConfirmationEmail({
      to: params.patient.email,
      patientName: params.patient.name,
      clinicName: params.clinicName,
      clinicAddress: params.clinicAddress,
      dateLabel,
      timeLabel: params.timeLabel,
      treatmentName: params.treatmentName,
      doctorName: params.doctor?.name ?? null,
      confirmUrl: `${APP_URL}/confirmar/${params.confirmToken}`,
    });
    await Notification.create({
      type: 'appointment-confirmation',
      channel: 'email',
      patientId: params.patient._id,
      recipient: params.patient.email,
      appointmentId: params.appointmentId,
      status: result.ok ? 'sent' : 'failed',
      sentAt: result.ok ? new Date() : null,
      failedAt: result.ok ? null : new Date(),
      errorMessage: result.ok ? null : result.error,
    }).catch(() => undefined);
  }

  // --- Médico ----------------------------------------------------------------
  if (params.doctor) {
    const doctorUser = await User.findOne({
      role: 'doctor',
      doctorId: params.doctor._id,
      status: 'active',
    }).select('email');
    if (doctorUser?.email) {
      const result = await sendDoctorNewAppointmentEmail({
        to: doctorUser.email,
        doctorName: params.doctor.name,
        patientName: params.patient.name,
        clinicName: params.clinicName,
        dateLabel,
        timeLabel: params.timeLabel,
        treatmentName: params.treatmentName,
        note: params.note,
      });
      await Notification.create({
        type: 'doctor-new-appointment',
        channel: 'email',
        userId: doctorUser._id,
        recipient: doctorUser.email,
        appointmentId: params.appointmentId,
        status: result.ok ? 'sent' : 'failed',
        sentAt: result.ok ? new Date() : null,
        failedAt: result.ok ? null : new Date(),
        errorMessage: result.ok ? null : result.error,
      }).catch(() => undefined);
    }
  }
}

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
  // Origem do PEDIDO (balcão/telefone/whatsapp) — nunca canais automáticos
  channel: z.enum(STAFF_BOOKING_CHANNELS).default('front-desk'),
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
    Patient.findById(data.patientId).select('status name email consents'),
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
  const confirmToken = randomBytes(24).toString('base64url');
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
            channel: data.channel,
            createdByUserId: staff.id,
            note: data.note,
            confirmToken,
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

    // Emails (paciente com botão de confirmação + médico) — best-effort
    await notifyNewAppointment({
      appointmentId,
      confirmToken,
      patient,
      doctor: doctor ? { _id: doctor._id, name: doctor.name } : null,
      clinicName: clinic.name,
      clinicAddress: clinic.address ?? null,
      treatmentName: treatment.name,
      startAt,
      timeLabel: data.start,
      note: data.note,
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
    const reason = options?.cancelReason?.trim().slice(0, 300) ?? '';
    if (reason.length < 3) {
      return { error: 'Indique o motivo do cancelamento (mín. 3 caracteres).' };
    }
    $set.cancelledBy = 'clinic';
    $set.cancelledByUserId = staff.id;
    $set.cancelReason = reason;
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

  const [clinic, treatment, doctor, patient] = await Promise.all([
    Clinic.findById(data.clinicId),
    TreatmentType.findById(original.treatmentTypeId).select(
      'name durationMin bufferMin',
    ),
    data.doctorId ? Doctor.findById(data.doctorId) : Promise.resolve(null),
    Patient.findById(original.patientId).select('name email consents'),
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
  const confirmToken = randomBytes(24).toString('base64url');
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
            // Remarcação é sempre ação de staff sobre marcação existente —
            // a estatística de origem interessa nas marcações NOVAS
            channel: 'front-desk',
            createdByUserId: staff.id,
            note: original.note,
            rescheduledFromId: original._id,
            confirmToken,
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
            cancelledByUserId: staff.id,
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

    // Notificar paciente (novo horário + botão de confirmação) e médico
    if (patient) {
      await notifyNewAppointment({
        appointmentId: newId,
        confirmToken,
        patient,
        doctor: doctor ? { _id: doctor._id, name: doctor.name } : null,
        clinicName: clinic.name,
        clinicAddress: clinic.address ?? null,
        treatmentName: treatment.name,
        startAt,
        timeLabel: data.start,
        note: original.note ?? null,
      });
    }

    revalidatePath('/admin/agenda');
    return { success: true, appointmentId: newId };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await session.endSession();
  }
}

// -----------------------------------------------------------------------------
// URGÊNCIA / WALK-IN (Fase 2, P5) — "pacientes que chegam à clínica sem
// marcação". Cria a marcação AGORA, já em 'checked-in' (o paciente está na
// sala de espera), sem validar disponibilidade: a receção decide encaixar.
// O médico é opcional (coluna "Sem médico" até ser atribuída).
// -----------------------------------------------------------------------------
const walkInSchema = z.object({
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
  note: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(500).nullable(),
  ),
});

export async function createWalkInAction(
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const parsed = walkInSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  await dbConnect();
  let staff;
  try {
    staff = await requireStaffForClinic(data.clinicId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const [clinic, patient, treatment, doctor] = await Promise.all([
    Clinic.findById(data.clinicId).select('isActive name'),
    Patient.findById(data.patientId).select('status name'),
    TreatmentType.findById(data.treatmentTypeId).select('name durationMin'),
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

  // Início = agora (arredondado ao minuto); duração do ato (sem buffer — é
  // um encaixe, o buffer não faz sentido)
  const now = new Date();
  now.setSeconds(0, 0);
  const endAt = new Date(
    now.getTime() + Math.max(10, treatment.durationMin) * 60_000,
  );

  const created = await Appointment.create({
    clinicId: data.clinicId,
    patientId: data.patientId,
    doctorId: data.doctorId,
    treatmentTypeId: data.treatmentTypeId,
    startAt: now,
    endAt,
    status: 'checked-in',
    channel: 'front-desk',
    createdByUserId: staff.id,
    note: data.note,
    isUrgent: true,
    confirmedAt: now,
    confirmedVia: 'front-desk',
    checkedInAt: now,
  });

  await logAudit({
    userId: staff.id,
    action: 'create',
    entityType: 'Appointment',
    entityId: String(created._id),
    patientId: data.patientId,
    clinicId: data.clinicId,
    summary: `URGÊNCIA (sem marcação): ${patient.name} — ${treatment.name}${doctor ? ` · ${doctor.name}` : ' · sem médico'}`,
  });

  revalidatePath('/admin/agenda');
  revalidatePath('/admin/sala-espera');
  revalidatePath('/doutor/dashboard');
  return { success: true, appointmentId: String(created._id) };
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
