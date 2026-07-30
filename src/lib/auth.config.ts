// 📄 src/lib/auth.config.ts
// =============================================================================
// CDC Manager — Configuração NextAuth EDGE-SAFE
// -----------------------------------------------------------------------------
// Este ficheiro é importado pelo middleware, que corre no Edge Runtime —
// portanto NÃO pode importar mongoose, bcrypt ou qualquer dependência Node.
// O provider Credentials (que usa ambos) vive em auth.ts, que só corre em
// Node. Este split é o padrão oficial do NextAuth v5 para Next.js.
//
// Aqui vive o RBAC de rotas: o callback `authorized` decide, para cada
// request interceptado pelo middleware, se o utilizador pode passar.
// =============================================================================

import type { NextAuthConfig } from 'next-auth';
import type { UserRole, UserStatus } from '@/models/User';

// Duração de sessão por perfil (segundos)
const STAFF_MAX_AGE = 8 * 60 * 60; // 8h — admin, receção, médicos
const PATIENT_MAX_AGE = 24 * 60 * 60; // 24h — pacientes

// Prefixos de rota por área
const ADMIN_PREFIX = '/admin'; // admin + receptionist
const DOCTOR_PREFIX = '/doutor'; // doctor
const PATIENT_PREFIX = '/conta'; // patient

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: PATIENT_MAX_AGE, // teto global; staff é encurtado no callback jwt
  },
  callbacks: {
    // Corre no middleware para CADA request às rotas do matcher
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;

      const isProtected =
        pathname.startsWith(ADMIN_PREFIX) ||
        pathname.startsWith(DOCTOR_PREFIX) ||
        pathname.startsWith(PATIENT_PREFIX);

      if (!isProtected) return true;

      // Sem sessão em rota protegida → NextAuth redireciona para /login
      if (!user) return false;

      // Conta desativada perde acesso imediato, mesmo com JWT válido
      if (user.status === 'disabled') return false;

      if (pathname.startsWith(ADMIN_PREFIX)) {
        return user.role === 'admin' || user.role === 'receptionist';
      }
      if (pathname.startsWith(DOCTOR_PREFIX)) {
        return user.role === 'doctor';
      }
      if (pathname.startsWith(PATIENT_PREFIX)) {
        return user.role === 'patient';
      }
      return false;
    },

    // Constrói o token no login e valida idade da sessão de staff
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
        token.status = user.status;
        token.doctorId = user.doctorId;
        token.patientId = user.patientId;
      }

      // Staff: expira às 8h. IMPORTANTE: no primeiro login o token ainda
      // não tem `iat` (é adicionado na codificação) — só validamos idade
      // quando ele existe, senão invalidaríamos o login no próprio ato
      const isStaff = token.role !== 'patient';
      if (isStaff && typeof token.iat === 'number') {
        const ageSeconds = Math.floor(Date.now() / 1000) - token.iat;
        if (ageSeconds > STAFF_MAX_AGE) {
          return null; // sessão de staff expirada → força novo login
        }
      }

      return token;
    },

    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as UserRole;
      session.user.status = token.status as UserStatus;
      session.user.doctorId = (token.doctorId as string | null) ?? null;
      session.user.patientId = (token.patientId as string | null) ?? null;
      return session;
    },
  },
  providers: [], // adicionados em auth.ts (Node-only)
} satisfies NextAuthConfig;
