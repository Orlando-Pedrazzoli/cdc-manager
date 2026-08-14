// 📄 src/app/doutor/dashboard/error.tsx
// =============================================================================
// CDC Manager — Dashboard médico: fronteira de erro
// -----------------------------------------------------------------------------
// Mesmo racional da admin: uma falha temporária (Atlas, cold start) nunca
// deve mostrar o erro genérico do Next ao médico. Mensagem calma + "Tentar
// novamente" (reset() re-renderiza o Server Component). Diagnóstico vai para
// os logs; stack trace nunca chega ao utilizador.
// =============================================================================

'use client';

import { useEffect } from 'react';

export default function DoctorDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[doutor/dashboard] erro ao carregar:', error);
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
        Não foi possível carregar o seu dia
      </p>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: '13px',
          color: '#6A7186',
          lineHeight: 1.5,
        }}
      >
        Ocorreu um problema temporário ao ligar à base de dados. Os registos
        clínicos estão seguros — tente novamente dentro de instantes.
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
