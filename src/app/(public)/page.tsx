// 📄 src/app/(public)/page.tsx
// =============================================================================
// CDC Manager — Rota raiz (/)
// Redirect inteligente: sem sessão → /login; com sessão → área do role.
// No Sprint 2 esta rota dará lugar à página pública de marcação online.
// =============================================================================

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

const HOME_BY_ROLE: Record<string, string> = {
  admin: '/admin/dashboard',
  receptionist: '/admin/dashboard',
  doctor: '/doutor/dashboard',
  patient: '/conta',
};

export default async function RootPage() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(HOME_BY_ROLE[session.user.role] ?? '/login');
  }

  redirect('/login');
}
