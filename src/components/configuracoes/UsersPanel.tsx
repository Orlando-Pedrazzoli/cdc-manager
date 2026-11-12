// 📄 src/components/configuracoes/UsersPanel.tsx
// =============================================================================
// CDC Manager — Configurações → Utilizadores: a equipa com acesso ao sistema
// -----------------------------------------------------------------------------
// O admin convida administradores e rececionistas por email (fluxo /ativar:
// o convidado define a própria password com código de uso único). Contas
// nunca se apagam — desativam-se. As guardas de lockout (auto-desativação,
// último admin) vivem na server action; aqui só escondemos o que não é
// possível para não convidar ao erro.
// Convenção Tailwind v4 + Next 16: visual crítico em inline style.
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  adminSetPasswordAction,
  createUsernameAccountAction,
  inviteUserAction,
  resendInviteAction,
  setUserActiveAction,
  type UsersActionState,
} from '@/actions/users';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export interface TeamUser {
  id: string;
  name: string;
  /** '' nas contas só com nome de utilizador */
  email: string;
  username?: string | null;
  role: 'admin' | 'receptionist';
  status: 'invited' | 'active' | 'disabled';
  createdAt: string; // já formatado (pt-PT)
}

const ROLE_LABEL: Record<TeamUser['role'], string> = {
  admin: 'Administração',
  receptionist: 'Receção',
};

function StatusBadge({ status }: { status: TeamUser['status'] }) {
  if (status === 'active') return <Badge variant='success'>Ativa</Badge>;
  if (status === 'invited') return <Badge variant='warning'>Convidada</Badge>;
  return <Badge variant='neutral'>Desativada</Badge>;
}

function Feedback({ state }: { state: UsersActionState }) {
  if (!state) return null;
  if ('error' in state) {
    return (
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
    );
  }
  return (
    <div
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
      {state.message}
      {state.manualCode && (
        <code
          style={{
            display: 'inline-block',
            marginLeft: 8,
            padding: '2px 8px',
            borderRadius: '6px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #C4E6D1',
            fontWeight: 700,
            letterSpacing: '1px',
          }}
        >
          {state.manualCode}
        </code>
      )}
    </div>
  );
}

