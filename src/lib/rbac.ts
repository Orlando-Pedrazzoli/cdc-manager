// 📄 src/lib/rbac.ts
// =============================================================================
// CDC Manager — Guards de RBAC partilhados entre actions
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { getVerifiedSession } from '@/lib/get-verified-session';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * O médico só acede a pacientes com quem tem uma relação de consulta.
 * A sessão e o estado atual da conta e do perfil médico são revalidados.
 */
export async function requireDoctorWithPatient(patientId: string) {
  const session = await getVerifiedSession(['doctor']);
  if (!session?.user?.doctorId) {
    throw new Error('Sem permissões.');
  }
  if (!OBJECT_ID.test(patientId)) throw new Error('Paciente inválido.');

  await dbConnect();

  const hasRelation = await Appointment.exists({
    doctorId: session.user.doctorId,
    patientId,
  });
  if (!hasRelation) throw new Error('Paciente não encontrado.');

  return { userId: session.user.id, doctorId: session.user.doctorId };
}
