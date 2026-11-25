// 📄 src/actions/doctor-waiting.ts
// =============================================================================
// CDC Manager — Server Action: pacientes lançados à espera do médico
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 10, Victor, 17 e 18/11): "um botão luminoso, que chame a
// atenção do médico, a indicar que foi lançado um paciente novo e que precisa
// de o chamar".
//
// Só leitura, só para o médico com sessão válida e só as marcações DELE de
// hoje no estado 'checked-in' (a receção marcou "Chegou"). Devolve o mínimo:
// id da marcação, nome e hora de chegada. Chamada de 20 em 20 segundos pelo
// DoctorWaitingAlert, em qualquer página da área do médico.
// =============================================================================

'use server';

import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';

export interface WaitingPatient {
  appointmentId: string;
  name: string;
  /** Hora a que a receção marcou "Chegou" (ms); null em registos antigos */
  sinceMs: number | null;
}

export async function doctorWaitingAction(): Promise<{
  waiting: WaitingPatient[];
}> {
  try {
    const session = await getVerifiedSession(['doctor'] as const);
    const doctorId = session?.user?.doctorId;
    if (!doctorId) return { waiting: [] };

    const today = todayLisbon();
    const appts = await Appointment.find({
      doctorId,
      status: 'checked-in',
      startAt: {
        $gte: lisbonToUtc(today, 0),
        $lt: lisbonToUtc(today, 24 * 60),
      },
    })
      .select('patientId checkedInAt startAt')
      .sort({ checkedInAt: 1, startAt: 1 })
      .limit(20)
      .lean();
    if (appts.length === 0) return { waiting: [] };

    const patients = await Patient.find({
      _id: { $in: appts.map(a => a.patientId) },
    })
      .select('name')
      .lean();
    const nameById = new Map(patients.map(p => [String(p._id), p.name]));

    return {
      waiting: appts.map(a => ({
        appointmentId: String(a._id),
        name: nameById.get(String(a.patientId)) ?? 'Paciente',
        sinceMs: a.checkedInAt ? new Date(a.checkedInAt).getTime() : null,
      })),
    };
  } catch {
    // Falha de rede/BD: o alerta simplesmente não aparece nesta volta
    return { waiting: [] };
  }
}
