import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import User, { type UserRole } from '@/models/User';
import Doctor from '@/models/Doctor';

/**
 * Valida a sessão JWT contra o estado atual da conta na base de dados.
 * Retorna null para sessões ausentes, desativadas ou com perfil inconsistente.
 */
export async function getVerifiedSession(allowedRoles: readonly UserRole[]) {
  const session = await auth();
  if (!session?.user?.id) return null;

  await dbConnect();

  const user = await User.findById(session.user.id)
    .select('role status doctorId patientId')
    .lean();

  if (!user || user.status !== 'active' || !allowedRoles.includes(user.role)) {
    return null;
  }

  if (user.role === 'doctor') {
    if (
      !user.doctorId ||
      !session.user.doctorId ||
      String(user.doctorId) !== session.user.doctorId
    ) {
      return null;
    }

    const doctor = await Doctor.exists({ _id: user.doctorId, active: true });
    if (!doctor) return null;
  }

  if (
    user.role === 'patient' &&
    (!user.patientId ||
      !session.user.patientId ||
      String(user.patientId) !== session.user.patientId)
  ) {
    return null;
  }

  return session;
}
