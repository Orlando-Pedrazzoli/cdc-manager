// 📄 src/components/dashboard/PatientAppointmentsShortcut.tsx
// =============================================================================
// CDC Manager — Dashboard: atalho "Próximas consultas de um paciente"
// -----------------------------------------------------------------------------
// 7.ª ronda/B3 (Victor, 13/11/2026): "adicionar um atalho de ver próximas
// consultas do paciente, para otimizar a busca no dia a dia através do nome,
// data de nascimento, número de contacto". O atalho leva o cursor para a
// pesquisa do topo (nome, telemóvel, NIF, utente, nascimento ou processo);
// em cada resultado, o botão "Consultas" abre as próximas marcações.
// =============================================================================

'use client';

import { CalendarClock } from 'lucide-react';

export function PatientAppointmentsShortcut({
  style,
}: {
  style?: React.CSSProperties;
}) {
  return (
    <button
      type='button'
      title='Pesquise o paciente por nome, nascimento ou contacto e clique em "Consultas"'
      onClick={() => {
        const el = document.getElementById('quick-patient-search');
        if (el instanceof HTMLInputElement) {
          el.focus();
          el.select();
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        ...style,
      }}
    >
      <CalendarClock size={15} /> Próximas consultas de um paciente
    </button>
  );
}
