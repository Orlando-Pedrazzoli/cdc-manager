// 📄 src/app/(auth)/layout.tsx
// =============================================================================
// CDC Manager — Layout da área de autenticação (login, ativar, recuperar)
// Split-screen: painel institucional azul à esquerda, formulário à direita.
// No telemóvel: fundo azul + formulário num cartão branco (.cdc-auth-*).
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

      {/* Formulário
          ≥ 1024px: metade direita branca, formulário centrado.
          <  1024px: fundo institucional azul, marca no topo e o formulário
          num cartão branco com borda e sombra (.cdc-auth-* no globals.css) —
          os pacientes entram sobretudo pelo telemóvel. */}
      <div className='cdc-auth-pane'>
        <div className='cdc-auth-brand'>
          <span className='cdc-auth-logo'>
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
          </span>
          <span className='cdc-auth-brand-name'>CENTRO DENTÁRIO COLOMBO</span>
          <span className='cdc-auth-brand-sub'>Clínicas Colombo e Buraca</span>
        </div>
        <div className='cdc-auth-card'>{children}</div>
        <p className='cdc-auth-foot'>
          © {new Date().getFullYear()} Centro Dentário Colombo · CDC Manager
        </p>
      </div>
    </div>
  );
}
