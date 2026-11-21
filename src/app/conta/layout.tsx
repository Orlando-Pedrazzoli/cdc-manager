// 📄 src/app/conta/layout.tsx
// =============================================================================
// CDC Manager — Layout do Portal do Paciente (v2)
// -----------------------------------------------------------------------------
// Header com identidade + sessão, navegação (PortalNav) e conteúdo centrado
// a 640px — mobile-first: o paciente acede quase sempre pelo telemóvel.
// O cabeçalho fica preso ao topo (.cdc-portal-top); no telemóvel a navegação
// é a barra fixa no fundo do ecrã, no computador são as tabs por baixo do
// cabeçalho. A estrutura responsiva vive no globals.css (.cdc-portal*). O RBAC de acesso a /conta vive no middleware (auth.config);
// este layout assume sessão de paciente válida.
// =============================================================================

import type { ReactNode } from 'react';
import { requireActiveSession } from '@/lib/require-active-session';
import { getOrganization } from '@/models/Organization';
import { logoutAction } from '@/actions/auth';
import PortalNav from '@/components/portal/PortalNav';

export default async function PatientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [session, org] = await Promise.all([
    requireActiveSession(['patient'] as const),
    getOrganization(),
  ]);
  const firstName = (session?.user?.name ?? '').split(' ')[0];

  return (
    <div className='cdc-portal' style={{ backgroundColor: '#F4F6FB' }}>
      <div className='cdc-portal-top'>
        <header
          className='flex items-center justify-between px-4 py-3'
          style={{ backgroundColor: org.primaryColor }}
        >
          <span
            className='text-sm font-bold'
            style={{
              color: '#FFFFFF',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {org.name}
          </span>
          <div className='flex items-center gap-3' style={{ flexShrink: 0 }}>
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
      </div>
      <main className='cdc-portal-main'>{children}</main>
    </div>
  );
}
