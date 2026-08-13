// 📄 src/app/admin/dashboard/error.tsx
// =============================================================================
// CDC Manager — Dashboard admin: fronteira de erro
// -----------------------------------------------------------------------------
// Se uma das queries da dashboard falhar (Atlas indisponível, timeout de cold
// start no M0), o App Router mostraria o erro genérico do Next — assustador
// para a receção. Esta fronteira apanha o erro, mostra uma mensagem calma em
// português e oferece "Tentar novamente" (reset() re-renderiza o Server
// Component). O erro real vai para a consola/logs da Vercel para diagnóstico;
// nunca se mostra stack trace ao utilizador.
// =============================================================================

'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Diagnóstico nos logs (Vercel) — invisível para o utilizador
    console.error('[dashboard] erro ao carregar:', error);
  }, [error]);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '40px 24px',
        textAlign: 'center',
        maxWidth: '520px',
        margin: '48px auto',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '17px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        Não foi possível carregar a dashboard
      </p>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: '13px',
          color: '#6A7186',
          lineHeight: 1.5,
        }}
      >
        Ocorreu um problema temporário ao ligar à base de dados. Os seus dados
        estão seguros — tente novamente dentro de instantes.
      </p>
      <button
        type='button'
        onClick={() => reset()}
        style={{
          marginTop: '20px',
          borderRadius: '10px',
          border: 'none',
          padding: '10px 22px',
          fontSize: '14px',
          fontWeight: 600,
          color: '#FFFFFF',
          backgroundColor: '#2743A6',
          cursor: 'pointer',
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
