// 📄 src/actions/doctors.ts
// =============================================================================
// CDC Manager — Server Actions: Médicos
// -----------------------------------------------------------------------------
// CRUD de médicos + conta de acesso + exceções de agenda + comissões.
// RBAC: SÓ admin — comissões e horários são informação sensível da gerência
// (a receção consulta médicos via páginas, não gere).
//
// REGRA DE OURO nas mudanças de horário/exceções: marcações existentes NUNCA
// são alteradas nem canceladas automaticamente. O sistema DETETA as marcações
// futuras que ficam fora do novo horário e devolve o aviso — decidir
// (remarcar/contactar) é trabalho humano, com o paciente ao telefone.
//
// Conta do médico: User role 'doctor' + doctorId, criada 'invited' com código
// de ativação por email — o mesmo fluxo dos pacientes. O RBAC da área
// /doutor filtra tudo por esse doctorId (cada médico só vê o seu).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import Clinic from '@/models/Clinic';
import Appointment, { BLOCKING_STATUS } from '@/models/Appointment';
import TreatmentType from '@/models/TreatmentType';
import { createActivationCode } from '@/lib/activation';
import { sendActivationEmail } from '@/lib/resend';
import { logAudit } from '@/lib/audit';
import { workingRangesForDate, hhmmToMin } from '@/lib/availability';
import {
  createDoctorSchema,
  updateDoctorSchema,
  doctorExceptionSchema,
} from '@/lib/validations/doctor';

// -----------------------------------------------------------------------------
// Tipos de estado
// -----------------------------------------------------------------------------
export type DoctorFormState =
  | { error: string }
  | {
      success: true;
      doctorId: string;
      /** Nº de marcações futuras que ficaram fora do novo horário */
      conflictCount?: number;
      warning?: string;
      manualCode?: string;
    }
  | undefined;

// -----------------------------------------------------------------------------
// RBAC
// -----------------------------------------------------------------------------
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Apenas a administração pode gerir médicos.');
  }
  return session.user;
}

const isObjectId = (v: string) => /^[0-9a-fA-F]{24}$/.test(v);

// -----------------------------------------------------------------------------
// Deteção de conflitos: marcações futuras fora do horário efetivo
// -----------------------------------------------------------------------------
const TZ = 'Europe/Lisbon';
const CONFLICT_HORIZON_DAYS = 90;

/** Instante UTC → { date: 'YYYY-MM-DD', min } na parede de Lisboa */
function utcToLisbon(d: Date): { date: string; min: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    min: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

/**
 * Conta as marcações bloqueantes futuras (próx. 90 dias) do médico que já
 * NÃO cabem inteiras no horário efetivo (novo horário/exceções aplicadas).
 * Só leitura — nada é alterado.
 */
async function countScheduleConflicts(doctorId: string): Promise<number> {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) return 0;

  const now = new Date();
  const horizon = new Date(now.getTime() + CONFLICT_HORIZON_DAYS * 86_400_000);
  const appts = await Appointment.find({
    doctorId: doctor._id,
    status: { $in: BLOCKING_STATUS },
    startAt: { $gte: now, $lt: horizon },
  })
    .select('startAt endAt clinicId')
    .lean();
  if (appts.length === 0) return 0;

  // Cache de clínicas e de ranges por (clinicId, date)
  const clinicIds = [...new Set(appts.map(a => String(a.clinicId)))];
  const clinics = await Clinic.find({ _id: { $in: clinicIds } });
  const clinicById = new Map(clinics.map(c => [String(c._id), c]));
  const rangeCache = new Map<string, { start: number; end: number }[]>();

  let conflicts = 0;
  for (const a of appts) {
    const clinic = clinicById.get(String(a.clinicId));
    if (!clinic) continue;
    const s = utcToLisbon(a.startAt);
    const e = utcToLisbon(a.endAt);
    const key = `${a.clinicId}|${s.date}`;
    let ranges = rangeCache.get(key);
    if (!ranges) {
      ranges = workingRangesForDate(doctor, clinic, s.date);
      rangeCache.set(key, ranges);
    }
    // Cabe inteira num intervalo? (marcações não atravessam a meia-noite)
    const fits =
      s.date === e.date && ranges.some(r => s.min >= r.start && e.min <= r.end);
    if (!fits) conflicts++;
  }
  return conflicts;
}

