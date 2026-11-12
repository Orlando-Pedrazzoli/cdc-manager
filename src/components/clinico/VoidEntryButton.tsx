// 📄 src/components/clinico/VoidEntryButton.tsx
// =============================================================================
// CDC Manager — Odontograma (gestão): anular um lançamento errado
// -----------------------------------------------------------------------------
// 6.ª ronda/03 (Victor, nov. 2026): médico e gestão podem corrigir
// lançamentos errados (tratamento errado, dente errado); a receção não.
// Corrigir = anular o lançamento errado com motivo (never-delete: fica no
// histórico como anulado) — o lançamento certo é feito pelo médico.
// Reutiliza voidProcedureAction, que valida o perfil no servidor.
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { voidProcedureAction } from '@/actions/procedures';

export function VoidEntryButton({
  procedureId,
  label,
}: {
  procedureId: string;
  /** Texto do lançamento, para a confirmação ("Restauração · dente 24") */
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) {
      toast.error('Indique o motivo da correção.');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('procedureId', procedureId);
    fd.set('reason', reason.trim());
    const res = await voidProcedureAction(undefined, fd);
    setBusy(false);
    if (res && 'error' in res) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    toast.success('Lançamento anulado.');
    setOpen(false);
    setReason('');
    router.refresh();
  };

  if (!open) {
    return (
      <button
        type='button'
        onClick={() => setOpen(true)}
        style={{
          border: '1px solid #E7B4B0',
          borderRadius: '8px',
          padding: '5px 10px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#B3261E',
          backgroundColor: '#FFFFFF',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Anular lançamento
      </button>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      }}
    >
      <input
        type='text'
        autoFocus
        value={reason}
        onChange={e => setReason(e.target.value)}
        maxLength={300}
        placeholder='Motivo (ex.: dente errado)'
        aria-label={`Motivo da anulação de ${label}`}
        style={{
          borderRadius: '8px',
          border: '1px solid #D8DEEF',
          padding: '6px 10px',
          fontSize: '12px',
          color: '#1B2A6B',
          minWidth: 200,
        }}
      />
      <button
        type='button'
        disabled={busy}
        onClick={submit}
        style={{
          border: 'none',
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#FFFFFF',
          backgroundColor: '#B3261E',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'A anular…' : 'Confirmar'}
      </button>
      <button
        type='button'
        disabled={busy}
        onClick={() => setOpen(false)}
        style={{
          border: '1px solid #D8DEEF',
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#454C63',
          backgroundColor: '#FFFFFF',
          cursor: 'pointer',
        }}
      >
        Cancelar
      </button>
    </div>
  );
}
