// 📄 src/components/portal/AppointmentActions.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: ações de uma marcação futura
// -----------------------------------------------------------------------------
// Server Component (sem estado): botão "Confirmar presença" (só quando
// pending — POST para a Server Action com sessão) e "Adicionar ao
// calendário" (.ics). Botões grandes, lado a lado, com toque confortável —
// o paciente está no telemóvel. Abaixo de ~360px passam para coluna.
// =============================================================================

import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { confirmMyAppointmentAction } from '@/actions/portal';

const btn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  flex: '1 1 160px',
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
};

export function AppointmentActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginTop: '12px',
      }}
    >
      {status === 'pending' && (
        <form
          action={confirmMyAppointmentAction}
          style={{ display: 'contents' }}
        >
          <input type='hidden' name='appointmentId' value={appointmentId} />
          <button
            type='submit'
            style={{
              ...btn,
              border: 'none',
              backgroundColor: '#2743A6',
              color: '#FFFFFF',
            }}
          >
            <CheckCircle2 size={16} />
            Confirmar presença
          </button>
        </form>
      )}
      <a
        href={`/conta/marcacoes/${appointmentId}/ics`}
        style={{
          ...btn,
          border: '1px solid #C9D4FF',
          backgroundColor: '#FFFFFF',
          color: '#2743A6',
        }}
      >
        <CalendarPlus size={16} />
        Adicionar ao calendário
      </a>
    </div>
  );
}