// -----------------------------------------------------------------------------
// Convite da conta do médico
// -----------------------------------------------------------------------------
async function issueDoctorInvite(params: {
  doctorId: string;
  doctorName: string;
  email: string;
  adminUserId: string;
}): Promise<{ ok: true; manualCode?: string } | { error: string }> {
  const email = params.email.toLowerCase().trim();

  const existing = await User.findOne({ email });
  if (existing) {
    if (
      existing.role !== 'doctor' ||
      (existing.doctorId && existing.doctorId.toString() !== params.doctorId)
    ) {
      return { error: 'Esse email já pertence a outra conta.' };
    }
    if (existing.status === 'active') {
      return { error: 'Este médico já tem a conta ativa.' };
    }
    if (!existing.doctorId) {
      await User.updateOne(
        { _id: existing._id },
        { $set: { doctorId: params.doctorId } },
      );
    }
  } else {
    await User.create({
      name: params.doctorName,
      email,
      role: 'doctor',
      status: 'invited',
      doctorId: params.doctorId,
    });
  }

  const user = await User.findOne({ email }).select('_id');
  if (!user) return { error: 'Falha ao preparar a conta do médico.' };

  const { plainCode, expiresAt } = await createActivationCode({
    userId: user._id.toString(),
    purpose: 'account-activation',
    createdBy: params.adminUserId,
    sentVia: 'email',
  });
  const sent = await sendActivationEmail({
    to: email,
    name: params.doctorName,
    plainCode,
    expiresAt,
  });

  await logAudit({
    userId: params.adminUserId,
    action: 'create',
    entityType: 'ActivationCode',
    entityId: user._id.toString(),
    summary: sent.ok
      ? `Convite de conta enviado ao médico ${params.doctorName}`
      : `Convite do médico ${params.doctorName} criado; FALHA no email (${sent.error})`,
  });

  return sent.ok ? { ok: true } : { ok: true, manualCode: plainCode };
}

// -----------------------------------------------------------------------------
// CRIAR MÉDICO
// -----------------------------------------------------------------------------
export async function createDoctorAction(
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = createDoctorSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  if (data.sendActivationInvite && !data.email) {
    return { error: 'Para enviar o convite é necessário indicar o email.' };
  }

  await dbConnect();

  // As clínicas dos horários têm de existir e estar ativas
  const clinicIds = data.clinicSchedules.map(s => s.clinicId);
  const clinicCount = await Clinic.countDocuments({
    _id: { $in: clinicIds },
    isActive: true,
  });
  if (clinicCount !== clinicIds.length) {
    return { error: 'Clínica inválida nos horários.' };
  }

  const doctor = await Doctor.create({
    name: data.name,
    licenseNumber: data.licenseNumber,
    specialties: data.specialties,
    clinicSchedules: data.clinicSchedules,
    commissionRate: data.commissionRate,
    color: data.color,
    active: true,
  });

  await logAudit({
    userId: admin.id,
    action: 'create',
    entityType: 'Doctor',
    entityId: doctor._id.toString(),
    summary: `Médico criado: ${data.name}`,
  });

  let warning: string | undefined;
  let manualCode: string | undefined;
  if (data.sendActivationInvite && data.email) {
    const invite = await issueDoctorInvite({
      doctorId: doctor._id.toString(),
      doctorName: data.name,
      email: data.email,
      adminUserId: admin.id,
    });
    if ('error' in invite) {
      warning = invite.error;
    } else if (invite.manualCode) {
      manualCode = invite.manualCode;
      warning = 'O email do convite falhou — envie o código manualmente.';
    }
  }

  revalidatePath('/admin/medicos');
  return {
    success: true,
    doctorId: doctor._id.toString(),
    warning,
    manualCode,
  };
}

