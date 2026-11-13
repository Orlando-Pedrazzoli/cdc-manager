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
import Warehouse from '@/models/Warehouse';
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
import { phoneField } from '@/lib/validations/patient';
import { REFERRAL_SOURCES } from '@/lib/domain';
import { bookingBlockError } from '@/lib/booking-block';
import {
  createProvisionalPatient,
  findPatientByPhone,
} from '@/lib/provisional-patient';
import {
  PATIENT_SEARCH_SELECT,
  patientSearchOr,
  toPatientSearchHit,
  type PatientSearchHit,
} from '@/lib/patient-search';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// -----------------------------------------------------------------------------
// Tipos de estado
// -----------------------------------------------------------------------------
export type AppointmentFormState =
  | { error: string }
  | {
      success: true;
      appointmentId: string;
      /** 5.ª ronda/13: ficha provisória criada com a marcação */
      provisionalPatientId?: string;
    }
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

  // Revalidar conta e âmbito de clínicas na BD, não confiar apenas no JWT.
  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status clinicIds')
    .lean();
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== role ||
    !canOperateClinic(user, clinicId)
  ) {
    throw new Error('Sem permissões para esta clínica.');
  }
  return session.user;
}

const isObjectId = (v: string) => /^[0-9a-fA-F]{24}$/.test(v);

// -----------------------------------------------------------------------------
// Transições válidas (única fonte)
// -----------------------------------------------------------------------------
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // 6.ª ronda/06 (Victor, nov. 2026): o paciente que chega sem ter
  // confirmado é "lançado" para o médico num clique (pendente → chegou)
  pending: ['confirmed', 'checked-in', 'cancelled'],
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
// GABINETE (stock por local, set/2026)
// Devolve o roomId a gravar: o indicado (validado na clínica), ou o ÚNICO
// gabinete ativo da clínica (Buraca) quando nada foi indicado, ou null.
// `false` = roomId indicado não pertence à clínica.
// -----------------------------------------------------------------------------
async function resolveRoomId(
  clinicId: string,
  roomId: string | null,
): Promise<string | null | false> {
  const rooms = await Warehouse.find({
    clinicId,
    kind: 'operatory',
    active: true,
  })
    .select('_id')
    .lean();
  if (roomId) {
    return rooms.some(r => String(r._id) === roomId) ? roomId : false;
  }
  return rooms.length === 1 ? String(rooms[0]._id) : null;
}

export async function setAppointmentRoomAction(
  appointmentId: string,
  roomId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mongoose.isValidObjectId(appointmentId)) {
    return { ok: false, error: 'Marcação inválida.' };
  }
  await dbConnect();
  const appt = await Appointment.findById(appointmentId).select('clinicId');
  if (!appt) return { ok: false, error: 'Marcação não encontrada.' };
  try {
    await requireStaffForClinic(String(appt.clinicId));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const resolved = await resolveRoomId(String(appt.clinicId), roomId);
  if (resolved === false) return { ok: false, error: 'Gabinete inválido.' };
  await Appointment.updateOne(
    { _id: appt._id },
    { $set: { roomId: resolved } },
  );
  revalidatePath('/admin/agenda');
  return { ok: true };
}

