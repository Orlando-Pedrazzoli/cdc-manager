// 📄 src/components/medicos/DoctorPasswordResetPanel.tsx
// =============================================================================
// CDC Manager — Repor a senha de um médico sem email (9.ª ronda, 25/11/2026)
// -----------------------------------------------------------------------------
// Aparece na ficha do médico quando a conta dele é só de nome de utilizador:
// não há email para recuperar a senha sozinho, por isso é a gestão que a
// repõe. A senha nova é provisória — o médico volta a ter de escolher a sua
// no acesso seguinte. Fechado por omissão, para não ocupar a ficha.
// =============================================================================

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { resetDoctorPasswordAction } from '@/actions/doctors';

export default function DoctorPasswordResetPanel({
  doctorId,
  username,
  mustChangePassword,
}: {
  doctorId: string;
  username: string;
  /** A senha atual ainda é a provisória dada pela gestão */
  mustChangePassword: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await resetDoctorPasswordAction(doctorId, password);
      if ('error' in res) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      setPassword('');
      setOpen(false);
      toast.success(
        'Senha reposta. No próximo acesso o profissional escolhe a dele.',
        { duration: 7000 },
      );
      router.refresh();
    });
  };

  return (
    <div
      style={{
        marginTop: '14px',
        border: '1px solid #EEF1F8',
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#3D4257' }}>
          Entra com o utilizador <strong>{username}</strong>, sem email.
          {mustChangePassword && (
            <span style={{ color: '#9A6700', fontWeight: 600 }}>
              {' '}
              Ainda não escolheu a senha dele.
            </span>
          )}
        </p>
        <button
          type='button'
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            marginLeft: 'auto',
            borderRadius: '8px',
            border: '1px solid #D8DEEF',
            backgroundColor: '#FFFFFF',
            color: '#1B2A6B',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {open ? 'Cancelar' : 'Repor a senha'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type='text'
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder='Nova senha provisória'
              aria-label='Nova senha provisória'
              autoComplete='off'
              spellCheck={false}
              style={{
                flex: '1 1 220px',
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
              disabled={pending || !password}
              style={{
                borderRadius: '10px',
                border: '1px solid #1B2A6B',
                backgroundColor: '#1B2A6B',
                color: '#FFFFFF',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: pending ? 'wait' : 'pointer',
                opacity: pending || !password ? 0.7 : 1,
              }}
            >
              {pending ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#6A7186' }}>
            Pelo menos 10 caracteres, com minúscula, maiúscula e número.
            Entregue-a em mão: o profissional troca-a no próximo acesso. Se a
            conta estava bloqueada por tentativas falhadas, fica desbloqueada.
          </p>
        </div>
      )}
    </div>
  );
}
