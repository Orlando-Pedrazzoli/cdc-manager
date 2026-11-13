// 📄 src/actions/agenda.ts
// =============================================================================
// CDC Manager — Server Actions: apoio à agenda (leitura)
// -----------------------------------------------------------------------------
// getFreeSlotsAction: slots livres de um médico para o modal de nova
// marcação (chamado quando médico+ato+data estão escolhidos). Balcão →
// onlineRules: false (a receção não está sujeita à antecedência mínima).
// =============================================================================

'use server';

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import {
  computeFreeSlots,
  minToHhmm,
  workingRangesForDate,
} from '@/lib/availability';
import Appointment from '@/models/Appointment';
import Clinic from '@/models/Clinic';
import Doctor from '@/models/Doctor';
import User, { canOperateClinic } from '@/models/User';

export async function getFreeSlotsAction(params: {
  clinicId: string;
  doctorId: string;
  treatmentTypeId: string;
  date: string; // 'YYYY-MM-DD'
}): Promise<{ start: string }[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return [];
  }
  const ok =
    /^[0-9a-fA-F]{24}$/.test(params.clinicId) &&
    /^[0-9a-fA-F]{24}$/.test(params.doctorId) &&
    /^[0-9a-fA-F]{24}$/.test(params.treatmentTypeId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.date);
  if (!ok) return [];

  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status clinicIds')
    .lean();
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== role ||
    !canOperateClinic(user, params.clinicId)
  ) {
    return [];
  }
  const slots = await computeFreeSlots({
    clinicId: params.clinicId,
    doctorId: params.doctorId,
    treatmentTypeId: params.treatmentTypeId,
    dateFrom: params.date,
    dateTo: params.date,
    onlineRules: false, // balcão
  });
  return slots.map(s => ({ start: s.start }));
}

/**
 * 7.ª ronda/A4 (Victor, 12/11/2026): "ao remarcar, continuam a aparecer
 * horários que não estão disponíveis; só ao confirmar surge o aviso". A
 * janela de remarcação passa a pedir aqui os horários realmente livres do
 * médico escolhido, com a duração do ato da marcação original. O horário da
 * própria marcação não conta como ocupado.
 */
export async function getRescheduleSlotsAction(params: {
  appointmentId: string;
  clinicId: string;
  doctorId: string;
  date: string; // 'YYYY-MM-DD'
}): Promise<{ start: string }[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return [];
  }
  const ok =
    /^[0-9a-fA-F]{24}$/.test(params.appointmentId) &&
    /^[0-9a-fA-F]{24}$/.test(params.clinicId) &&
    /^[0-9a-fA-F]{24}$/.test(params.doctorId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.date);
  if (!ok) return [];

  await dbConnect();
  const [user, appt] = await Promise.all([
    User.findById(session.user.id).select('role status clinicIds').lean(),
    Appointment.findById(params.appointmentId)
      .select('clinicId treatmentTypeId')
      .lean(),
  ]);
  if (
    !user ||
    !appt ||
    user.status !== 'active' ||
    user.role !== role ||
    !canOperateClinic(user, params.clinicId) ||
    !canOperateClinic(user, String(appt.clinicId))
  ) {
    return [];
  }
  const slots = await computeFreeSlots({
    clinicId: params.clinicId,
    doctorId: params.doctorId,
    treatmentTypeId: String(appt.treatmentTypeId),
    dateFrom: params.date,
    dateTo: params.date,
    onlineRules: false,
    excludeAppointmentId: params.appointmentId,
  });
  return slots.map(s => ({ start: s.start }));
}

/**
 * 5.ª ronda/10 (Victor, nov. 2026): "ao escolher 20/11/2026, em Médico
 * aparecem apenas os médicos desse dia com os respetivos horários". O modal
 * de nova marcação pede esta lista sempre que a DATA muda — antes mostrava
 * os médicos do dia que estava aberto na agenda, mesmo com outra data
 * escolhida no modal.
 */
export async function getWorkingDoctorsAction(params: {
  clinicId: string;
  date: string; // 'YYYY-MM-DD'
}): Promise<{ id: string; name: string; hours: string }[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return [];
  }
  if (
    !/^[0-9a-fA-F]{24}$/.test(params.clinicId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(params.date)
  ) {
    return [];
  }

  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status clinicIds')
    .lean();
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== role ||
    !canOperateClinic(user, params.clinicId)
  ) {
    return [];
  }

  const [clinic, doctors] = await Promise.all([
    Clinic.findById(params.clinicId),
    Doctor.find({ active: true, 'clinicSchedules.clinicId': params.clinicId }),
  ]);
  if (!clinic || !clinic.isActive) return [];

  return doctors
    .map(d => {
      const ranges = workingRangesForDate(d, clinic, params.date);
      return {
        id: String(d._id),
        name: d.name,
        hours: ranges
          .map(r => `${minToHhmm(r.start)}–${minToHhmm(r.end)}`)
          .join(' · '),
      };
    })
    .filter(d => d.hours !== '')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}
