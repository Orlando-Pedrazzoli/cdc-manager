// 📄 src/components/configuracoes/ChangePasswordForm.tsx
// =============================================================================
// CDC Manager — Configurações → A minha conta: mudança de password
// -----------------------------------------------------------------------------
// Client component (useActionState → changeOwnPasswordAction). A prova de
// identidade é a password ATUAL — uma sessão aberta num computador da clínica
// não chega para trocar a password.
// Convenção Tailwind v4 + Next 16: TODO o visual crítico em inline style.
// =============================================================================

'use client';

import { useActionState, useEffect, useRef } from 'react';
import { changeOwnPasswordAction } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(
    changeOwnPasswordAction,
    undefined,
  );

  // Limpar os campos após sucesso (não deixar passwords no DOM)
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && 'success' in state) formRef.current?.reset();
  }, [state]);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '24px',
        maxWidth: 520,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 700,
          color: '#1C2233',
        }}
      >
        Mudar password
      </h2>
      <p style={{ margin: '6px 0 18px', fontSize: '13px', color: '#6A7186' }}>
        Sessão iniciada como <strong>{email}</strong>. Por segurança, é
        necessária a password atual.
      </p>

      <form
        ref={formRef}
        action={action}
        autoComplete='off'
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        {/* Ajuda os gestores de passwords a associar a conta certa */}
        <input
          type='email'
          name='email'
          value={email}
          readOnly
          hidden
          autoComplete='username'
        />

        <Input
          id='pw-current'
          name='currentPassword'
          type='password'
          label='Password atual'
          autoComplete='current-password'
          required
        />
        <Input
          id='pw-new'
          name='newPassword'
          type='password'
          label='Nova password'
          autoComplete='new-password'
          help='Mínimo 10 caracteres'
          required
          minLength={10}
        />
        <Input
          id='pw-confirm'
          name='confirm'
          type='password'
          label='Confirmar nova password'
          autoComplete='new-password'
          required
          minLength={10}
        />

        {state && 'error' in state && (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#B4232A',
              backgroundColor: '#FDEEEE',
              border: '1px solid #F3C9CB',
              borderRadius: '10px',
              padding: '9px 12px',
            }}
          >
            {state.error}
          </p>
        )}
        {state && 'success' in state && (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#186A3B',
              backgroundColor: '#EAF7EF',
              border: '1px solid #C4E6D1',
              borderRadius: '10px',
              padding: '9px 12px',
            }}
          >
            Password alterada com sucesso. Use a nova password no próximo login.
          </p>
        )}

        <div>
          <Button type='submit' disabled={pending}>
            {pending ? 'A guardar…' : 'Guardar nova password'}
          </Button>
        </div>
      </form>
    </div>
  );
}
