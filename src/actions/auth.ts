// 📄 src/actions/auth.ts
// =============================================================================
// CDC Manager — Server Actions: autenticação
// -----------------------------------------------------------------------------
// login, logout, ativação de conta por código e recuperação de password.
// Todas validadas com Zod. O redirect pós-login é decidido pelo ROLE.
//
// NOTA (bugfix): após signIn(), o cookie de sessão acabado de ser escrito
// nem sempre é legível via auth() no MESMO request. Por isso o redirect
// pós-login lê o role diretamente da BD pelo email (infalível — o signIn
// já garantiu as credenciais).
//
// RECUPERAÇÃO DE PASSWORD — desenho anti-enumeração:
//   - O pedido devolve SEMPRE a mesma mensagem de sucesso, exista ou não
//     conta com aquele email. Um atacante nunca descobre emails registados.
//   - Reutiliza o mecanismo ActivationCode com purpose 'password-reset'
//     (SHA-256, uso único, 7 dias, consumo atómico).
//   - Cooldown de 2 minutos entre pedidos do mesmo user: impede spam de
//     emails à custa do nosso Resend (e do paciente).
//   - Contas 'invited' (sem password) não recebem reset — recebem instrução
//     para usar o código de ativação original... mas SEM o revelar na
//     resposta (mensagem genérica na mesma).
// =============================================================================

'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { auth, signIn, signOut } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';
import ActivationCode from '@/models/ActivationCode';
import {
  consumeActivationCode,
  createActivationCode,
  normalizeCode,
} from '@/lib/activation';
import { sendPasswordResetEmail } from '@/lib/resend';
import { logAudit } from '@/lib/audit';

export type AuthFormState = { error: string } | undefined;

// Estado do formulário de pedido de reset: sucesso tem mensagem própria
// (a página troca o formulário por uma confirmação "verifique o seu email")
export type ResetRequestState =
  | { error: string }
  | { success: true }
  | undefined;

const HOME_BY_ROLE: Record<string, string> = {
  admin: '/admin/dashboard',
  receptionist: '/admin/dashboard',
  doctor: '/doutor/dashboard',
  patient: '/conta',
};

// -----------------------------------------------------------------------------
// LOGIN
// -----------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(1, 'Password obrigatória'),
});

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // Mensagem única para qualquer falha — nunca revelar se o email
      // existe, se a conta está bloqueada, etc. (anti-enumeração)
      return {
        error: 'Credenciais inválidas. Verifique o email e a password.',
      };
    }
    throw err;
  }

  // Sessão criada — role lido da BD para decidir o destino
  await dbConnect();
  const user = await User.findOne({ email: parsed.data.email }).select('role');
  redirect(user ? (HOME_BY_ROLE[user.role] ?? '/login') : '/login');
}

// -----------------------------------------------------------------------------
// LOGOUT
// -----------------------------------------------------------------------------
export async function logoutAction(): Promise<void> {
  const session = await auth();
  if (session?.user?.id) {
    await logAudit({
      userId: session.user.id,
      action: 'logout',
      entityType: 'User',
      entityId: session.user.id,
    });
  }
  await signOut({ redirectTo: '/login' });
}

// -----------------------------------------------------------------------------
// ATIVAÇÃO DE CONTA (primeiro acesso com código)
// -----------------------------------------------------------------------------
const activateSchema = z
  .object({
    email: z.string().email('Email inválido').toLowerCase(),
    code: z
      .string()
      .min(8, 'Código inválido')
      .transform(v => normalizeCode(v)),
    password: z
      .string()
      .min(10, 'A password deve ter pelo menos 10 caracteres')
      .max(100, 'Password demasiado longa')
      .regex(/[a-z]/, 'Inclua pelo menos uma letra minúscula')
      .regex(/[A-Z]/, 'Inclua pelo menos uma letra maiúscula')
      .regex(/\d/, 'Inclua pelo menos um número'),
    confirm: z.string(),
  })
  .refine(d => d.password === d.confirm, {
    message: 'As passwords não coincidem',
    path: ['confirm'],
  });

export async function activateAccountAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = activateSchema.safeParse({
    email: formData.get('email'),
    code: formData.get('code'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { email, code, password } = parsed.data;

  await dbConnect();

  // 1. Consumir o código (atómico: válido → marcado como usado)
  const consumed = await consumeActivationCode({
    plainCode: code,
    purpose: 'account-activation',
  });
  if (!consumed) {
    return { error: 'Código inválido, expirado ou já utilizado.' };
  }

  // 2. O código tem de pertencer ao user COM ESTE email (o código sozinho
  //    não chega — quem o intercetar sem saber o email não ativa nada)
  const user = await User.findById(consumed.userId);
  if (!user || user.email !== email) {
    await logAudit({
      action: 'login-failed',
      entityType: 'User',
      entityId: consumed.userId,
      summary: 'Ativação recusada: email não corresponde ao código',
    });
    return { error: 'Os dados não correspondem. Confirme o email e o código.' };
  }
  if (user.status === 'disabled') {
    return { error: 'Esta conta está desativada. Contacte a clínica.' };
  }

  // 3. Definir password e ativar
  const passwordHash = await bcrypt.hash(password, 12);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        status: 'active',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    },
  );
  await logAudit({
    userId: user._id.toString(),
    action: 'update',
    entityType: 'User',
    entityId: user._id.toString(),
    summary: 'Conta ativada com código',
    changedFields: ['passwordHash', 'status'],
  });

  // 4. Login automático e entrada na área certa
  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch {
    // Improvável; se falhar, o utilizador faz login manual
    redirect('/login');
  }
  redirect(HOME_BY_ROLE[user.role] ?? '/login');
}