// -----------------------------------------------------------------------------
// ATUALIZAR MÉDICO (dados + horários; deteta conflitos após mudança)
// -----------------------------------------------------------------------------
export async function updateDoctorAction(
  doctorId: string,
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!isObjectId(doctorId)) return { error: 'Médico inválido.' };

  const parsed = updateDoctorSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  await dbConnect();
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) return { error: 'Médico não encontrado.' };

  const schedulesChanged = data.clinicSchedules !== undefined;
  if (schedulesChanged) {
    const clinicIds = data.clinicSchedules!.map(s => s.clinicId);
    const clinicCount = await Clinic.countDocuments({
      _id: { $in: clinicIds },
      isActive: true,
    });
    if (clinicCount !== clinicIds.length) {
      return { error: 'Clínica inválida nos horários.' };
    }
  }

  const $set: Record<string, unknown> = {};
  const changed: string[] = [];
  const map: Record<string, unknown> = {
    name: data.name,
    licenseNumber: data.licenseNumber,
    specialties: data.specialties,
    clinicSchedules: data.clinicSchedules,
    commissionRate: data.commissionRate,
    color: data.color,
  };
  for (const [k, v] of Object.entries(map)) {
    if (v !== undefined) {
      $set[k] = v;
      changed.push(k);
    }
  }
  if (changed.length > 0) {
    await Doctor.updateOne({ _id: doctor._id }, { $set });
    await logAudit({
      userId: admin.id,
      action: 'update',
      entityType: 'Doctor',
      entityId: doctorId,
      summary: `Médico atualizado: ${doctor.name}`,
      changedFields: changed,
    });
  }

  // Horários mudaram → detetar (SEM tocar) marcações que ficaram de fora
  let conflictCount: number | undefined;
  let warning: string | undefined;
  if (schedulesChanged) {
    conflictCount = await countScheduleConflicts(doctorId);
    if (conflictCount > 0) {
      warning = `${conflictCount} marcação(ões) futura(s) ficaram fora do novo horário — nada foi alterado; reveja a agenda do médico para remarcar.`;
    }
  }

  revalidatePath('/admin/medicos');
  revalidatePath(`/admin/medicos/${doctorId}`);
  return { success: true, doctorId, conflictCount, warning };
}

// -----------------------------------------------------------------------------
// EXCEÇÕES (férias / dia especial)
// -----------------------------------------------------------------------------
export async function addDoctorExceptionAction(
  doctorId: string,
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!isObjectId(doctorId)) return { error: 'Médico inválido.' };

  const parsed = doctorExceptionSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const ex = parsed.data;

  await dbConnect();
  const doctor = await Doctor.findById(doctorId).select('name exceptions');
  if (!doctor) return { error: 'Médico não encontrado.' };

  const duplicate = doctor.exceptions.some(
    e =>
      e.date === ex.date &&
      String(e.clinicId ?? '') === String(ex.clinicId ?? ''),
  );
  if (duplicate) {
    return {
      error:
        'Já existe uma exceção para essa data/clínica — remova-a primeiro.',
    };
  }

  await Doctor.updateOne(
    { _id: doctorId },
    {
      $push: {
        exceptions: {
          date: ex.date,
          clinicId: ex.clinicId,
          type: ex.type,
          ranges: ex.ranges,
          reason: ex.reason,
        },
      },
    },
  );
  await logAudit({
    userId: admin.id,
    action: 'update',
    entityType: 'Doctor',
    entityId: doctorId,
    summary: `Exceção adicionada (${ex.date}${ex.clinicId ? '' : ', ambas as clínicas'}): ${ex.type === 'unavailable' ? 'indisponível' : 'horário especial'}`,
    changedFields: ['exceptions'],
  });

  const conflictCount = await countScheduleConflicts(doctorId);
  revalidatePath(`/admin/medicos/${doctorId}`);
  return {
    success: true,
    doctorId,
    conflictCount,
    warning:
      conflictCount > 0
        ? `${conflictCount} marcação(ões) futura(s) em conflito com a exceção — reveja a agenda para remarcar.`
        : undefined,
  };
}

export async function removeDoctorExceptionAction(
  doctorId: string,
  date: string,
  clinicId: string | null,
): Promise<{ error?: string }> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!isObjectId(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Dados inválidos.' };
  }

  await dbConnect();
  await Doctor.updateOne(
    { _id: doctorId },
    { $pull: { exceptions: { date, clinicId: clinicId ?? null } } },
  );
  await logAudit({
    userId: admin.id,
    action: 'update',
    entityType: 'Doctor',
    entityId: doctorId,
    summary: `Exceção removida (${date})`,
    changedFields: ['exceptions'],
  });
  revalidatePath(`/admin/medicos/${doctorId}`);
  return {};
}

