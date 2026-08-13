// 📄 src/app/admin/layout.tsx
// =============================================================================
// CDC Manager — Layout da área Admin/Receção
// -----------------------------------------------------------------------------
// Substitui o placeholder do Sprint 0: sidebar de navegação (AdminSidebar) +
// barra superior com identificação do utilizador e logout. O RBAC de rota
// (/admin só para admin/receptionist) é imposto no proxy — este layout
// assume sessão válida e só a apresenta.
// =============================================================================

import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { logoutAction } from '@/actions/auth';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { QuickPatientSearch } from '@/components/layout/QuickPatientSearch';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administração',
  receptionist: 'Receção',
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  const name = session?.user?.name ?? '';
  const roleLabel = ROLE_LABEL[session?.user?.role ?? ''] ?? '';

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#F4F6FB',
      }}
    >
      <AdminSidebar />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Barra superior: pesquisa de paciente (o gesto nº 1 do balcão,
            disponível em qualquer página) + identificação e logout */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '12px 24px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #EEF1F8',
          }}
        >
          <QuickPatientSearch />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexShrink: 0,
            }}
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
        </header>

        <main style={{ flex: 1, padding: '24px' }}>{children}</main>
      </div>
    </div>
  );
}
