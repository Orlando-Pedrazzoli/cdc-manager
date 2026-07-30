// 📄 src/app/(auth)/ativar/page.tsx
// =============================================================================
// CDC Manager — Ativação de conta (primeiro acesso)
// Aceita ?codigo=CDC-XXXX-XXXX no URL (link enviado por email/WhatsApp
// pré-preenche o campo) ou introdução manual.
// =============================================================================

'use client';

import { Suspense, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, Lock, Mail } from 'lucide-react';
import { activateAccountAction, type AuthFormState } from '@/actions/auth';

function ActivateForm() {
  const searchParams = useSearchParams();
  const prefilledCode = searchParams.get('codigo') ?? '';
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    activateAccountAction,
    undefined,
  );

  const inputStyle = { borderColor: '#D8DEEF', color: '#1B2A6B' };
  const labelStyle = { color: '#3A3F4A' };
  const iconStyle = { color: '#9AA1B4' };

  return (
    <div>
      <h2 className='text-2xl font-bold' style={{ color: '#1B2A6B' }}>
        Ativar conta
      </h2>
      <p className='mt-1 text-sm' style={{ color: '#6A7186' }}>
        Introduza o código enviado pela clínica e defina a sua password
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
              placeholder='o.email.registado.na.clinica@exemplo.pt'
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
            Código de ativação
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
              defaultValue={prefilledCode}
              required
              placeholder='CDC-XXXX-XXXX'
              autoCapitalize='characters'
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
            Confirmar password
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
              placeholder='Repita a password'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2'
              style={inputStyle}
            />
          </div>
        </div>

        {state?.error && (
          <div
            className='rounded-lg px-4 py-3 text-sm'
            style={{ backgroundColor: '#FDECEC', color: '#B3261E' }}
            role='alert'
          >
            {state.error}
          </div>
        )}

        <button
          type='submit'
          disabled={pending}
          className='flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60'
          style={{ backgroundColor: '#2743A6', color: '#FFFFFF' }}
        >
          {pending && <Loader2 className='h-4 w-4 animate-spin' />}
          {pending ? 'A ativar…' : 'Ativar conta e entrar'}
        </button>
      </form>

      <p
        className='mt-8 border-t pt-6 text-center text-sm'
        style={{ borderColor: '#EEF1F8', color: '#6A7186' }}
      >
        Já tem conta ativa?{' '}
        <Link
          href='/login'
          className='font-medium hover:underline'
          style={{ color: '#2743A6' }}
        >
          Iniciar sessão
        </Link>
      </p>
    </div>
  );
}

export default function ActivatePage() {
  // useSearchParams exige Suspense boundary no App Router
  return (
    <Suspense fallback={null}>
      <ActivateForm />
    </Suspense>
  );
}
