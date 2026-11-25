// 📄 src/app/(auth)/primeira-senha/page.tsx
// =============================================================================
// CDC Manager — Primeira senha (9.ª ronda, 25/11/2026)
// -----------------------------------------------------------------------------
// Para contas criadas pela gestão só com nome de utilizador e senha inicial
// (médicos sem email na clínica). Depois de entrar com a senha que recebeu,
// a pessoa escolhe aqui a sua; só então segue para a sua área.
// Server Component: confirma a sessão e que a troca está mesmo pendente.
// =============================================================================

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';
import { FirstPasswordForm } from '@/components/auth/FirstPasswordForm';

export const dynamic = 'force-dynamic';

const HOME_BY_ROLE: Record<string, string> = {
  admin: '/admin/dashboard',
  receptionist: '/admin/dashboard',
  doctor: '/doutor/dashboard',
  patient: '/conta',
};

export default async function FirstPasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('name username role status mustChangePassword')
    .lean();
  if (!user || user.status !== 'active') redirect('/login');
  if (!user.mustChangePassword) redirect(HOME_BY_ROLE[user.role] ?? '/login');

  return <FirstPasswordForm name={user.name} username={user.username ?? null} />;
}
