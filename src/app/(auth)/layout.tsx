// 📄 src/app/(auth)/layout.tsx
// =============================================================================
// CDC Manager — Layout da área de autenticação (login, ativar, recuperar)
// Split-screen: painel institucional azul à esquerda, formulário à direita.
// Logo servido com <img> nativo (sem otimizador) — máxima compatibilidade.
// =============================================================================

import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className='flex min-h-screen'>
      {/* Painel institucional (oculto em ecrãs < 1024px) */}
      <div
        className='relative hidden w-1/2 flex-col justify-between p-12 lg:flex'
        style={{
          background:
            'linear-gradient(150deg, #1B2A6B 0%, #2743A6 55%, #4A66D0 100%)',
        }}
      >
        {/* Círculos decorativos */}
        <div
          className='pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full'
          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
        />
        <div
          className='pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full'
          style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
        />

        {/* Logo em cartão branco */}
        <div className='relative z-10'>
          <div
            className='inline-flex items-center gap-3 rounded-xl px-4 py-3'
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src='/logo-cdc.png'
              alt='Centro Dentário Colombo'
              style={{
                height: '48px',
                width: '48px',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <span
              className='text-sm font-bold leading-tight'
              style={{ color: '#1B2A6B' }}
            >
              CENTRO DENTÁRIO
              <br />
              COLOMBO
            </span>
          </div>
        </div>

        <div className='relative z-10'>
          <h1
            className='text-4xl font-bold leading-tight'
            style={{ color: '#FFFFFF' }}
          >
            CDC Manager
          </h1>
          <p className='mt-3 max-w-md text-lg' style={{ color: '#C9D4FF' }}>
            A gestão completa das clínicas Colombo e Buraca — pacientes,
            agendas, consultas e faturação num só lugar.
          </p>
        </div>

        <p className='relative z-10 text-sm' style={{ color: '#9FB0F0' }}>
          © {new Date().getFullYear()} Centro Dentário Colombo · Clínicas
          Colombo e Buraca · Pedrazzoli Digital
        </p>
      </div>

      {/* Formulário */}
      <div
        className='flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2'
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Branding só-mobile: o painel azul está oculto < 1024px e os
            pacientes entram sobretudo pelo telemóvel — sem isto o
            formulário aparecia sem identidade nenhuma */}
        <div className='mb-8 flex flex-col items-center gap-2 lg:hidden'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src='/logo-cdc.png'
            alt='Centro Dentário Colombo'
            style={{
              height: '56px',
              width: '56px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
          <span
            className='text-center text-sm font-bold leading-tight'
            style={{ color: '#1B2A6B' }}
          >
            CENTRO DENTÁRIO COLOMBO
          </span>
          <span className='text-xs' style={{ color: '#6A7186' }}>
            Clínicas Colombo e Buraca
          </span>
        </div>
        <div className='w-full max-w-md'>{children}</div>
      </div>
    </div>
  );
}
