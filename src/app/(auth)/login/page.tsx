// 📄 src/app/(auth)/login/page.tsx
// =============================================================================
// CDC Manager — Página de login (único ponto de entrada dos 4 perfis;
// o redirect pós-login é decidido pelo role na action)
// =============================================================================

'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2, Lock, Mail } from 'lucide-react';
import { loginAction, type AuthFormState } from '@/actions/auth';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <div>
      <h2 className='text-2xl font-bold' style={{ color: '#1B2A6B' }}>
        Iniciar sessão
      </h2>
      <p className='mt-1 text-sm' style={{ color: '#6A7186' }}>
        Aceda à sua área no CDC Manager
      </p>

      <form action={formAction} className='mt-8 space-y-5'>
        <div>
          <label
            htmlFor='email'
            className='mb-1.5 block text-sm font-medium'
            style={{ color: '#3A3F4A' }}
          >
            Email
          </label>
          <div className='relative'>
            <Mail
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={{ color: '#9AA1B4' }}
            />
            <input
              id='email'
              name='email'
              type='email'
              autoComplete='email'
              required
              placeholder='o.seu.email@exemplo.pt'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition-shadow focus:ring-2'
              style={{
                borderColor: '#D8DEEF',
                color: '#1B2A6B',
              }}
            />
          </div>
        </div>

        <div>
          <div className='mb-1.5 flex items-center justify-between'>
            <label
              htmlFor='password'
              className='block text-sm font-medium'
              style={{ color: '#3A3F4A' }}
            >
              Password
            </label>
            <Link
              href='/recuperar-password'
              className='text-xs font-medium hover:underline'
              style={{ color: '#2743A6' }}
            >
              Esqueci a password
            </Link>
          </div>
          <div className='relative'>
            <Lock
              className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2'
              style={{ color: '#9AA1B4' }}
            />
            <input
              id='password'
              name='password'
              type='password'
              autoComplete='current-password'
              required
              placeholder='••••••••••'
              className='w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition-shadow focus:ring-2'
              style={{
                borderColor: '#D8DEEF',
                color: '#1B2A6B',
              }}
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
          {pending ? 'A entrar…' : 'Entrar'}
        </button>
      </form>

      <p
        className='mt-8 border-t pt-6 text-center text-sm'
        style={{ borderColor: '#EEF1F8', color: '#6A7186' }}
      >
        Primeiro acesso?{' '}
        <Link
          href='/ativar'
          className='font-medium hover:underline'
          style={{ color: '#2743A6' }}
        >
          Utilize o código enviado pela clínica
        </Link>
      </p>
    </div>
  );
}
