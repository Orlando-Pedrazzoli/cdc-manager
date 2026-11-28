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
import { Input, Select, Textarea } from '@/components/ui/Input';
import {
  FOLLOW_UP_REASONS,
  FOLLOW_UP_REASON_LABEL,
  parseFollowUp,
  type FollowUpReason,
} from '@/lib/follow-up';
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
  // Ponto 35 (Giulia, 27/11): "Há próxima consulta?" — obrigatória
  const [answer, setAnswer] = useState<'' | 'sim' | 'nao'>('');
  const [reason, setReason] = useState<FollowUpReason | ''>('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const followCheck = parseFollowUp({ answer, reason, minutes, note });
  const followError = 'error' in followCheck ? followCheck.error : null;
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

          {/* Ponto 35 (Giulia, 27/11): a receção vê a resposta na Sala de
              espera e nas Cobranças, para marcar com o paciente no balcão */}
          <fieldset
            style={{
              border: '1px solid #D8DEEF',
              borderRadius: 10,
              padding: '10px 14px 12px',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <legend
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#1B2A6B',
                padding: '0 6px',
              }}
            >
              Há próxima consulta? *
            </legend>
            <input type='hidden' name='followUpAnswer' value={answer} />
            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  ['sim', 'Sim'],
                  ['nao', 'Não'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type='button'
                  aria-pressed={answer === value}
                  onClick={() => setAnswer(value)}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 9,
                    border: `1.5px solid ${answer === value ? '#1B2A6B' : '#D8DEEF'}`,
                    backgroundColor: answer === value ? '#1B2A6B' : '#FFFFFF',
                    color: answer === value ? '#FFFFFF' : '#1B2A6B',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {answer === 'sim' && (
              <>
                <Select
                  name='followUpReason'
                  label='Motivo *'
                  value={reason}
                  onChange={e => setReason(e.target.value as FollowUpReason | '')}
                >
                  <option value=''>— Escolha —</option>
                  {FOLLOW_UP_REASONS.map(r => (
                    <option key={r} value={r}>
                      {FOLLOW_UP_REASON_LABEL[r]}
                    </option>
                  ))}
                </Select>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 1fr',
                    gap: 10,
                  }}
                >
                  <Input
                    name='followUpMinutes'
                    label={`Duração (min)${reason === 'tempo' ? ' *' : ''}`}
                    inputMode='numeric'
                    value={minutes}
                    onChange={e => setMinutes(e.target.value)}
                    placeholder='ex.: 60'
                  />
                  <Input
                    name='followUpNote'
                    label={
                      reason === 'especialidade'
                        ? 'Especialidade ou médico *'
                        : reason === 'outro'
                          ? 'Qual? *'
                          : 'Indicações para a receção'
                    }
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    maxLength={300}
                    placeholder={
                      reason === 'especialidade'
                        ? 'ex.: Endodontia'
                        : 'ex.: daqui a 15 dias'
                    }
                  />
                </div>
              </>
            )}
            {answer !== '' && followError && (
              <p style={{ margin: 0, fontSize: '12px', color: '#B3261E' }}>
                {followError}
              </p>
            )}
          </fieldset>

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
            <Button type='submit' disabled={pending || !!followError}>
              {pending ? 'A concluir…' : 'Confirmar conclusão'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
