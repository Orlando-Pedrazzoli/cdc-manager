// 📄 src/components/relatorios/PayAdjustments.tsx
// =============================================================================
// CDC Manager — Pagamento aos médicos: lançar e retirar ajustes manuais
// (8.ª ronda/14). Só a gestão; as ações voltam a verificar a permissão.
// =============================================================================

'use client';

import { useActionState, useEffect, useRef } from 'react';
import {
  addPayAdjustmentAction,
  removePayAdjustmentAction,
} from '@/actions/pay-adjustments';

const field: React.CSSProperties = {
  border: '1px solid #D8DEEF',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: '13px',
  color: '#1C2233',
  backgroundColor: '#FFFFFF',
  minWidth: 0,
};
const label: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: '12px',
  fontWeight: 600,
  color: '#4A5169',
};

export function PayAdjustmentForm({
  month,
  monthLabel,
  doctors,
  defaultDoctorId,
}: {
  month: string;
  monthLabel: string;
  doctors: { id: string; name: string }[];
  defaultDoctorId: string;
}) {
  const [state, action, pending] = useActionState(
    addPayAdjustmentAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && 'success' in state) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
          Ajuste manual ao pagamento
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6A7186' }}>
          Um valor a somar ou a descontar ao que o profissional recebe em{' '}
          {monthLabel}. Não altera a remuneração dos atos.
        </p>
      </div>
      <input type='hidden' name='month' value={month} />
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <label style={label}>
          Profissional
          <select
            name='doctorId'
            required
            defaultValue={defaultDoctorId}
            style={{ ...field, minWidth: 200 }}
          >
            <option value=''>Escolher…</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          Sentido
          <select name='kind' defaultValue='add' style={field}>
            <option value='add'>Somar</option>
            <option value='deduct'>Descontar</option>
          </select>
        </label>
        <label style={label}>
          Valor (€)
          <input
            name='amount'
            required
            inputMode='decimal'
            placeholder='0,00'
            style={{ ...field, width: 110 }}
          />
        </label>
        <label style={{ ...label, flex: '1 1 240px' }}>
          Descrição
          <input
            name='description'
            required
            maxLength={160}
            placeholder='Ex.: acerto do mês anterior'
            style={field}
          />
        </label>
        <button
          type='submit'
          disabled={pending}
          style={{
            border: 'none',
            borderRadius: 8,
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#FFFFFF',
            backgroundColor: pending ? '#9AA6D6' : '#2743A6',
            cursor: pending ? 'default' : 'pointer',
          }}
        >
          {pending ? 'A lançar…' : 'Lançar ajuste'}
        </button>
      </div>
      {state && (
        <p
          role='status'
          style={{
            margin: 0,
            fontSize: '13px',
            fontWeight: 600,
            color: 'error' in state ? '#B3261E' : '#0F7B4D',
          }}
        >
          {'error' in state ? state.error : state.message}
        </p>
      )}
    </form>
  );
}

export function RemovePayAdjustmentButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    removePayAdjustmentAction,
    undefined,
  );
  return (
    <form action={action} style={{ display: 'inline' }}>
      <input type='hidden' name='id' value={id} />
      <button
        type='submit'
        disabled={pending}
        title={state && 'error' in state ? state.error : 'Retirar este ajuste'}
        style={{
          border: '1px solid #E4B4B0',
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#B3261E',
          backgroundColor: '#FFFFFF',
          cursor: pending ? 'default' : 'pointer',
        }}
      >
        {pending ? '…' : 'Retirar'}
      </button>
    </form>
  );
}