// -----------------------------------------------------------------------------
// CRIAR MARCAÇÃO (balcão/admin)
// -----------------------------------------------------------------------------
const emptyToNullStr = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const createSchema = z.object({
  clinicId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  // 5.ª ronda/13: vazio quando é uma pré-marcação sem ficha (newFirstName…)
  patientId: z.preprocess(
    emptyToNullStr,
    z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Selecione o paciente')
      .nullable()
      .default(null),
  ),
  newFirstName: z.preprocess(
    emptyToNullStr,
    z.string().trim().min(2, 'Nome demasiado curto').max(60).nullable().default(null),
  ),
  newLastName: z.preprocess(
    emptyToNullStr,
    z.string().trim().min(2, 'Apelido demasiado curto').max(90).nullable().default(null),
  ),
  newPhone: phoneField.default(null),
  /** A receção confirmou que é outra pessoa com o mesmo telemóvel */
  samePhoneOk: z.preprocess(v => v === 'on' || v === 'true', z.boolean()),
  // 5.ª ronda/09: como nos conheceu
  referralSource: z.preprocess(
    emptyToNullStr,
    z.enum(REFERRAL_SOURCES).nullable().default(null),
  ),
  referralDetail: z.preprocess(
    emptyToNullStr,
    z.string().trim().max(120).nullable().default(null),
  ),
  doctorId: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .nullable(),
  ),
  treatmentTypeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Selecione o ato'),
  // Gabinete (Warehouse 'operatory'); vazio = auto (1 gabinete) ou depois
  roomId: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .nullable()
      .default(null),
  ),
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

  // 5.ª ronda/13: pré-marcação — sem ficha escolhida, exige nome, apelido
  // e telemóvel
  const isPreBooking = !data.patientId;
  if (isPreBooking && !(data.newFirstName && data.newLastName && data.newPhone)) {
    return {
      error:
        'Selecione o paciente ou, para quem ainda não tem ficha, indique nome, apelido e telemóvel.',
    };
  }

  // Referências têm de existir e estar ativas
  const [clinic, existingPatient, treatment, doctor] = await Promise.all([
    Clinic.findById(data.clinicId),
    data.patientId
      ? Patient.findById(data.patientId).select(
          'status name email consents referralSource bookingBlockedAt bookingBlockReason',
        )
      : Promise.resolve(null),
    TreatmentType.findById(data.treatmentTypeId).select(
      'name durationMin bufferMin',
    ),
    data.doctorId ? Doctor.findById(data.doctorId) : Promise.resolve(null),
  ]);
  if (!clinic || !clinic.isActive) return { error: 'Clínica inválida.' };
  const roomId = await resolveRoomId(data.clinicId, data.roomId);
  if (roomId === false)
    return { error: 'Gabinete inválido para esta clínica.' };
  if (!isPreBooking && (!existingPatient || existingPatient.status !== 'active')) {
    return { error: 'Paciente inválido ou inativo.' };
  }
  // 7.ª ronda/B4: paciente bloqueado pela gestão não pode ser marcado
  const blockedCreate = bookingBlockError(existingPatient);
  if (blockedCreate) return { error: blockedCreate };
  if (!treatment) return { error: 'Ato inválido.' };
  if (data.doctorId && (!doctor || !doctor.active)) {
    return { error: 'Médico inválido ou inativo.' };
  }
  if (isPreBooking && !data.samePhoneOk) {
    const dup = await findPatientByPhone(data.newPhone as string);
    if (dup) {
      return {
        error: `Já existe uma ficha com este telemóvel: ${dup.name} (${dup.processNumber != null ? `processo nº ${dup.processNumber}` : 'pré-marcação, ainda sem n.º'}). Escolha-a na pesquisa ou marque "É outra pessoa" para criar uma nova.`,
      };
    }
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

  // Pré-marcação: a ficha provisória nasce aqui, depois de todas as
  // validações que não dependem da transação; se a marcação falhar (horário
  // ocupado entretanto), a ficha é removida no catch.
  let provisionalPatientId: string | null = null;
  let patient: {
    _id: mongoose.Types.ObjectId;
    name: string;
    email?: string | null;
    consents?: { remindersAt?: Date | null } | null;
  };
  if (isPreBooking) {
    try {
      const created = await createProvisionalPatient({
        firstName: data.newFirstName as string,
        lastName: data.newLastName as string,
        phone: data.newPhone as string,
        referralSource: data.referralSource,
        referralDetail: data.referralDetail,
      });
      provisionalPatientId = created.id;
      patient = {
        _id: new mongoose.Types.ObjectId(created.id),
        name: created.name,
      };
    } catch (e) {
      console.error('[appointments] ficha provisória falhou:', e);
      return { error: 'Não foi possível registar o paciente. Tente novamente.' };
    }
  } else {
    patient = existingPatient!;
  }
  const patientId = String(patient._id);

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
            patientId,
            doctorId: data.doctorId,
            treatmentTypeId: data.treatmentTypeId,
            roomId,
            startAt,
            endAt,
            status: 'pending',
            channel: data.channel,
            createdByUserId: staff.id,
            note: data.note,
            referralSource: data.referralSource,
            referralDetail: data.referralDetail,
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
      patientId,
      clinicId: data.clinicId,
      summary: `Marcação criada: ${treatment.name} a ${data.date} ${data.start}${isPreBooking ? ' (pré-marcação, ficha por completar)' : ''}`,
    });
    // Uma cancelada que ainda estava à vista neste horário sai da grelha:
    // "só sai dali quando se vai marcar outra pessoa" (Victor, 12/11/2026).
    // Fica registado quem a tirou; continua na caixa "Canceladas".
    if (data.doctorId) {
      await Appointment.updateMany(
        {
          doctorId: data.doctorId,
          clinicId: data.clinicId,
          status: 'cancelled',
          removedFromGridAt: null,
          startAt: { $lt: endAt },
          endAt: { $gt: startAt },
        },
        {
          $set: {
            removedFromGridAt: new Date(),
            removedFromGridByUserId: staff.id,
          },
        },
      ).catch(() => undefined);
    }
    // Como nos conheceu: fica na ficha na primeira vez que é indicado
    if (
      !isPreBooking &&
      data.referralSource &&
      !existingPatient?.referralSource
    ) {
      await Patient.updateOne(
        { _id: patient._id },
        {
          $set: {
            referralSource: data.referralSource,
            referralDetail: data.referralDetail,
          },
        },
      ).catch(() => undefined);
    }

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
    return {
      success: true,
      appointmentId,
      ...(provisionalPatientId ? { provisionalPatientId } : {}),
    };
  } catch (e) {
    // A marcação não ficou criada → não deixar a ficha provisória órfã
    if (provisionalPatientId) {
      const hasAppt = await Appointment.exists({ patientId: provisionalPatientId });
      if (!hasAppt) {
        await Patient.deleteOne({
          _id: provisionalPatientId,
          provisional: true,
        }).catch(() => undefined);
      }
    }
    return { error: (e as Error).message };
  } finally {
    await session.endSession();
  }
}

