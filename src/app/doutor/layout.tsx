// 📄 src/app/doutor/layout.tsx
// =============================================================================
// CDC Manager — Layout da área do Médico
// -----------------------------------------------------------------------------
// Server Component: lê sessão e Organização e entrega ao AppShell (client)
// os nós já renderizados. Mesmo shell da área admin → o médico tem drawer
// no telemóvel (é o utilizador mais mobile de todos: entre consultas, no
// carro). No mobile a barra superior desaparece — utilizador/Sair vivem no
// rodapé do drawer. O RBAC de rota
// (/doutor só para role doctor) é imposto no proxy — este layout assume
// sessão válida e só a apresenta.
// =============================================================================

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import User from '@/models/User';
import { requireActiveSession } from '@/lib/require-active-session';
import { logoutAction } from '@/actions/auth';
import { ClockWeather } from '@/components/layout/ClockWeather';
import { AppShell } from '@/components/layout/AppShell';
import { DoctorWaitingAlert } from '@/components/layout/DoctorWaitingAlert';
import { getOrganization } from '@/models/Organization';
import { UPPERCASE_DISPLAY_CSS } from '@/lib/uppercase-display';

export default async function DoctorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [session, org] = await Promise.all([
    requireActiveSession(['doctor'] as const),
    getOrganization(),
  ]);
  // 9.ª ronda (25/11/2026): conta criada pela gestão com senha inicial →
  // o médico escolhe a sua antes de entrar na área clínica
  const pending = await User.exists({
    _id: session.user.id,
    mustChangePassword: true,
  });
  if (pending) redirect('/primeira-senha');
  const name = session?.user?.name ?? '';

  const brand = {
    appName: org.appName,
    logoUrl: org.logoUrl,
    primaryColor: org.primaryColor,
  };
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');

  // Barra superior (desktop): hora/tempo + identificação + Sair
  const topbar = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexShrink: 0,
        marginLeft: 'auto',
      }}
    >
      {/* Hora de Lisboa + temperatura — o ecrã fica aberto o dia todo */}
      <ClockWeather />
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
      </div>
    </div>
  );

  // Rodapé do drawer (mobile): o médico vê quem está ligado e sai daqui
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
          backgroundColor: 'rgba(255,255,255,0.15)',
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
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          Corpo Clínico
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
      area='doutor'
      brand={brand}
      topbar={topbar}
      topbarOnMobile={false}
      drawerFooter={drawerFooter}
    >
      {/* Respostas de 25/11 (F3): ecrãs em maiúsculas, só apresentação */}
      {org.uppercaseDisplay && (
        <style dangerouslySetInnerHTML={{ __html: UPPERCASE_DISPLAY_CSS }} />
      )}
      {children}
      {/* 9.ª ronda/10: aviso luminoso de paciente lançado pela receção */}
      <DoctorWaitingAlert />
    </AppShell>
  );
}
