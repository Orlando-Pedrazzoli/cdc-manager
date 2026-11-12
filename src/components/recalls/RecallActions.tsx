// 📄 src/components/recalls/RecallActions.tsx
// =============================================================================
// CDC Manager — Recalls: botões de ação por linha da fila
// -----------------------------------------------------------------------------
// 6.ª ronda/09 (Victor, nov. 2026): em cada contacto a receção escolhe o
// RESULTADO — Agendado, Não atendeu, Retornar mais tarde, Pediu para ligar
// depois, Deixou mensagem, Não tem interesse, Número errado. Cada clique
// grava o colaborador e a hora (registo de produtividade). Uma nota curta é
// opcional. "Dispensar" (sem contacto) e "Reabrir" mantêm-se.
// A validação REAL é na action; aqui é só UX (padrão da casa:
// useActionState + router.refresh, fica na página).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  registerRecallContactAction,
  dismissRecallAction,
  reopenRecallAction,
  type RecallsActionState,
} from '@/actions/recalls';
import { RECALL_OUTCOMES, type RecallOutcome } from '@/lib/domain';
import type { RecallStatus } from '@/models/Recall';
import { RECALL_OUTCOME_LABEL } from '@/lib/validations/recalls';
import { Button } from '@/components/ui/Button';

type ServerAction = (
  prev: RecallsActionState,
  formData: FormData,
) => Promise<RecallsActionState>;

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

const OUTCOME_VARIANT: Record<RecallOutcome, Variant> = {
  booked: 'primary',
  'no-answer': 'outline',
  'call-back': 'outline',
  'asked-later': 'outline',
  'message-left': 'outline',
  'not-interested': 'ghost',
  'wrong-number': 'ghost',
};

function ActionBtn({
  recallId,
  action,
  label,
  successMsg,
  variant = 'outline',
  outcome,
  note,
  onDone,
}: {
  recallId: string;
  action: ServerAction;
  label: string;
  successMsg: string;
  variant?: Variant;
  outcome?: RecallOutcome;
  note?: string;
  onDone?: () => void;
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
      onDone?.();
      router.refresh();
    }
  }, [state, successMsg, router, onDone]);

  return (
    <form action={formAction} style={{ display: 'inline-flex' }}>
      <input type='hidden' name='id' value={recallId} />
      {outcome && <input type='hidden' name='outcome' value={outcome} />}
      {outcome && <input type='hidden' name='note' value={note ?? ''} />}
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
  const [note, setNote] = useState('');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'flex-end',
        maxWidth: 560,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '6px',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        {open &&
          RECALL_OUTCOMES.map(o => (
            <ActionBtn
              key={o}
              recallId={recallId}
              action={registerRecallContactAction}
              label={RECALL_OUTCOME_LABEL[o]}
              successMsg={`Contacto registado: ${RECALL_OUTCOME_LABEL[o]}`}
              variant={OUTCOME_VARIANT[o]}
              outcome={o}
              note={note}
              onDone={() => setNote('')}
            />
          ))}
        {open && (
          <ActionBtn
            recallId={recallId}
            action={dismissRecallAction}
            label='Dispensar'
            successMsg='Recall dispensado'
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
      {open && (
        <input
          type='text'
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={200}
          placeholder='Nota do contacto (opcional) — ex.: ligar depois das 18h'
          aria-label='Nota do contacto'
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: '8px',
            border: '1px solid #D8DEEF',
            padding: '6px 10px',
            fontSize: '12px',
            color: '#1B2A6B',
            backgroundColor: '#FFFFFF',
          }}
        />
      )}
    </div>
  );
}
