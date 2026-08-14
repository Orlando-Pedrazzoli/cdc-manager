// 📄 src/components/rx/RxQueueActions.tsx
// =============================================================================
// CDC Manager — Sala de RX: botões de operação da fila
// -----------------------------------------------------------------------------
// Client component mínimo: Iniciar (requested → in-progress) e Concluir
// (→ done). A action valida a transição com atualização condicionada — dois
// operadores em simultâneo nunca se pisam. Padrão useActionState do projeto.
// =============================================================================

'use client';

import { useActionState } from 'react';
import { advanceRxRequestAction, type RxActionState } from '@/actions/rx';
import type { RxStatus } from '@/lib/domain';

export function RxQueueActions({
  requestId,
  status,
}: {
  requestId: string;
  status: RxStatus;
}) {
  const [state, action, pending] = useActionState<RxActionState, FormData>(
    advanceRxRequestAction,
    undefined,
  );

  const btn = (bg: string): React.CSSProperties => ({
    borderRadius: '8px',
    border: 'none',
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#FFFFFF',
    backgroundColor: pending ? '#8FA0DC' : bg,
    cursor: pending ? 'default' : 'pointer',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}
    >
      {status === 'requested' && (
        <>
          <form action={action}>
            <input type='hidden' name='requestId' value={requestId} />
            <input type='hidden' name='to' value='in-progress' />
            <button type='submit' disabled={pending} style={btn('#2743A6')}>
              Iniciar
            </button>
          </form>
          <form action={action}>
            <input type='hidden' name='requestId' value={requestId} />
            <input type='hidden' name='to' value='done' />
            <button type='submit' disabled={pending} style={btn('#0F7B4D')}>
              Concluir
            </button>
          </form>
        </>
      )}
      {status === 'in-progress' && (
        <form action={action}>
          <input type='hidden' name='requestId' value={requestId} />
          <input type='hidden' name='to' value='done' />
          <button type='submit' disabled={pending} style={btn('#0F7B4D')}>
            Concluir
          </button>
        </form>
      )}
      {state && 'error' in state && (
        <span style={{ fontSize: '12px', color: '#B3261E' }}>
          {state.error}
        </span>
      )}
    </div>
  );
}
