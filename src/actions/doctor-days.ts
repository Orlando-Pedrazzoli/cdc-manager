// 📄 src/actions/doctor-days.ts
// =============================================================================
// CDC Manager — Server Action: abrir, fechar e repor dias da agenda de um médico
// -----------------------------------------------------------------------------
// Pedidos do Victor de 11/11/2026 (depois da 5.ª ronda):
//   1. "Poder voltar atrás caso precise fechar horários, não só abrir" —
//      reduzir ou fechar um período que foi aberto.
//   2. "Abrir a agenda de vários dias ao mesmo tempo, ou fechar, em vez de um
//      dia de cada vez."
// E a razão de fundo: a gestão quer gerir sozinha as trocas entre médicos e
// a agenda da Dra. Natacha (coberturas), sem depender de carregamentos.
//
// Tudo assenta nas EXCEÇÕES por data que o modelo já tinha (Doctor.exceptions):
//   · abrir  → exceção 'custom' com o horário indicado (substitui a escala
//               nesse dia; serve também para REDUZIR um horário)
//   · fechar → exceção 'unavailable' só nesta clínica
//   · repor  → remove a exceção: o dia volta à escala normal
// Uma única escrita para todos os dias escolhidos. Não mexe em marcações:
// devolve quantas ficam fora do horário, para a receção rever.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Doctor from '@/models/Doctor';
import Clinic from '@/models/Clinic';
import User, { canOperateClinic } from '@/models/User';
import Appointment, { BLOCKING_STATUS } from '@/models/Appointment';
import {
  hhmmToMin,
  todayLisbon,
  utcToLisbonParts,
  workingRangesForDate,
} from '@/lib/availability';

export type DoctorDaysMode = 'open' | 'close' | 'reset';

export interface DoctorDaysResult {
  error?: string;
  /** Dias efetivamente alterados */
  changed?: number;
  /** Marcações ativas que ficaram fora do horário nesses dias */
  conflicts?: number;
  /** Dias em que o médico está indisponível em todas as clínicas (férias) */
  blockedByAbsence?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const OID_RE = /^[0-9a-fA-F]{24}$/;
const MAX_DAYS = 400;

export async function setDoctorDaysAction(input: {
  doctorId: string;
  clinicId: string;
  dates: string[];
  mode: DoctorDaysMode;
  from?: string;
  until?: string;
}): Promise<DoctorDaysResult> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return { error: 'Sem permissões.' };
  }
  if (!OID_RE.test(input.doctorId) || !OID_RE.test(input.clinicId)) {
    return { error: 'Dados inválidos.' };
  }
  if (!['open', 'close', 'reset'].includes(input.mode)) {
    return { error: 'Ação inválida.' };
  }
  const today = todayLisbon();
  const dates = Array.from(new Set(input.dates ?? [])).sort();
  if (dates.length === 0) return { error: 'Escolha pelo menos um dia.' };
  if (dates.length > MAX_DAYS) {
    return { error: `No máximo ${MAX_DAYS} dias de cada vez.` };
  }
  if (dates.some(d => !DATE_RE.test(d))) return { error: 'Data inválida.' };
  if (dates.some(d => d < today)) {
    return { error: 'Não é possível alterar dias que já passaram.' };
  }
  let ranges: { start: string; end: string }[] = [];
  if (input.mode === 'open') {
    if (!TIME_RE.test(input.from ?? '') || !TIME_RE.test(input.until ?? '')) {
      return { error: 'Indique a hora de início e de fim.' };
    }
    if (hhmmToMin(input.from!) >= hhmmToMin(input.until!)) {
      return { error: 'A hora de fim tem de ser depois da de início.' };
    }
    ranges = [{ start: input.from!, end: input.until! }];
  }

  await dbConnect();
  const actor = await User.findById(session.user.id)
    .select('role status clinicIds')
    .lean();
  if (
    !actor ||
    actor.status !== 'active' ||
    actor.role !== role ||
    !canOperateClinic(actor, input.clinicId)
  ) {
    return { error: 'Sem permissões para esta clínica.' };
  }

  const [doctor, clinic] = await Promise.all([
    Doctor.findById(input.doctorId),
    Clinic.findById(input.clinicId),
  ]);
  if (!doctor || !clinic) return { error: 'Médico ou clínica inválidos.' };
  if (
    !doctor.clinicSchedules.some(
      cs => String(cs.clinicId) === String(clinic._id),
    )
  ) {
    return {
      error: `${doctor.name} não está associado a ${clinic.name}. Associe a clínica na ficha do médico primeiro.`,
    };
  }

  // Férias/baixa (exceção global "indisponível") ganham sempre a um horário
  // especial — avisar em vez de abrir um dia que continuaria fechado
  const absence = new Set(
    doctor.exceptions
      .filter(e => !e.clinicId && e.type === 'unavailable')
      .map(e => e.date),
  );
  const blockedByAbsence =
    input.mode === 'open' ? dates.filter(d => absence.has(d)).length : 0;

  // Uma escrita: tira as exceções desta clínica nesses dias e põe as novas
  await Doctor.updateOne(
    { _id: doctor._id },
    {
      $pull: {
        exceptions: { date: { $in: dates }, clinicId: clinic._id },
      },
    },
  );
  if (input.mode !== 'reset') {
    const reason =
      input.mode === 'open'
        ? `Horário ${input.from}–${input.until} definido na agenda`
        : 'Dia fechado na agenda';
    await Doctor.updateOne(
      { _id: doctor._id },
      {
        $push: {
          exceptions: {
            $each: dates.map(date => ({
              date,
              clinicId: clinic._id,
              type: input.mode === 'open' ? 'custom' : 'unavailable',
              ranges: input.mode === 'open' ? ranges : [],
              reason,
            })),
          },
        },
      },
    );
  }

  // Marcações ativas desses dias que ficam fora do horário resultante
  const fresh = await Doctor.findById(doctor._id);
  let conflicts = 0;
  if (fresh) {
    const dateSet = new Set(dates);
    const first = new Date(`${dates[0]}T00:00:00Z`);
    first.setUTCDate(first.getUTCDate() - 1);
    const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 2);
    const appts = await Appointment.find({
      doctorId: doctor._id,
      clinicId: clinic._id,
      status: { $in: BLOCKING_STATUS },
      startAt: { $gte: first, $lt: last },
    })
      .select('startAt')
      .lean();
    for (const a of appts) {
      const s = utcToLisbonParts(a.startAt);
      if (!dateSet.has(s.dateStr)) continue;
      const day = workingRangesForDate(fresh, clinic, s.dateStr);
      if (!day.some(r => s.min >= r.start && s.min < r.end)) conflicts++;
    }
  }

  const what =
    input.mode === 'open'
      ? `aberto ${input.from}–${input.until}`
      : input.mode === 'close'
        ? 'fechado'
        : 'reposto na escala normal';
  await logAudit({
    userId: session.user.id,
    action: 'update',
    entityType: 'Doctor',
    entityId: String(doctor._id),
    clinicId: String(clinic._id),
    summary:
      dates.length === 1
        ? `Agenda de ${dates[0]} em ${clinic.name}: ${what}`
        : `Agenda em ${clinic.name}: ${dates.length} dias (${dates[0]} a ${dates[dates.length - 1]}) — ${what}`,
    changedFields: ['exceptions'],
  });

  revalidatePath('/admin/agenda');
  revalidatePath(`/admin/medicos/${String(doctor._id)}`);
  return { changed: dates.length, conflicts, blockedByAbsence };
}
