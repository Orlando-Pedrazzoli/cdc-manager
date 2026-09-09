// 📄 src/components/medicos/DoctorStatusToggle.tsx
// =============================================================================
// CDC Manager — Desativar / Reativar profissional (ficha do médico, tab Dados)
// -----------------------------------------------------------------------------
// NÃO existe "excluir" médico por design: never-delete — um profissional com
// histórico clínico, consultas e comissões não pode desaparecer da base.
// O conceito correto é DESATIVAR: sai das agendas e listagens ativas, a conta
// de login é desligada, e tudo fica reversível e auditado (a action
// setDoctorActiveAction trata de conta + audit).
// Confirmação em dois passos inline (sem modal): clique → "Confirmar?" com
// aviso; segundo clique executa. Se houver marcações futuras, o toast
// pós-ação alerta para remarcar na agenda.
// =============================================================================

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { setDoctorActiveAction } from '@/actions/doctors';

export default function DoctorStatusToggle({
  doctorId,
  doctorName,
  active,
}: {
  doctorId: string;
  doctorName: string;
  active: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (next: boolean) => {
    startTransition(async () => {
      const res = await setDoctorActiveAction(doctorId, next);
      if (res.error) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      if (next) {
        toast.success(`${doctorName} reativado(a).`);
      } else if (res.futureAppointments && res.futureAppointments > 0) {
        toast(
          `Profissional desativado. Atenção: tem ${res.futureAppointments} marcação${res.futureAppointments === 1 ? '' : 'ões'} futura${res.futureAppointments === 1 ? '' : 's'} — remarque na agenda.`,
          { icon: '⚠️', duration: 10000 },
        );
      } else {
        toast.success('Profissional desativado.');
      }
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div
      style={{
        marginTop: '28px',
        paddingTop: '20px',
        borderTop: '1px solid #EEF1F8',
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontSize: '13px',
          fontWeight: 700,
          color: active ? '#B3261E' : '#1E6B34',
        }}
      >
        {active ? 'Desativar profissional' : 'Reativar profissional'}
      </p>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6A7186' }}>
        {active
          ? 'Sai das agendas e listagens ativas e a conta de acesso é desligada. Todo o histórico clínico e financeiro é preservado — esta ação é reversível.'
          : 'Volta às agendas e listagens; a conta de acesso é religada (se já tinha sido ativada).'}
      </p>

      {active ? (
        confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type='button'
              onClick={() => run(false)}
              disabled={pending}
              style={{
                borderRadius: '10px',
                border: '1px solid #B3261E',
                backgroundColor: '#B3261E',
                color: '#FFFFFF',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: pending ? 'wait' : 'pointer',
                opacity: pending ? 0.7 : 1,
              }}
            >
              {pending ? 'A desativar…' : `Confirmar — desativar ${doctorName}`}
            </button>
            <button
              type='button'
              onClick={() => setConfirming(false)}
              disabled={pending}
              style={{
                borderRadius: '10px',
                border: '1px solid #D8DEEF',
                backgroundColor: '#FFFFFF',
                color: '#3A3F4A',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type='button'
            onClick={() => setConfirming(true)}
            style={{
              borderRadius: '10px',
              border: '1px solid #F3C4C0',
              backgroundColor: '#FDECEC',
              color: '#B3261E',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Desativar profissional
          </button>
        )
      ) : (
        <button
          type='button'
          onClick={() => run(true)}
          disabled={pending}
          style={{
            borderRadius: '10px',
            border: '1px solid #BFE3C8',
            backgroundColor: '#EDF7EF',
            color: '#1E6B34',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: pending ? 'wait' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? 'A reativar…' : 'Reativar profissional'}
        </button>
      )}
    </div>
  );
}
