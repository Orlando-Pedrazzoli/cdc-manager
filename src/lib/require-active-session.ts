import { redirect } from 'next/navigation';
import type { UserRole } from '@/models/User';
import { getVerifiedSession } from '@/lib/get-verified-session';

/**
 * Revalida a sessão contra o estado atual da conta na base de dados.
 * Usado nos layouts protegidos, onde a resposta adequada é redirecionar.
 */
export async function requireActiveSession(
  allowedRoles: readonly UserRole[],
) {
  const session = await getVerifiedSession(allowedRoles);

  if (!session?.user?.id) {
    redirect('/login?error=AccessDenied');
  }

  return session;
}