// -----------------------------------------------------------------------------
// COMISSÕES por ato (overrides)
// -----------------------------------------------------------------------------
export async function setCommissionOverridesAction(
  doctorId: string,
  _prev: DoctorFormState,
  formData: FormData,
): Promise<DoctorFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!isObjectId(doctorId)) return { error: 'Médico inválido.' };

  // JSON: [{ treatmentTypeId, ratePercent }] — só as linhas com override
  let rows: { treatmentTypeId: string; ratePercent: number }[];
  try {
    rows = JSON.parse(String(formData.get('overrides') ?? '[]'));
  } catch {
    return { error: 'Dados de comissões inválidos.' };
  }
  if (!Array.isArray(rows)) return { error: 'Dados de comissões inválidos.' };
  for (const r of rows) {
    if (
      !isObjectId(r.treatmentTypeId) ||
      typeof r.ratePercent !== 'number' ||
      r.ratePercent < 0 ||
      r.ratePercent > 100
    ) {
      return { error: 'Comissão inválida numa das linhas.' };
    }
  }
  const ids = rows.map(r => r.treatmentTypeId);
  if (new Set(ids).size !== ids.length) {
    return { error: 'Ato duplicado nas comissões.' };
  }

  await dbConnect();
  const validCount = await TreatmentType.countDocuments({ _id: { $in: ids } });
  if (validCount !== ids.length) {
    return { error: 'Ato inexistente nas comissões.' };
  }

  await Doctor.updateOne(
    { _id: doctorId },
    {
      $set: {
        commissionOverrides: rows.map(r => ({
          treatmentTypeId: r.treatmentTypeId,
          rate: r.ratePercent / 100,
        })),
      },
    },
  );
  await logAudit({
    userId: admin.id,
    action: 'update',
    entityType: 'Doctor',
    entityId: doctorId,
    summary: `Comissões por ato atualizadas (${rows.length} overrides)`,
    changedFields: ['commissionOverrides'],
  });

  revalidatePath(`/admin/medicos/${doctorId}`);
  return { success: true, doctorId };
}

// -----------------------------------------------------------------------------
// ATIVAR / DESATIVAR
// -----------------------------------------------------------------------------
export async function setDoctorActiveAction(
  doctorId: string,
  active: boolean,
): Promise<{ error?: string; futureAppointments?: number }> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!isObjectId(doctorId)) return { error: 'Médico inválido.' };

  await dbConnect();
  const doctor = await Doctor.findById(doctorId).select('name active');
  if (!doctor) return { error: 'Médico não encontrado.' };

  // Desativar com marcações futuras: informa (não bloqueia — decisão humana)
  let futureAppointments: number | undefined;
  if (!active) {
    futureAppointments = await Appointment.countDocuments({
      doctorId,
      status: { $in: BLOCKING_STATUS },
      startAt: { $gte: new Date() },
    });
  }

  await Doctor.updateOne({ _id: doctorId }, { $set: { active } });
  // A conta de acesso acompanha o estado do médico. Nuance: ao REATIVAR, só
  // contas 'disabled' voltam a 'active' — uma conta ainda 'invited' (nunca
  // ativou, sem password) tem de continuar 'invited', senão ficava "ativa"
  // sem password e o login partia-se
  if (active) {
    await User.updateOne(
      { doctorId, role: 'doctor', status: 'disabled' },
      { $set: { status: 'active' } },
    );
  } else {
    await User.updateOne(
      { doctorId, role: 'doctor', status: { $ne: 'invited' } },
      { $set: { status: 'disabled' } },
    );
  }
  await logAudit({
    userId: admin.id,
    action: active ? 'update' : 'delete',
    entityType: 'Doctor',
    entityId: doctorId,
    summary: active
      ? `Médico reativado: ${doctor.name}`
      : `Médico desativado: ${doctor.name}`,
    changedFields: ['active'],
  });

  revalidatePath('/admin/medicos');
  revalidatePath(`/admin/medicos/${doctorId}`);
  return { futureAppointments };
}
