// 📄 src/components/proteses/LabCaseRowActions.tsx
// =============================================================================
// CDC Manager — Próteses: ações por linha da fila
// -----------------------------------------------------------------------------
// sent     → [Recebida] [Nova data] [Cancelar]
// received → [Colocada] [Cancelar]
// "Nova data" é o registo da COBRANÇA: liga-se ao laboratório, renegoceia-se
// e grava-se a nova data prevista + nota — o alerta recalcula sozinho.
// =============================================================================

'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  receiveLabCaseAction,
  deliverLabCaseAction,
  rescheduleLabCaseAction,
  cancelLabCaseAction,
} from '@/actions/lab-cases';
import type { LabCaseStatus } from '@/lib/domain';

const btn = (kind: 'primary' | 'ghost' | 'danger') =>
  ({
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    border:
      kind === 'primary'
        ? '1px solid #2743A6'
        : kind === 'danger'
          ? '1px solid #F3CFCC'
          : '1px solid #D8DEEF',
    backgroundColor:
      kind === 'primary'
        ? '#2743A6'
        : kind === 'danger'
          ? '#FDF3F2'
          : '#FFFFFF',
    color:
      kind === 'primary'
        ? '#FFFFFF'
        : kind === 'danger'
          ? '#B3261E'
          : '#1B2A6B',
  }) as const;

export function LabCaseRowActions({
  id,
  status,
}: {
  id: string;
  status: LabCaseStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<'idle' | 'reschedule' | 'cancel'>('idle');
  const [newDate, setNewDate] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const todayStr = new Date().toISOString().slice(0, 10);

  const run = (
    action: (
      fd: FormData,
    ) => Promise<{ error: string } | { success: true } | undefined>,
    fd: FormData,
    okMsg: string,
  ) => {
    if (pending) return;
    setPending(true);
    startTransition(async () => {
      const res = await action(fd);
      setPending(false);
      if (res && 'error' in res) {
        toast.error(res.error);
        return;
      }
      toast.success(okMsg);
      setMode('idle');
      setNewDate('');
      setNote('');
      setReason('');
      router.refresh();
    });
  };

  if (status === 'delivered' || status === 'cancelled') return null;

  // --- Formulário inline: nova data prevista --------------------------------
  if (mode === 'reschedule') {
    return (
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type='date'
          value={newDate}
          min={todayStr}
          onChange={e => setNewDate(e.target.value)}
          style={{
            height: 30,
            padding: '0 8px',
            border: '1px solid #D8DEEF',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <input
          type='text'
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder='Nota (ex.: falámos com o lab.)'
          maxLength={200}
          style={{
            height: 30,
            padding: '0 8px',
            border: '1px solid #D8DEEF',
            borderRadius: '8px',
            fontSize: '12px',
            width: 180,
          }}
        />
        <button
          type='button'
          disabled={pending || !newDate}
          style={btn('primary')}
          onClick={() => {
            const fd = new FormData();
            fd.append('id', id);
            fd.append('newDueDate', newDate);
            fd.append('note', note);
            run(rescheduleLabCaseAction, fd, 'Nova data prevista registada.');
          }}
        >
          Guardar
        </button>
        <button
          type='button'
          style={btn('ghost')}
          onClick={() => setMode('idle')}
        >
          ✕
        </button>
      </div>
    );
  }

  // --- Formulário inline: cancelar (motivo obrigatório) ----------------------
  if (mode === 'cancel') {
    return (
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type='text'
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder='Motivo do cancelamento *'
          maxLength={200}
          style={{
            height: 30,
            padding: '0 8px',
            border: '1px solid #F3CFCC',
            borderRadius: '8px',
            fontSize: '12px',
            width: 220,
          }}
        />
        <button
          type='button'
          disabled={pending || reason.trim().length < 3}
          style={btn('danger')}
          onClick={() => {
            const fd = new FormData();
            fd.append('id', id);
            fd.append('reason', reason);
            run(cancelLabCaseAction, fd, 'Caso cancelado.');
          }}
        >
          Confirmar
        </button>
        <button
          type='button'
          style={btn('ghost')}
          onClick={() => setMode('idle')}
        >
          ✕
        </button>
      </div>
    );
  }

  // --- Botões por estado ------------------------------------------------------
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {status === 'sent' && (
        <>
          <button
            type='button'
            disabled={pending}
            style={btn('primary')}
            onClick={() => {
              const fd = new FormData();
              fd.append('id', id);
              run(receiveLabCaseAction, fd, 'Prótese marcada como recebida.');
            }}
          >
            Recebida ✓
          </button>
          <button
            type='button'
            style={btn('ghost')}
            onClick={() => setMode('reschedule')}
          >
            Nova data
          </button>
        </>
      )}
      {status === 'received' && (
        <button
          type='button'
          disabled={pending}
          style={btn('primary')}
          onClick={() => {
            const fd = new FormData();
            fd.append('id', id);
            run(deliverLabCaseAction, fd, 'Prótese marcada como colocada.');
          }}
        >
          Colocada no paciente ✓
        </button>
      )}
      <button
        type='button'
        style={btn('danger')}
        onClick={() => setMode('cancel')}
      >
        Cancelar
      </button>
    </div>
  );
}