// -----------------------------------------------------------------------------
// OBSERVAÇÕES DA MARCAÇÃO (5.ª ronda/01, Victor, nov. 2026)
// "Acrescentar uma caixa Observações na janela da marcação, que apareça
// também na linha da marcação na agenda." A observação já existia (campo
// `note`, mostrado no cartão) mas só se escrevia ao criar; passa a poder
// ser lida e alterada em qualquer altura, em qualquer estado.
// -----------------------------------------------------------------------------
export async function updateAppointmentNoteAction(
  appointmentId: string,
  note: string,
): Promise<{ error?: string; note?: string | null }> {
  if (!isObjectId(appointmentId)) return { error: 'Marcação inválida.' };
  const clean = (typeof note === 'string' ? note : '').trim();
  if (clean.length > 500) {
    return { error: 'Observação demasiado longa (máx. 500 caracteres).' };
  }

  await dbConnect();
  const appt = await Appointment.findById(appointmentId).select(
    'clinicId patientId note',
  );
  if (!appt) return { error: 'Marcação não encontrada.' };

  let staff;
  try {
    staff = await requireStaffForClinic(String(appt.clinicId));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const next = clean === '' ? null : clean;
  if ((appt.note ?? null) === next) return { note: next };

  await Appointment.updateOne({ _id: appt._id }, { $set: { note: next } });
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Appointment',
    entityId: appointmentId,
    patientId: String(appt.patientId),
    clinicId: String(appt.clinicId),
    summary: next ? 'Observação da marcação alterada' : 'Observação da marcação removida',
    changedFields: ['note'],
  });
  revalidatePath('/admin/agenda');
  revalidatePath('/doutor/agenda');
  return { note: next };
}

