import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import User, { type UserRole } from '@/models/User';
import Doctor from '@/models/Doctor';

/**
 * Revalida no servidor a conta usada pela sessão JWT.
 * O middleware verifica o JWT, mas os seus dados podem ficar desatualizados
 * depois de uma conta ou perfil ser desativado na base de dados.
 */
export async function requireActiveSession(
  allowedRoles: readonly UserRole[],
) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const sessionUser = session.user;

  await dbConnect();

  const user = await User.findById(sessionUser.id)
    .select('role status doctorId patientId')
    .lean();

  if (
    !user ||
    user.status !== 'active' ||
    !allowedRoles.includes(user.role)
  ) {
    redirect('/login?error=AccessDenied');
  }

  if (user.role === 'doctor') {
    if (
      !user.doctorId ||
      !sessionUser.doctorId ||
      String(user.doctorId) !== sessionUser.doctorId
    ) {
      redirect('/login?error=AccessDenied');
    }

    const doctor = await Doctor.findOne({
      _id: user.doctorId,
      active: true,
    })
      .select('_id')
      .lean();

    if (!doctor) {
      redirect('/login?error=AccessDenied');
    }
  }

  if (
    user.role === 'patient' &&
    (!user.patientId ||
      !sessionUser.patientId ||
      String(user.patientId) !== sessionUser.patientId)
  ) {
    redirect('/login?error=AccessDenied');
  }

  return session;
}
