// 📄 src/components/clinico/CloseConsultationModal.tsx
// =============================================================================
// CDC Manager — Clínico: controlos de estado da consulta (Client Components)
// -----------------------------------------------------------------------------
// Dois controlos que fecham o ciclo receção marca → médico atende:
//
//   StartConsultationButton — inicia a consulta (percorre a máquina de
//     estados até in-progress; o médico pode iniciar mesmo sem check-in
//     da receção)
//
//   CloseConsultationModal — conclui a consulta: resumo dos atos + total,
//     nota final opcional (append-only na ficha), e regresso ao dashboard
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Play, CheckCircle2 } from 'lucide-react';
import {
  startConsultationAction,
  completeConsultationAction,
  type ConsultationActionState,
} from '@/actions/procedures';
import { formatCents } from '@/lib/commissions';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

// -----------------------------------------------------------------------------
// INICIAR
// -----------------------------------------------------------------------------
export function StartConsultationButton({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [state, action, pending] = useActionState<
    ConsultationActionState,
    FormData
  >(startConsultationAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) toast.success('Consulta iniciada');
  }, [state]);

  return (
    <form action={action}>
      <input type='hidden' name='appointmentId' value={appointmentId} />
      <Button type='submit' disabled={pending}>
        <Play size={15} style={{ marginRight: 6 }} />
        {pending ? 'A iniciar…' : 'Iniciar consulta'}
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// CONCLUIR
// -----------------------------------------------------------------------------
export function CloseConsultationModal({
  appointmentId,
  actsCount,
  totalCents,
}: {
  appointmentId: string;
  actsCount: number;
  totalCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    ConsultationActionState,
    FormData
  >(completeConsultationAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) {
      toast.success('Consulta concluída');
      router.push('/doutor/dashboard');
    }
  }, [state, router]);

  return (
    <>
      <Button type='button' onClick={() => setOpen(true)}>
        <CheckCircle2 size={15} style={{ marginRight: 6 }} />
        Concluir consulta
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title='Concluir consulta'
      >
        <form
          action={action}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <input type='hidden' name='appointmentId' value={appointmentId} />

          <div
            style={{
              backgroundColor: '#F4F6FB',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '14px',
              color: '#1B2A6B',
            }}
          >
            <strong>{actsCount}</strong> ato{actsCount === 1 ? '' : 's'}{' '}
            registado
            {actsCount === 1 ? '' : 's'} · Total{' '}
            <strong>{formatCents(totalCents)}</strong>
            {actsCount === 0 && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '12px',
                  color: '#8A5A00',
                }}
              >
                ⚠️ Vai concluir sem atos registados — nada entrará na cobrança.
              </p>
            )}
          </div>

          <Textarea
            name='finalNote'
            label='Nota final (opcional — fica permanente na ficha)'
            rows={3}
            placeholder='Resumo da consulta, plano para a próxima…'
          />

          <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
            Depois de concluída, a consulta fecha e os atos ficam disponíveis
            para cobrança na receção. Esta ação não pode ser revertida.
          </p>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            <Button
              type='button'
              variant='secondary'
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type='submit' disabled={pending}>
              {pending ? 'A concluir…' : 'Confirmar conclusão'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