// -----------------------------------------------------------------------------
// RETIRAR UMA CANCELADA DA GRELHA (Victor, áudio de 12/11/2026)
// "Recebemos uma ligação de alguém que quer marcar para hoje no mesmo
// horário. Aí sim, a rececionista vai lá, tira aquela marcação e marca uma
// nova. Quando ela tirou da agenda, já fica registado naquele campo."
// Não apaga nada: a marcação continua cancelada, com motivo e autor; só
// deixa de ocupar o lugar na grelha e fica na caixa por baixo do calendário.
// -----------------------------------------------------------------------------
export async function removeCancelledFromGridAction(
  appointmentId: string,
): Promise<{ error?: string }> {
  if (!isObjectId(appointmentId)) return { error: 'Marcação inválida.' };

  await dbConnect();
  const appt = await Appointment.findById(appointmentId).select(
    'clinicId patientId status removedFromGridAt',
  );
  if (!appt) return { error: 'Marcação não encontrada.' };
  if (appt.status !== 'cancelled') {
    return { error: 'Só uma marcação cancelada pode ser retirada da agenda.' };
  }

  let staff;
  try {
    staff = await requireStaffForClinic(String(appt.clinicId));
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (appt.removedFromGridAt) return {};

  await Appointment.updateOne(
    { _id: appt._id },
    {
      $set: {
        removedFromGridAt: new Date(),
        removedFromGridByUserId: staff.id,
      },
    },
  );
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Appointment',
    entityId: appointmentId,
    patientId: String(appt.patientId),
    clinicId: String(appt.clinicId),
    summary: 'Marcação cancelada retirada da grelha (horário libertado)',
    changedFields: ['removedFromGridAt'],
  });
  revalidatePath('/admin/agenda');
  revalidatePath('/doutor/agenda');
  return {};
}

