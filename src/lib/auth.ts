// 📄 src/lib/auth.ts
// =============================================================================
// CDC Manager — NextAuth v5 (instância completa, Node runtime)
// -----------------------------------------------------------------------------
// Junta a config edge-safe ao provider Credentials (bcrypt + Mongoose).
// Exporta { auth, signIn, signOut, handlers } usados em toda a app.
//
// SEGURANÇA DO LOGIN:
//   - bcrypt.compare em TODAS as tentativas (mesmo user inexistente →
//     compara contra hash dummy: tempo de resposta constante, sem user
//     enumeration por timing)
//   - Rate limiting: 5 falhas → bloqueio 15 min (campos no User)
//   - Contas 'invited' não fazem login (precisam de ativar primeiro)
//   - Auditoria de login / login-failed
// =============================================================================

import NextAuth from 'next-auth';
import { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';
import { logAudit } from '@/lib/audit';
import { authConfig } from '@/lib/auth.config';
import { readOrganizationSettings } from '@/lib/org-settings';
import {
  clientIpFromHeaders,
  isBlockedByNetwork,
} from '@/lib/network-access';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Hash dummy (password aleatória impossível) para tempo constante
const DUMMY_HASH =
  '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDuMkoTJYFvJZKp0Hqu8mKlXGZ2y';

/** 5.ª ronda/14: distingue "fora da rede" de credenciais erradas */
export class OutsideClinicError extends CredentialsSignin {
  code = 'outside-clinic';
}

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        await dbConnect();

        const user = await User.findOne({ email }).select('+passwordHash');

        // User inexistente → compara na mesma (timing constante) e sai
        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          await logAudit({
            action: 'login-failed',
            entityType: 'User',
            summary: `Login falhado: email desconhecido (${email})`,
          });
          return null;
        }

        // Conta bloqueada por tentativas?
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await logAudit({
            userId: user._id.toString(),
            action: 'login-failed',
            entityType: 'User',
            entityId: user._id.toString(),
            summary: 'Login recusado: conta temporariamente bloqueada',
          });
          return null;
        }

        // Convidada (sem password) ou desativada → não entra
        if (user.status !== 'active' || !user.passwordHash) {
          await bcrypt.compare(password, DUMMY_HASH);
          await logAudit({
            userId: user._id.toString(),
            action: 'login-failed',
            entityType: 'User',
            entityId: user._id.toString(),
            summary: `Login recusado: conta ${user.status}`,
          });
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          const attempts = (user.failedLoginAttempts ?? 0) + 1;
          const lock =
            attempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : null;
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                failedLoginAttempts: lock ? 0 : attempts,
                lockedUntil: lock,
              },
            },
          );
          await logAudit({
            userId: user._id.toString(),
            action: 'login-failed',
            entityType: 'User',
            entityId: user._id.toString(),
            summary: lock
              ? `Password errada (${MAX_FAILED_ATTEMPTS}.ª) — conta bloqueada ${LOCK_MINUTES} min`
              : `Password errada (tentativa ${attempts})`,
          });
          return null;
        }

        // 5.ª ronda/14: perfis limitados à rede da clínica não entram de
        // fora (a password estava certa — fica registado, sem contar como
        // tentativa falhada)
        const { network } = await readOrganizationSettings();
        if (network.enabled) {
          const ip = request?.headers
            ? clientIpFromHeaders(request.headers)
            : null;
          if (isBlockedByNetwork(user.role, ip, network)) {
            await logAudit({
              userId: user._id.toString(),
              action: 'login-failed',
              entityType: 'User',
              entityId: user._id.toString(),
              summary: `Login recusado: fora da rede da clínica (IP ${ip ?? 'desconhecido'})`,
            });
            throw new OutsideClinicError();
          }
        }

        // Sucesso: limpa contadores e regista
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
            },
          },
        );
        await logAudit({
          userId: user._id.toString(),
          action: 'login',
          entityType: 'User',
          entityId: user._id.toString(),
          summary: `Login (${user.role})`,
        });

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          doctorId: user.doctorId?.toString() ?? null,
          patientId: user.patientId?.toString() ?? null,
        };
      },
    }),
  ],
});
