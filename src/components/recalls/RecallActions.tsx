// 📄 src/components/recalls/RecallActions.tsx
// =============================================================================
// CDC Manager — Recalls: botões de ação por linha da fila
// -----------------------------------------------------------------------------
// Mostra apenas as ações válidas para o estado atual (espelho client da
// máquina de transições — a validação REAL é na action; isto é só UX).
// Cada botão é um mini-form com useActionState + handled (padrão da casa),
// e a fila atualiza via router.refresh (fluxo incremental: fica na página).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  markRecallContactedAction,
  markRecallBookedAction,
  dismissRecallAction,
  markRecallUnreachableAction,
  reopenRecallAction,
  type RecallsActionState,
} from '@/actions/recalls';
import type { RecallStatus } from '@/models/Recall';
import { Button } from '@/components/ui/Button';

type ServerAction = (
  prev: RecallsActionState,
  formData: FormData,
) => Promise<RecallsActionState>;

function ActionBtn({
  recallId,
  action,
  label,
  successMsg,
  variant = 'outline',
}: {
  recallId: string;
  action: ServerAction;
  label: string;
  successMsg: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    RecallsActionState,
    FormData
  >(action, undefined);
  const handled = useRef<RecallsActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) {
      toast.success(successMsg, { duration: 4000 });
      router.refresh();
    }
  }, [state, successMsg, router]);

  return (
    <form action={formAction} style={{ display: 'inline-flex' }}>
      <input type='hidden' name='id' value={recallId} />
      <Button type='submit' variant={variant} size='sm' disabled={pending}>
        {pending ? '…' : label}
      </Button>
    </form>
  );
}

export function RecallActions({
  recallId,
  status,
}: {
  recallId: string;
  status: RecallStatus;
}) {
  const open = ['scheduled', 'due', 'contacted'].includes(status);
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      {open && (
        <ActionBtn
          recallId={recallId}
          action={markRecallContactedAction}
          label='Contactado'
          successMsg='Tentativa de contacto registada'
          variant='outline'
        />
      )}
      {open && (
        <ActionBtn
          recallId={recallId}
          action={markRecallBookedAction}
          label='Consulta marcada'
          successMsg='Recall convertido em consulta'
          variant='primary'
        />
      )}
      {open && (
        <ActionBtn
          recallId={recallId}
          action={dismissRecallAction}
          label='Dispensar'
          successMsg='Recall dispensado'
          variant='ghost'
        />
      )}
      {(status === 'due' || status === 'contacted') && (
        <ActionBtn
          recallId={recallId}
          action={markRecallUnreachableAction}
          label='Incontactável'
          successMsg='Marcado incontactável'
          variant='ghost'
        />
      )}
      {(status === 'dismissed' || status === 'unreachable') && (
        <ActionBtn
          recallId={recallId}
          action={reopenRecallAction}
          label='Reabrir'
          successMsg='Recall de volta à fila'
          variant='outline'
        />
      )}
    </div>
  );
}
