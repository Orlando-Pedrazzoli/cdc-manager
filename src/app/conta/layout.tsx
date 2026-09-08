// 📄 src/app/conta/layout.tsx
// =============================================================================
// CDC Manager — Layout do Portal do Paciente (v2)
// -----------------------------------------------------------------------------
// Header com identidade + sessão, navegação por tabs (PortalNav) e conteúdo
// centrado a 640px — mobile-first: o paciente acede quase sempre pelo
// telemóvel. O RBAC de acesso a /conta vive no middleware (auth.config);
// este layout assume sessão de paciente válida.
// =============================================================================

import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { logoutAction } from '@/actions/auth';
import PortalNav from '@/components/portal/PortalNav';

export default async function PatientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  const firstName = (session?.user?.name ?? '').split(' ')[0];

  return (
    <div className='min-h-screen' style={{ backgroundColor: '#F4F6FB' }}>
      <header
        className='flex items-center justify-between px-4 py-3'
        style={{ backgroundColor: '#1B2A6B' }}
      >
        <span className='text-sm font-bold' style={{ color: '#FFFFFF' }}>
          Centro Dentário Colombo
        </span>
        <div className='flex items-center gap-3'>
          <span className='text-sm' style={{ color: '#C9D4FF' }}>
            {firstName}
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
      <PortalNav />
      <main style={{ padding: '20px 16px 40px' }}>{children}</main>
    </div>
  );
}
