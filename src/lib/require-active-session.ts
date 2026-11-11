import { redirect } from 'next/navigation';
import type { UserRole } from '@/models/User';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { auth } from '@/lib/auth';
import { isRequestOutsideClinic } from '@/lib/org-settings';

/**
 * Revalida a sessão contra o estado atual da conta na base de dados.
 * Usado nos layouts protegidos, onde a resposta adequada é redirecionar.
 */
export async function requireActiveSession(
  allowedRoles: readonly UserRole[],
) {
  const session = await getVerifiedSession(allowedRoles);

  // 5.ª ronda/14: fora da rede da clínica → mensagem própria no login
  if (!session?.user?.id) {
    const raw = await auth();
    if (raw?.user?.role && (await isRequestOutsideClinic(raw.user.role))) {
      redirect('/login?error=OutsideClinic');
    }
  }

  if (!session?.user?.id) {
    redirect('/login?error=AccessDenied');
  }

  return session;
}
