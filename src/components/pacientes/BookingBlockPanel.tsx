// 📄 src/components/pacientes/BookingBlockPanel.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: bloqueio de marcações (7.ª ronda/B4)
// -----------------------------------------------------------------------------
// Victor (13/11/2026): "Adicionar 'bloquear' pacientes para impedir marcações
// na agenda. [...] com a informação e o motivo descrito por quem o fez.
// Apenas a Gestão."
//
// · Paciente bloqueado: faixa vermelha com o motivo, quem bloqueou e quando —
//   visível para todos. A gestão tem o botão "Desbloquear".
// · Paciente não bloqueado: só a gestão vê o botão "Bloquear marcações", que
//   pede o motivo.
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Ban, LockOpen } from 'lucide-react';
import { setBookingBlockAction } from '@/actions/patient-block';
import {
  BOOKING_BLOCK_REASON_MAX,
  BOOKING_BLOCK_REASON_MIN,
} from '@/lib/booking-block';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface BookingBlockInfo {
  reason: string;
  /** "13/11/2026" */
  atLabel: string;
  /** Nome de quem bloqueou (null se a conta já não existir) */
  byName: string | null;
}

export function BookingBlockPanel({
  patientId,
  block,
  canManage,
}: {
  patientId: string;
  block: BookingBlockInfo | null;
  /** true só para a gestão (perfil admin) */
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (blocked: boolean) => {
    setBusy(true);
    const res = await setBookingBlockAction(patientId, { blocked, reason });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      blocked
        ? 'Paciente bloqueado para marcações.'
        : 'Paciente desbloqueado. Já pode ser marcado.',
    );
    setOpen(false);
    setReason('');
    router.refresh();
  };

  if (block) {
    return (
      <div
        role='alert'
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 14px',
          borderRadius: '10px',
          backgroundColor: '#FDECEA',
          border: '1px solid #F1B5AE',
          color: '#7A1C13',
          fontSize: '13px',
          lineHeight: 1.45,
        }}
      >
        <Ban size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>Paciente bloqueado para marcações.</strong>
          <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>
            Motivo: {block.reason}
          </div>
          <div style={{ marginTop: 2, fontSize: '12px', color: '#9A3A30' }}>
            Bloqueado{block.byName ? ` por ${block.byName}` : ''} a{' '}
            {block.atLabel}. Só a gestão pode desbloquear.
          </div>
        </div>
        {canManage && (
          <Button
            size='sm'
            variant='outline'
            loading={busy}
            onClick={() => run(false)}
          >
            <LockOpen size={14} /> Desbloquear
          </Button>
        )}
      </div>
    );
  }

  if (!canManage) return null;

  const tooShort = reason.trim().length < BOOKING_BLOCK_REASON_MIN;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        <Ban size={14} /> Bloquear marcações
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title='Bloquear marcações deste paciente'
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#3D4257' }}>
            Enquanto estiver bloqueado, ninguém consegue fazer uma nova
            marcação, um encaixe ou uma remarcação para este paciente. Quem
            tentar vê o motivo que escrever aqui. As marcações já existentes
            não são alteradas.
          </p>
          <label
            htmlFor='block-reason'
            style={{ fontSize: '13px', fontWeight: 600, color: '#1C2233' }}
          >
            Motivo *
          </label>
          <textarea
            id='block-reason'
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={BOOKING_BLOCK_REASON_MAX}
            rows={4}
            placeholder='Ex.: valores em dívida há mais de 6 meses — falar com a gestão antes de marcar.'
            style={{
              width: '100%',
              padding: '9px 11px',
              border: '1px solid #D8DEEF',
              borderRadius: '10px',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant='danger'
              size='sm'
              loading={busy}
              disabled={tooShort}
              onClick={() => run(true)}
            >
              Bloquear
            </Button>
            <Button
              variant='secondary'
              size='sm'
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
