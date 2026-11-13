// 📄 src/components/sala-espera/UndoCheckInButton.tsx
// =============================================================================
// CDC Manager — Sala de espera: anular a chegada (7.ª ronda/A5)
// -----------------------------------------------------------------------------
// "Poder cancelar o envio para a sala de espera: o médico está atrasado, o
// paciente não pode esperar e prefere remarcar." Tira o paciente da sala de
// espera; a marcação volta a confirmada/pendente e pode ser remarcada na
// agenda.
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { undoCheckInAction } from '@/actions/appointments';

export function UndoCheckInButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type='button'
      disabled={busy}
      title='O paciente sai da sala de espera; a marcação volta ao estado anterior e pode ser remarcada na agenda'
      onClick={async () => {
        setBusy(true);
        const res = await undoCheckInAction(appointmentId);
        setBusy(false);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success('Chegada anulada.');
        router.refresh();
      }}
      style={{
        marginLeft: 8,
        padding: '3px 8px',
        fontSize: 12,
        fontWeight: 600,
        color: '#B42318',
        background: '#fff',
        border: '1px solid #F1C7C2',
        borderRadius: 6,
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? 'A anular…' : 'Anular chegada'}
    </button>
  );
}
