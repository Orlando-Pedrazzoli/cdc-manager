// 📄 src/app/(auth)/recuperar-password/page.tsx
// =============================================================================
// CDC Manager — Recuperação de password (duas fases no mesmo ecrã)
//
//   Fase 1 (request): utilizador introduz o email → recebe código por email.
//     A resposta é SEMPRE de sucesso (anti-enumeração — ver actions/auth.ts).
//   Fase 2 (confirm): código + nova password → login automático.
//
// Aceita ?codigo=CDC-XXXX-XXXX no URL (link do email pré-preenche e salta
// direto para a fase 2). Quem já tem código pode também saltar manualmente.
// =============================================================================

'use client';

import { Suspense, useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, Lock, Mail, MailCheck } from 'lucide-react';
import {
  requestPasswordResetAction,
  resetPasswordAction,
  type AuthFormState,
  type ResetRequestState,
} from '@/actions/auth';

const inputStyle = { borderColor: '#D8DEEF', color: '#1B2A6B' };
const labelStyle = { color: '#3A3F4A' };
const iconStyle = { color: '#9AA1B4' };

// -----------------------------------------------------------------------------
// Fase 1 — pedir o código
// -----------------------------------------------------------------------------
function RequestForm({
  email,
  onEmailChange,
  onHasCode,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onHasCode: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    ResetRequestState,
    FormData
  >(requestPasswordResetAction, undefined);

  // Sucesso: troca o formulário pela confirmação + atalho para a fase 2
  if (state && 'success' in state) {
    return (
      <div>
        <div
          className='mx-auto flex h-12 w-12 items-center justify-center rounded-full'
          style={{ backgroundColor: '#EAF0FF' }}
        >
          <MailCheck className='h-6 w-6' style={{ color: '#2743A6' }} />
        </div>
        <h2
          className='mt-4 text-center text-2xl font-bold'
          style={{ color: '#1B2A6B' }}
        >
          Verifique o seu email
        </h2>
        <p
          className='mt-2 text-center text-sm leading-relaxed'
          style={{ color: '#6A7186' }}
        >
          Se existir uma conta associada a esse email, enviámos um código de
          recuperação. O código é válido durante 7 dias.
        </p>
        <button
          type='button'
          onClick={onHasCode}
          className='mt-6 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'
          style={{ backgroundColor: '#2743A6' }}
        >
          Já tenho o código
        </button>
        <p className='mt-4 text-center text-xs' style={{ color: '#9AA1B4' }}>
          Não recebeu? Verifique o spam ou tente novamente daqui a 2 minutos.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className='text-2xl font-bold' style={{ color: '#1B2A6B' }}>
        Recuperar password
      </h2>
      <p className='mt-1 text-sm' style={{ color: '#6A7186' }}>
        Introduza o email da sua conta e enviamos-lhe um código de recuperação
      </p>

      <form action={formAction} className='mt-8 space-y-5'>
        <div>
          <label
            htmlFor='email'
            className='mb-1.5 block text-sm font-medium'
            style={labelStyle}
          >
            Email
          </label>
          <div className='relative'>
            <Mail
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={iconStyle}
            />
            <input
              id='email'
              name='email'
              type='email'
              autoComplete='email'
              required
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              placeholder='o.seu.email@exemplo.pt'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2'
              style={inputStyle}
            />
          </div>
        </div>

        {state && 'error' in state && (
          <p
            className='rounded-lg px-3 py-2 text-sm'
            style={{ backgroundColor: '#FDEDED', color: '#B3261E' }}
          >
            {state.error}
          </p>
        )}

        <button
          type='submit'
          disabled={pending}
          className='flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60'
          style={{ backgroundColor: '#2743A6' }}
        >
          {pending && <Loader2 className='h-4 w-4 animate-spin' />}
          Enviar código
        </button>

        <div className='flex items-center justify-between text-sm'>
          <button
            type='button'
            onClick={onHasCode}
            className='font-medium hover:underline'
            style={{ color: '#2743A6' }}
          >
            Já tenho um código
          </button>
          <Link
            href='/login'
            className='font-medium hover:underline'
            style={{ color: '#6A7186' }}
          >
            Voltar ao login
          </Link>
        </div>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Fase 2 — código + nova password
// -----------------------------------------------------------------------------
function ConfirmForm({
  email,
  prefilledCode,
  onBack,
}: {
  email: string;
  prefilledCode: string;
  onBack: () => void;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resetPasswordAction,
    undefined,
  );

  return (
    <div>
      <h2 className='text-2xl font-bold' style={{ color: '#1B2A6B' }}>
        Definir nova password
      </h2>
      <p className='mt-1 text-sm' style={{ color: '#6A7186' }}>
        Introduza o código recebido por email e escolha a nova password
      </p>

      <form action={formAction} className='mt-8 space-y-5'>
        <div>
          <label
            htmlFor='email'
            className='mb-1.5 block text-sm font-medium'
            style={labelStyle}
          >
            Email
          </label>
          <div className='relative'>
            <Mail
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={iconStyle}
            />
            <input
              id='email'
              name='email'
              type='email'
              autoComplete='email'
              required
              defaultValue={email}
              placeholder='o.seu.email@exemplo.pt'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2'
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor='code'
            className='mb-1.5 block text-sm font-medium'
            style={labelStyle}
          >
            Código de recuperação
          </label>
          <div className='relative'>
            <KeyRound
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={iconStyle}
            />
            <input
              id='code'
              name='code'
              type='text'
              autoComplete='one-time-code'
              required
              defaultValue={prefilledCode}
              placeholder='CDC-XXXX-XXXX'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm uppercase tracking-wider outline-none focus:ring-2'
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor='password'
            className='mb-1.5 block text-sm font-medium'
            style={labelStyle}
          >
            Nova password
          </label>
          <div className='relative'>
            <Lock
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={iconStyle}
            />
            <input
              id='password'
              name='password'
              type='password'
              autoComplete='new-password'
              required
              minLength={10}
              placeholder='Mínimo 10 caracteres, com maiúscula, minúscula e número'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2'
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor='confirm'
            className='mb-1.5 block text-sm font-medium'
            style={labelStyle}
          >
            Confirmar nova password
          </label>
          <div className='relative'>
            <Lock
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={iconStyle}
            />
            <input
              id='confirm'
              name='confirm'
              type='password'
              autoComplete='new-password'
              required
              minLength={10}
              placeholder='Repita a nova password'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2'
              style={inputStyle}
            />
          </div>
        </div>

        {state && 'error' in state && (
          <p
            className='rounded-lg px-3 py-2 text-sm'
            style={{ backgroundColor: '#FDEDED', color: '#B3261E' }}
          >
            {state.error}
          </p>
        )}

        <button
          type='submit'
          disabled={pending}
          className='flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60'
          style={{ backgroundColor: '#2743A6' }}
        >
          {pending && <Loader2 className='h-4 w-4 animate-spin' />}
          Redefinir password e entrar
        </button>

        <div className='flex items-center justify-between text-sm'>
          <button
            type='button'
            onClick={onBack}
            className='font-medium hover:underline'
            style={{ color: '#2743A6' }}
          >
            Pedir novo código
          </button>
          <Link
            href='/login'
            className='font-medium hover:underline'
            style={{ color: '#6A7186' }}
          >
            Voltar ao login
          </Link>
        </div>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Orquestração das duas fases (+ pré-preenchimento por ?codigo=)
// -----------------------------------------------------------------------------
function RecoverPasswordFlow() {
  const searchParams = useSearchParams();
  const prefilledCode = searchParams.get('codigo') ?? '';

  // Com código no URL, salta direto para a fase 2
  const [phase, setPhase] = useState<'request' | 'confirm'>(
    prefilledCode ? 'confirm' : 'request',
  );
  // Email partilhado entre fases (preenchido na 1 aparece na 2)
  const [email, setEmail] = useState('');

  return phase === 'request' ? (
    <RequestForm
      email={email}
      onEmailChange={setEmail}
      onHasCode={() => setPhase('confirm')}
    />
  ) : (
    <ConfirmForm
      email={email}
      prefilledCode={prefilledCode}
      onBack={() => setPhase('request')}
    />
  );
}

export default function RecoverPasswordPage() {
  return (
    <Suspense fallback={null}>
      <RecoverPasswordFlow />
    </Suspense>
  );
}
