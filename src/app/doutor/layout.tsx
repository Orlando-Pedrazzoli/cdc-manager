// 📄 src/app/doutor/layout.tsx
// =============================================================================
// CDC Manager — Layout da área do Médico
// -----------------------------------------------------------------------------
// Substitui o placeholder do Sprint 0: sidebar de navegação (DoctorSidebar) +
// barra superior com identificação do médico e logout — espelho exato do
// layout admin para consistência visual entre áreas. O RBAC de rota
// (/doutor só para role doctor) é imposto no proxy — este layout assume
// sessão válida e só a apresenta.
// =============================================================================

import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { logoutAction } from '@/actions/auth';
import { DoctorSidebar } from '@/components/layout/DoctorSidebar';

export default async function DoctorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  const name = session?.user?.name ?? '';

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#F4F6FB',
      }}
    >
      <DoctorSidebar />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Barra superior */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '16px',
            padding: '12px 24px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #EEF1F8',
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
              Corpo Clínico
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
        </header>

        <main style={{ flex: 1, padding: '24px' }}>{children}</main>
      </div>
    </div>
  );
}
