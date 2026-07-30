// 📄 src/app/admin/layout.tsx
// =============================================================================
// CDC Manager — Layout da área Admin/Receção
// Placeholder funcional do Sprint 0: barra superior com identificação e
// logout. A sidebar completa (AdminSidebar) será construída no Sprint 1.
// =============================================================================

import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { logoutAction } from '@/actions/auth';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  return (
    <div className='min-h-screen' style={{ backgroundColor: '#F4F6FB' }}>
      <header
        className='flex items-center justify-between px-6 py-3'
        style={{ backgroundColor: '#1B2A6B' }}
      >
        <span className='text-sm font-bold' style={{ color: '#FFFFFF' }}>
          CDC Manager · Administração
        </span>
        <div className='flex items-center gap-4'>
          <span className='text-sm' style={{ color: '#C9D4FF' }}>
            {session?.user?.name}
          </span>
          <form action={logoutAction}>
            <button
              type='submit'
              className='rounded-lg px-3 py-1.5 text-xs font-semibold'
              style={{ backgroundColor: '#2743A6', color: '#FFFFFF' }}
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className='p-6'>{children}</main>
    </div>
  );
}