export function UsersPanel({
  users,
  currentUserId,
}: {
  users: TeamUser[];
  currentUserId: string;
}) {
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteUserAction,
    undefined,
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendInviteAction,
    undefined,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    setUserActiveAction,
    undefined,
  );
  // Saber a que linha pertence o pending/feedback das ações por-linha
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // Login só com nome e senha (Victor, 11/11/2026)
  const [createState, createAction, createPending] = useActionState(
    createUsernameAccountAction,
    undefined,
  );
  const [pwState, pwAction, pwPending] = useActionState(
    adminSetPasswordAction,
    undefined,
  );
  const [pwFor, setPwFor] = useState<string | null>(null);

  const inviteFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (inviteState && 'success' in inviteState) inviteFormRef.current?.reset();
  }, [inviteState]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* --- Convidar ---------------------------------------------------------- */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '20px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          Convidar membro da equipa
        </h2>
        <p style={{ margin: '4px 0 14px', fontSize: '13px', color: '#6A7186' }}>
          O convidado recebe um email com código de uso único e define a própria
          password em «Ativar conta». Ninguém cria passwords por terceiros.
        </p>
        <form
          ref={inviteFormRef}
          action={inviteAction}
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 2, minWidth: 180 }}>
            <Input id='inv-name' name='name' label='Nome' required />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <Input
              id='inv-email'
              name='email'
              type='email'
              label='Email'
              required
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <Select
              id='inv-role'
              name='role'
              label='Perfil'
              defaultValue='admin'
            >
              <option value='admin'>Administração</option>
              <option value='receptionist'>Receção</option>
            </Select>
          </div>
          <Button type='submit' disabled={invitePending}>
            {invitePending ? 'A enviar…' : 'Enviar convite'}
          </Button>
        </form>
        <div style={{ marginTop: 10 }}>
          <Feedback state={inviteState} />
        </div>
      </div>

      {/* --- Conta só com nome de utilizador e senha (receção) ------------------ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '20px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1C2233' }}>
          Conta da receção sem email
        </h2>
        <p style={{ margin: '6px 0 14px', fontSize: '13px', color: '#6A7186', lineHeight: 1.5 }}>
          A colaboradora entra só com o nome de utilizador e a senha. A conta
          fica logo ativa; entregue-lhe a senha em mão. Se a esquecer, repõe-se
          aqui na lista, em “Repor senha”.
        </p>
        <form
          action={createAction}
          autoComplete='off'
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <Input name='name' label='Nome' required maxLength={120} placeholder='Ana Silva' />
          <Input
            name='username'
            label='Nome de utilizador'
            required
            maxLength={30}
            placeholder='ana.silva'
            autoCapitalize='none'
            autoComplete='off'
          />
          <Input
            name='password'
            type='password'
            label='Senha inicial'
            required
            autoComplete='new-password'
            help='10+ caracteres, com maiúscula, minúscula e número'
          />
          <Button type='submit' disabled={createPending}>
            {createPending ? 'A criar…' : 'Criar conta'}
          </Button>
        </form>
        <div style={{ marginTop: 10 }}>
          <Feedback state={createState} />
        </div>
      </div>

      {/* --- Lista ------------------------------------------------------------- */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '13px 20px',
            borderBottom: '1px solid #EEF1F8',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          Equipa com acesso ({users.length})
        </div>
        {users.map((u, i) => {
          const isSelf = u.id === currentUserId;
          return (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 20px',
                borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1C2233',
                  }}
                >
                  {u.name}
                  {isSelf && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#2743A6',
                      }}
                    >
                      (você)
                    </span>
                  )}
                </p>
                <p
                  style={{
                    margin: '1px 0 0',
                    fontSize: '12px',
                    color: '#6A7186',
                  }}
                >
                  {u.username ? `utilizador: ${u.username}` : u.email}
                  {u.username && u.email ? ` · ${u.email}` : ''} · desde{' '}
                  {u.createdAt}
                </p>
              </div>
              <Badge variant={u.role === 'admin' ? 'info' : 'neutral'}>
                {ROLE_LABEL[u.role]}
              </Badge>
              <StatusBadge status={u.status} />
              <div style={{ display: 'flex', gap: '8px' }}>
                {u.status === 'invited' && (
                  <form action={resendAction} onSubmit={() => setRowBusy(u.id)}>
                    <input type='hidden' name='userId' value={u.id} />
                    <Button
                      type='submit'
                      variant='secondary'
                      size='sm'
                      disabled={resendPending && rowBusy === u.id}
                    >
                      Reenviar convite
                    </Button>
                  </form>
                )}
                {u.role === 'receptionist' && u.status !== 'disabled' && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={() => setPwFor(pwFor === u.id ? null : u.id)}
                  >
                    Repor senha
                  </Button>
                )}
                {u.status !== 'invited' && !isSelf && (
                  <form action={toggleAction} onSubmit={() => setRowBusy(u.id)}>
                    <input type='hidden' name='userId' value={u.id} />
                    <input
                      type='hidden'
                      name='enable'
                      value={u.status === 'disabled' ? 'true' : 'false'}
                    />
                    <Button
                      type='submit'
                      variant={u.status === 'disabled' ? 'secondary' : 'danger'}
                      size='sm'
                      disabled={togglePending && rowBusy === u.id}
                    >
                      {u.status === 'disabled' ? 'Reativar' : 'Desativar'}
                    </Button>
                  </form>
                )}
              </div>
              {pwFor === u.id && (
                <form
                  action={pwAction}
                  autoComplete='off'
                  style={{
                    flexBasis: '100%',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-end',
                    flexWrap: 'wrap',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#F8F9FD',
                  }}
                >
                  <input type='hidden' name='userId' value={u.id} />
                  <div style={{ flex: '1 1 240px' }}>
                    <Input
                      name='password'
                      type='password'
                      label={`Nova senha de ${u.name}`}
                      required
                      autoComplete='new-password'
                      help='10+ caracteres, com maiúscula, minúscula e número. Entregue-a em mão.'
                    />
                  </div>
                  <Button type='submit' size='sm' disabled={pwPending}>
                    {pwPending ? 'A guardar…' : 'Guardar nova senha'}
                  </Button>
                  <Button type='button' size='sm' variant='secondary' onClick={() => setPwFor(null)}>
                    Cancelar
                  </Button>
                </form>
              )}
            </div>
          );
        })}
        <div style={{ padding: '10px 20px' }}>
          <Feedback state={pwState} />
          <Feedback state={resendState} />
          <Feedback state={toggleState} />
        </div>
      </div>
    </div>
  );
}