// -----------------------------------------------------------------------------
// TRANSIÇÃO DE ESTADO (confirmar, check-in, iniciar, concluir, falta)
// -----------------------------------------------------------------------------
export async function transitionAppointmentAction(
  appointmentId: string,
  to: AppointmentStatus,
  options?: {
    cancelReason?: string;
    /** Quem cancelou: o paciente ou a clínica (por omissão, a clínica) */
    cancelledBy?: 'patient' | 'clinic';
  },
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
    // "paciente cancelou" vs cancelado pela clínica — conta para o
    // histórico de faltas do paciente (lib/attendance.ts)
    $set.cancelledBy = options?.cancelledBy === 'patient' ? 'patient' : 'clinic';
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
// ANULAR A CHEGADA (7.ª ronda/A5 — Victor, 12/11/2026)
// "Poder cancelar o envio para a sala de espera: o médico está atrasado, o
// paciente não pode esperar e prefere remarcar." Chegou → volta a confirmada
// (ou a pendente, se nunca tinha sido confirmada) e sai da sala de espera do
// médico. A hora de chegada é limpa; fica no registo de auditoria quem anulou.
// -----------------------------------------------------------------------------
export async function undoCheckInAction(
  appointmentId: string,
): Promise<{ error?: string }> {
  if (!isObjectId(appointmentId)) return { error: 'Marcação inválida.' };

  await dbConnect();
  const appt = await Appointment.findById(appointmentId).select(
    'status clinicId patientId confirmedAt',
  );
  if (!appt) return { error: 'Marcação não encontrada.' };

  let staff;
  try {
    staff = await requireStaffForClinic(String(appt.clinicId));
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (appt.status !== 'checked-in') {
    return {
      error: 'Só se anula a chegada de quem está na sala de espera.',
    };
  }

  const back: AppointmentStatus = appt.confirmedAt ? 'confirmed' : 'pending';
  // Filtro com o estado: se o médico entretanto chamou o paciente, não mexe
  const res = await Appointment.updateOne(
    { _id: appointmentId, status: 'checked-in' },
    { $set: { status: back, checkedInAt: null } },
  );
  if (res.modifiedCount === 0) {
    return { error: 'O médico já chamou este paciente.' };
  }
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Appointment',
    entityId: appointmentId,
    patientId: String(appt.patientId),
    clinicId: String(appt.clinicId),
    summary: `Chegada anulada: checked-in → ${back}`,
    changedFields: ['status', 'checkedInAt'],
  });

  revalidatePath('/admin/agenda');
  revalidatePath('/admin/sala-espera');
  revalidatePath('/doutor/dashboard');
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
  // Fase 4B (P3): encaixe fora do horário do médico — decisão da receção.
  // Continua a impedir sobreposição com outra marcação.
  force: z.preprocess(
    v => v === 'on' || v === 'true',
    z.boolean().default(false),
  ),
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
  // 7.ª ronda/A5: quem já está na sala de espera também pode ser remarcado
  // ("o paciente não pode esperar e prefere remarcar")
  if (!['pending', 'confirmed', 'checked-in'].includes(original.status)) {
    return {
      error:
        'Só marcações pendentes, confirmadas ou na sala de espera podem ser remarcadas.',
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
    Patient.findById(original.patientId).select(
      'name email consents bookingBlockedAt bookingBlockReason',
    ),
  ]);
  if (!clinic || !clinic.isActive) return { error: 'Clínica inválida.' };
  const blockedResched = bookingBlockError(patient);
  if (blockedResched) return { error: blockedResched };
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
  if (doctor && !data.force) {
    const ranges = workingRangesForDate(doctor, clinic, data.date);
    const fits = ranges.some(
      r => startMin >= r.start && startMin + totalMin <= r.end,
    );
    if (!fits) {
      return {
        error:
          'Fora do horário do médico nesta clínica. Marque "Encaixar fora do horário" para forçar.',
      };
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
// ALTERAR DURAÇÃO (apontamento 01 da 2.ª reunião) — "depois de criada a
// marcação, não é possível estender o horário do paciente na agenda".
// Move só o endAt, em passos de 15 min; nunca toca no startAt (para isso há
// a remarcação). Estender re-verifica sobreposição/capacidade APENAS na
// janela acrescentada, dentro de transação, como as outras escritas.
// Encurtar nunca conflitua. Não impõe o horário do médico: tal como o
// walk-in, encaixar fora do horário é decisão da receção — o que se garante
// é que não pisa outra marcação.
// -----------------------------------------------------------------------------
const DURATION_STEP_MIN = 15; // o cliente usa os mesmos passos (AgendaGrid)
const DURATION_MIN_MIN = 15;
const DURATION_MAX_MIN = 8 * 60;
const DURATION_EDITABLE: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'checked-in',
  'in-progress',
];

export async function updateAppointmentDurationAction(
  appointmentId: string,
  deltaMin: number,
): Promise<{ error?: string; end?: string; durationMin?: number }> {
  if (!isObjectId(appointmentId)) return { error: 'Marcação inválida.' };
  if (
    !Number.isInteger(deltaMin) ||
    deltaMin === 0 ||
    deltaMin % DURATION_STEP_MIN !== 0 ||
    Math.abs(deltaMin) > 4 * 60
  ) {
    return { error: 'Alteração de duração inválida.' };
  }

  await dbConnect();
  const appt = await Appointment.findById(appointmentId).select(
    'status clinicId patientId doctorId startAt endAt',
  );
  if (!appt) return { error: 'Marcação não encontrada.' };
  if (!DURATION_EDITABLE.includes(appt.status as AppointmentStatus)) {
    return { error: 'Só marcações ativas podem mudar de duração.' };
  }

  let staff;
  try {
    staff = await requireStaffForClinic(String(appt.clinicId));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const oldEnd = appt.endAt as Date;
  const start = appt.startAt as Date;
  const newEnd = new Date(oldEnd.getTime() + deltaMin * 60_000);
  const newDuration = Math.round((newEnd.getTime() - start.getTime()) / 60_000);
  if (newDuration < DURATION_MIN_MIN) {
    return { error: `A marcação não pode ter menos de ${DURATION_MIN_MIN} min.` };
  }
  if (newDuration > DURATION_MAX_MIN) {
    return { error: 'Duração demasiado longa — use uma nova marcação.' };
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (deltaMin > 0) {
        // Só a janela acrescentada [oldEnd, newEnd) pode conflituar
        const free = await isSlotAvailable({
          clinicId: String(appt.clinicId),
          doctorId: appt.doctorId ? String(appt.doctorId) : null,
          startAt: oldEnd,
          endAt: newEnd,
          session,
          excludeAppointmentId: appointmentId,
        });
        if (!free.ok) {
          throw new Error(
            free.reason === 'doctor-busy'
              ? 'O médico já tem outra marcação a seguir — não é possível estender.'
              : 'A clínica está com a capacidade cheia nesse horário.',
          );
        }
      }
      // Atualização condicionada: se entretanto alguém mudou o fim, abortar
      const res = await Appointment.updateOne(
        { _id: appt._id, endAt: oldEnd, status: { $in: DURATION_EDITABLE } },
        { $set: { endAt: newEnd } },
        { session },
      );
      if (res.modifiedCount !== 1) {
        throw new Error('A marcação foi alterada entretanto — recarregue.');
      }
    });
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await session.endSession();
  }

  const endLabel = lisbonHhmm(newEnd);
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Appointment',
    entityId: appointmentId,
    patientId: String(appt.patientId),
    clinicId: String(appt.clinicId),
    summary: `Duração ${deltaMin > 0 ? '+' : ''}${deltaMin} min → termina às ${endLabel} (${newDuration} min)`,
    changedFields: ['endAt'],
  });

  revalidatePath('/admin/agenda');
  revalidatePath('/doutor/agenda');
  revalidatePath('/admin/sala-espera');
  return { end: endLabel, durationMin: newDuration };
}

const lisbonHhmmFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Lisbon',
});
function lisbonHhmm(d: Date): string {
  return lisbonHhmmFmt.format(d);
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
    Patient.findById(data.patientId).select(
      'status name bookingBlockedAt bookingBlockReason',
    ),
    TreatmentType.findById(data.treatmentTypeId).select('name durationMin'),
    data.doctorId ? Doctor.findById(data.doctorId) : Promise.resolve(null),
  ]);
  if (!clinic || !clinic.isActive) return { error: 'Clínica inválida.' };
  if (!patient || patient.status !== 'active') {
    return { error: 'Paciente inválido ou inativo.' };
  }
  const blockedWalkIn = bookingBlockError(patient);
  if (blockedWalkIn) return { error: blockedWalkIn };
  if (!treatment) return { error: 'Ato inválido.' };
  if (data.doctorId && (!doctor || !doctor.active)) {
    return { error: 'Médico inválido ou inativo.' };
  }

  // Início = agora (arredondado ao minuto); duração do ato (sem buffer — é
  // um encaixe, o buffer não faz sentido). Atos importados do legado podem
  // não ter duração validada → nunca deixar NaN chegar ao endAt.
  const now = new Date();
  now.setSeconds(0, 0);
  const durationMin = Number(treatment.durationMin);
  const effectiveMin = Number.isFinite(durationMin)
    ? Math.max(10, durationMin)
    : 30;
  const endAt = new Date(now.getTime() + effectiveMin * 60_000);

  // Token de confirmação como nas outras criações: mantém o documento
  // uniforme (link /confirmar/[token] resolve para "já confirmada") e evita
  // colisões no índice único de confirmToken.
  const confirmToken = randomBytes(24).toString('base64url');

  // Tudo o que toca a BD fica dentro do try: um erro de validação/índice
  // tem de voltar ao modal como mensagem, nunca como página de erro.
  try {
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
      confirmToken,
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
  } catch (e) {
    console.error('[createWalkInAction]', e);
    return {
      error:
        'Não foi possível registar a urgência. Tente novamente; se persistir, contacte o suporte.',
    };
  }
}

// -----------------------------------------------------------------------------
// PESQUISA DE PACIENTE para os pickers (agenda, walk-in, laboratório) — top 8.
// Mesmo filtro e mesmo resultado do header (lib/patient-search): foto, NIF,
// utente, telemóvel e nascimento para distinguir homónimos (apontamento 02).
// -----------------------------------------------------------------------------
export async function findPatientsAction(
  q: string,
): Promise<PatientSearchHit[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return [];
  }
  const or = patientSearchOr(q);
  if (or.length === 0) return [];

  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status')
    .lean();
  if (!user || user.status !== 'active' || user.role !== role) {
    return [];
  }

  const patients = await Patient.find({ status: 'active', $or: or })
    .sort({ processNumber: -1 })
    .limit(8)
    .select(PATIENT_SEARCH_SELECT)
    .lean();

  return patients.map(toPatientSearchHit);
}
