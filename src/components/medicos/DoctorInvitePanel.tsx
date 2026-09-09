// 📄 src/components/medicos/DoctorInvitePanel.tsx
// =============================================================================
// CDC Manager — Convite de conta de acesso na ficha do médico
// -----------------------------------------------------------------------------
// Fecha a lacuna: médicos criados SEM conta (ex.: seed) não tinham caminho
// nenhum para receber acesso — o convite só existia na criação, e o
// Configurações→Utilizadores só convida admin/receção (deliberado: a conta
// de médico exige ligação ao doctorId). Este painel aparece na ficha quando
// não há conta ativa: email + "Enviar convite" (ou "Reenviar" se pendente).
// Se o email falhar na entrega, mostra o código de uso único (7 dias) para
// envio manual — mesmo padrão do fluxo de criação.
// =============================================================================

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { inviteDoctorAccountAction } from '@/actions/doctors';

export default function DoctorInvitePanel({
  doctorId,
  hasPendingInvite,
  currentEmail,
}: {
  doctorId: string;
  hasPendingInvite: boolean;
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(currentEmail ?? '');
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await inviteDoctorAccountAction(doctorId, email);
      if ('error' in res) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      if (res.manualCode) {
        setManualCode(res.manualCode);
        toast('O email não foi entregue — envie o código manualmente.', {
          icon: '⚠️',
          duration: 8000,
        });
      } else {
        toast.success(
          hasPendingInvite ? 'Convite reenviado.' : 'Convite enviado.',
        );
      }
      router.refresh();
    });
  };

  return (
    <div
      style={{
        marginTop: '14px',
        border: '1px solid #C9D4FF',
        backgroundColor: '#F5F8FF',
        borderRadius: '14px',
        padding: '14px 16px',
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontSize: '13px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        Conta de acesso do profissional
      </p>
      <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#6A7186' }}>
        {hasPendingInvite
          ? 'Convite pendente — pode reenviar (gera um código novo, o anterior deixa de ser válido).'
          : 'Este profissional ainda não tem acesso à sua área. Envie o convite de ativação por email.'}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          type='email'
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder='medico@exemplo.pt'
          aria-label='Email do profissional'
          style={{
            flex: '1 1 240px',
            borderRadius: '10px',
            border: '1px solid #D8DEEF',
            padding: '8px 12px',
            fontSize: '13px',
            color: '#1B2A6B',
            outline: 'none',
            backgroundColor: '#FFFFFF',
          }}
        />
        <button
          type='button'
          onClick={submit}
          disabled={pending || email.trim() === ''}
          style={{
            borderRadius: '10px',
            border: '1px solid #1B2A6B',
            backgroundColor: '#1B2A6B',
            color: '#FFFFFF',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: pending ? 'wait' : 'pointer',
            opacity: pending || email.trim() === '' ? 0.7 : 1,
          }}
        >
          {pending
            ? 'A enviar…'
            : hasPendingInvite
              ? 'Reenviar convite'
              : 'Enviar convite'}
        </button>
      </div>

      {manualCode && (
        <div
          style={{
            marginTop: '12px',
            border: '1px solid #F2DEB6',
            backgroundColor: '#FFF9EE',
            borderRadius: '10px',
            padding: '10px 14px',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#8A5A00' }}>
            O email não foi entregue. Envie este código ao profissional — uso
            único, válido 7 dias. Ativação em: /ativar
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <code
              style={{
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '2px',
                color: '#1B2A6B',
              }}
            >
              {manualCode}
            </code>
            <button
              type='button'
              onClick={() => {
                navigator.clipboard?.writeText(manualCode);
                toast.success('Código copiado.');
              }}
              style={{
                borderRadius: '8px',
                border: '1px solid #D8DEEF',
                backgroundColor: '#FFFFFF',
                color: '#3A3F4A',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Copiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
