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
//
// 9.ª ronda (Victor, 25/11/2026): "alguns médicos não querem vincular o email
// pessoal com a clínica". O painel passa a ter dois caminhos: SEM EMAIL
// (nome de utilizador + senha inicial entregue em mão, que o médico é
// obrigado a trocar no primeiro acesso) e COM EMAIL (o convite de sempre).
// =============================================================================

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  createDoctorUsernameAccountAction,
  inviteDoctorAccountAction,
} from '@/actions/doctors';
import { normalizeUsername } from '@/lib/username';

/** "ANA PAULA BORGES DRA." → "ana.borges" (sugestão; a gestão pode mudar) */
function suggestUsername(name: string): string {
  const words = normalizeUsername(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter(w => w && !['dr', 'dra', 'dr.', 'dra.'].includes(w));
  if (words.length === 0) return '';
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';
  return (last ? `${first}.${last}` : first).slice(0, 30);
}

const fieldStyle: React.CSSProperties = {
  flex: '1 1 200px',
  borderRadius: '10px',
  border: '1px solid #D8DEEF',
  padding: '8px 12px',
  fontSize: '13px',
  color: '#1B2A6B',
  outline: 'none',
  backgroundColor: '#FFFFFF',
};

export default function DoctorInvitePanel({
  doctorId,
  doctorName,
  hasPendingInvite,
  currentEmail,
}: {
  doctorId: string;
  doctorName: string;
  hasPendingInvite: boolean;
  currentEmail: string | null;
}) {
  const router = useRouter();
  // Com convite por email já pendente, abre nesse caminho; senão, sem email
  const [mode, setMode] = useState<'username' | 'email'>(
    hasPendingInvite ? 'email' : 'username',
  );
  const [username, setUsername] = useState(() => suggestUsername(doctorName));
  const [password, setPassword] = useState('');
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

  const createByUsername = () => {
    startTransition(async () => {
      const res = await createDoctorUsernameAccountAction(
        doctorId,
        username,
        password,
      );
      if ('error' in res) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      setPassword('');
      toast.success(
        `Conta criada. Entra com o utilizador "${res.username}" e a senha que definiu; no primeiro acesso escolhe a dele.`,
        { duration: 9000 },
      );
      router.refresh();
    });
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    borderRadius: '999px',
    border: `1px solid ${active ? '#1B2A6B' : '#D8DEEF'}`,
    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#1B2A6B',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  });

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
      <div
        role='tablist'
        aria-label='Como criar a conta'
        style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' }}
      >
        <button
          type='button'
          role='tab'
          aria-selected={mode === 'username'}
          onClick={() => setMode('username')}
          style={tabStyle(mode === 'username')}
        >
          Sem email (utilizador e senha)
        </button>
        <button
          type='button'
          role='tab'
          aria-selected={mode === 'email'}
          onClick={() => setMode('email')}
          style={tabStyle(mode === 'email')}
        >
          Com email (convite)
        </button>
      </div>

      {mode === 'username' && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#6A7186' }}>
            Para quem não quer ligar o email pessoal à clínica. Defina o nome
            de utilizador e uma senha inicial e entregue-os em mão: no
            primeiro acesso o profissional é obrigado a escolher a sua senha.
            {hasPendingInvite
              ? ' O convite por email pendente deixa de ser válido.'
              : ''}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type='text'
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder='ana.silva'
              aria-label='Nome de utilizador'
              autoComplete='off'
              autoCapitalize='none'
              spellCheck={false}
              style={fieldStyle}
            />
            <input
              type='text'
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder='Senha inicial'
              aria-label='Senha inicial'
              autoComplete='off'
              spellCheck={false}
              style={fieldStyle}
            />
            <button
              type='button'
              onClick={createByUsername}
              disabled={pending || !username.trim() || !password}
              style={{
                borderRadius: '10px',
                border: '1px solid #1B2A6B',
                backgroundColor: '#1B2A6B',
                color: '#FFFFFF',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: pending ? 'wait' : 'pointer',
                opacity: pending || !username.trim() || !password ? 0.7 : 1,
              }}
            >
              {pending ? 'A criar…' : 'Criar conta'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#6A7186' }}>
            Senha inicial: pelo menos 10 caracteres, com minúscula, maiúscula e
            número. Fica visível aqui para a poder copiar; não é guardada em
            claro.
          </p>
        </>
      )}

      {mode === 'email' && (
      <>
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
      </>
      )}

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
