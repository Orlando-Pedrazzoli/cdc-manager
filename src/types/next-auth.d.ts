// 📄 src/types/next-auth.d.ts
// =============================================================================
// CDC Manager — Augmentação de tipos do NextAuth v5
// -----------------------------------------------------------------------------
// O import do submódulo 'next-auth/jwt' é OBRIGATÓRIO: sem ele, o TS trata
// o `declare module 'next-auth/jwt'` como módulo ambiente novo em vez de
// fundir com a interface JWT real — e os campos ficam `unknown`.
// =============================================================================

import type { UserRole, UserStatus } from '@/models/User';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      status: UserStatus;
      doctorId: string | null;
      patientId: string | null;
    };
  }

  interface User {
    id?: string;
    role: UserRole;
    status: UserStatus;
    doctorId: string | null;
    patientId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    role: UserRole;
    status: UserStatus;
    doctorId: string | null;
    patientId: string | null;
  }
}