// -----------------------------------------------------------------------------
// RECUPERAÇÃO DE PASSWORD — Passo 1: pedido (envia código por email)
// -----------------------------------------------------------------------------
const resetRequestSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
});

// Cooldown entre pedidos consecutivos do mesmo user (anti-spam de emails)
const RESET_COOLDOWN_MS = 2 * 60 * 1000;

export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const email = parsed.data.email;

  await dbConnect();

  // A partir daqui, TODOS os caminhos devolvem { success: true }.
  // Diferenças de comportamento só existem do lado do servidor.
  const user = await User.findOne({ email }).select('_id name status');

  if (user && user.status === 'active') {
    // Cooldown: se já existe um código de reset criado há menos de 2 min,
    // não gera nem envia outro (a resposta continua a ser sucesso)
    const recent = await ActivationCode.findOne({
      userId: user._id,
      purpose: 'password-reset',
      usedAt: null,
      createdAt: { $gt: new Date(Date.now() - RESET_COOLDOWN_MS) },
    }).select('_id');

    if (!recent) {
      const { plainCode, expiresAt } = await createActivationCode({
        userId: user._id.toString(),
        purpose: 'password-reset',
        createdBy: user._id.toString(), // self-service
        sentVia: 'email',
      });

      const sent = await sendPasswordResetEmail({
        to: email,
        name: user.name,
        plainCode,
        expiresAt,
      });

      await logAudit({
        userId: user._id.toString(),
        action: 'update',
        entityType: 'User',
        entityId: user._id.toString(),
        summary: sent.ok
          ? 'Pedido de recuperação de password (email enviado)'
          : `Pedido de recuperação de password (FALHA no envio: ${sent.error})`,
      });
    }
  }
  // user inexistente / invited / disabled → nada é enviado, resposta idêntica

  return { success: true };
}

// -----------------------------------------------------------------------------
// RECUPERAÇÃO DE PASSWORD — Passo 2: confirmação (código + nova password)
// -----------------------------------------------------------------------------
// Mesmo schema de força de password da ativação (consistência de política)
const resetConfirmSchema = z
  .object({
    email: z.string().email('Email inválido').toLowerCase(),
    code: z
      .string()
      .min(8, 'Código inválido')
      .transform(v => normalizeCode(v)),
    password: z
      .string()
      .min(10, 'A password deve ter pelo menos 10 caracteres')
      .max(100, 'Password demasiado longa')
      .regex(/[a-z]/, 'Inclua pelo menos uma letra minúscula')
      .regex(/[A-Z]/, 'Inclua pelo menos uma letra maiúscula')
      .regex(/\d/, 'Inclua pelo menos um número'),
    confirm: z.string(),
  })
  .refine(d => d.password === d.confirm, {
    message: 'As passwords não coincidem',
    path: ['confirm'],
  });

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetConfirmSchema.safeParse({
    email: formData.get('email'),
    code: formData.get('code'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { email, code, password } = parsed.data;

  await dbConnect();

  // 1. Consumir o código de reset (atómico)
  const consumed = await consumeActivationCode({
    plainCode: code,
    purpose: 'password-reset',
  });
  if (!consumed) {
    return { error: 'Código inválido, expirado ou já utilizado.' };
  }

  // 2. Código + email têm de corresponder (mesmo princípio da ativação)
  const user = await User.findById(consumed.userId);
  if (!user || user.email !== email) {
    await logAudit({
      action: 'login-failed',
      entityType: 'User',
      entityId: consumed.userId,
      summary: 'Reset de password recusado: email não corresponde ao código',
    });
    return { error: 'Os dados não correspondem. Confirme o email e o código.' };
  }
  if (user.status !== 'active') {
    return { error: 'Esta conta não está ativa. Contacte a clínica.' };
  }

  // 3. Nova password + desbloqueio (um reset legítimo limpa o rate limit —
  //    o dono provou controlo do email, não faz sentido mantê-lo trancado)
  const passwordHash = await bcrypt.hash(password, 12);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    },
  );
  await logAudit({
    userId: user._id.toString(),
    action: 'update',
    entityType: 'User',
    entityId: user._id.toString(),
    summary: 'Password redefinida por código de recuperação',
    changedFields: ['passwordHash'],
  });

  // 4. Login automático com a nova password
  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch {
    redirect('/login');
  }
  redirect(HOME_BY_ROLE[user.role] ?? '/login');
}
