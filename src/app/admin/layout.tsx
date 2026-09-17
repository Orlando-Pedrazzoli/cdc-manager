// 📄 src/app/admin/layout.tsx
// =============================================================================
// CDC Manager — Layout da área Admin/Receção
// -----------------------------------------------------------------------------
// Server Component: lê a sessão e entrega ao AppShell (client) os nós já
// renderizados — barra superior (pesquisa + utilizador + Sair) e rodapé do
// drawer mobile. O shell trata do responsivo (sidebar fixa ≥1024px, drawer
// abaixo). O RBAC de rota (/admin só para admin/receptionist) é imposto no
// proxy — este layout assume sessão válida e só a apresenta.
// =============================================================================

import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { logoutAction } from '@/actions/auth';
import { AppShell } from '@/components/layout/AppShell';
import { QuickPatientSearch } from '@/components/layout/QuickPatientSearch';
import { getOrganization } from '@/models/Organization';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administração',
  receptionist: 'Receção',
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [session, org] = await Promise.all([auth(), getOrganization()]);
  const brand = {
    appName: org.appName,
    logoUrl: org.logoUrl,
    primaryColor: org.primaryColor,
  };
  const name = session?.user?.name ?? '';
  const roleLabel = ROLE_LABEL[session?.user?.role ?? ''] ?? '';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');

  const topbar = (
    <>
      <QuickPatientSearch />
      <div
        className='cdc-topbar-user'
        style={{ alignItems: 'center', gap: '16px', flexShrink: 0 }}
      >
        <div style={{ textAlign: 'right' }}>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 600,
              color: '#1B2A6B',
              lineHeight: 1.3,
            }}
          >
            {name}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
            {roleLabel}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type='submit'
            style={{
              borderRadius: '8px',
              border: '1px solid #D8DEEF',
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#1B2A6B',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            Sair
          </button>
        </form>
      </div>
    </>
  );

  const drawerFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span
        aria-hidden='true'
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '999px',
          backgroundColor: '#2743A6',
          color: '#FFFFFF',
          fontSize: '13px',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials || '·'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: '#FFFFFF',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: '#8FA0DC' }}>
          {roleLabel}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type='submit'
          style={{
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.25)',
            padding: '7px 12px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </form>
    </div>
  );

  return (
    <AppShell
      area='admin'
      brand={brand}
      topbar={topbar}
      drawerFooter={drawerFooter}
    >
      {children}
    </AppShell>
  );
}
