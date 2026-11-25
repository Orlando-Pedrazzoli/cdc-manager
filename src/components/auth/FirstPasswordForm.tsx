// 📄 src/components/auth/FirstPasswordForm.tsx
// =============================================================================
// CDC Manager — Formulário da primeira senha
// -----------------------------------------------------------------------------
// Client component (useActionState → firstPasswordAction). A senha recebida
// da gestão é a prova de identidade; a nova segue a regra das contas da
// equipa (10+ caracteres com minúscula, maiúscula e número). Em caso de
// sucesso a action leva a pessoa à sua área — não há estado de sucesso aqui.
// =============================================================================

'use client';

import { useActionState } from 'react';
import { firstPasswordAction, logoutAction } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function FirstPasswordForm({
  name,
  username,
}: {
  name: string;
  username: string | null;
}) {
  const [state, action, pending] = useActionState(
    firstPasswordAction,
    undefined,
  );

  return (
    <div>
      <h2
        style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        Escolha a sua senha
      </h2>
      <p
        style={{
          margin: '8px 0 20px',
          fontSize: '14px',
          lineHeight: 1.5,
          color: '#6A7186',
        }}
      >
        Olá, <strong>{name}</strong>. A senha que recebeu da clínica serve só
        para este primeiro acesso
        {username ? (
          <>
            {' '}
            com o utilizador <strong>{username}</strong>
          </>
        ) : null}
        . Escolha agora uma senha que só o próprio conheça.
      </p>

      <form
        action={action}
        autoComplete='off'
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <Input
          id='currentPassword'
          name='currentPassword'
          type='password'
          label='Senha que recebeu'
          autoComplete='current-password'
          required
        />
        <Input
          id='newPassword'
          name='newPassword'
          type='password'
          label='Nova senha'
          help='Pelo menos 10 caracteres, com minúscula, maiúscula e número.'
          autoComplete='new-password'
          required
        />
        <Input
          id='confirm'
          name='confirm'
          type='password'
          label='Repetir a nova senha'
          autoComplete='new-password'
          required
        />

        {state && 'error' in state && (
          <p
            role='alert'
            style={{
              margin: 0,
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: '#FDECEA',
              color: '#B3261E',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {state.error}
          </p>
        )}

        <Button type='submit' loading={pending} fullWidth>
          Guardar e entrar
        </Button>
      </form>

      <form action={logoutAction} style={{ marginTop: '14px' }}>
        <button
          type='submit'
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            fontSize: '13px',
            fontWeight: 600,
            color: '#2743A6',
            cursor: 'pointer',
          }}
        >
          Sair sem alterar
        </button>
      </form>
    </div>
  );
}
