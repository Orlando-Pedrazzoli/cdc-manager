// 📄 src/actions/users.ts
// =============================================================================
// CDC Manager — Gestão de utilizadores da equipa (Configurações → Utilizadores)
// -----------------------------------------------------------------------------
// O Victor (ou qualquer admin) convida ADMINISTRADORES e RECECIONISTAS por
// email — nunca cria passwords por terceiros: o convidado ativa a conta com
// código de uso único e define a própria password (fluxo /ativar já existente,
// o mesmo dos médicos e do portal do paciente).
//
// Regras de segurança inegociáveis:
//   · Só admins gerem utilizadores; este painel só toca em contas
//     admin/receptionist (médicos têm o seu fluxo próprio; pacientes idem).
//   · NEVER DELETE: contas desativam-se (status 'disabled'), nunca se apagam
//     — a trilha de auditoria referencia-as para sempre.
//   · Ninguém se desativa a si próprio (lockout acidental).
//   · O último admin ativo é INTOCÁVEL — o sistema nunca fica sem gerência.
//   · Tudo auditado (quem convidou, quem desativou, quem reativou).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import User from '@/models/User';
import { createActivationCode } from '@/lib/activation';
import { sendActivationEmail } from '@/lib/resend';
import { logAudit } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import {
  isValidUsername,
  normalizeUsername,
  passwordProblem,
  placeholderEmail,
} from '@/lib/username';

export type UsersActionState =
  | { error: string }
  | { success: true; message: string; manualCode?: string }
  | undefined;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

async function requireAdmin(): Promise<
  { adminId: string } | { error: string }
> {
  const session = await auth();
  if (session?.user?.role !== 'admin' || !session.user.id) {
    return { error: 'Sem permissões.' };
  }

  await dbConnect();
  const admin = await User.findById(session.user.id).select('role status').lean();
  if (!admin || admin.status !== 'active' || admin.role !== 'admin') {
    return { error: 'Conta inativa ou permissões alteradas. Inicie sessão novamente.' };
  }
  return { adminId: session.user.id };
}

// -----------------------------------------------------------------------------
// CONVIDAR — cria a conta 'invited' + código + email de ativação
// -----------------------------------------------------------------------------
const inviteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Indique o nome')
    .max(120, 'Nome demasiado longo'),
  email: z.email('Email inválido').transform(v => v.toLowerCase().trim()),
  role: z.enum(['admin', 'receptionist'], {
    error: 'Perfil inválido',
  }),
});

export async function inviteUserAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const parsed = inviteSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, role } = parsed.data;
  const roleLabel = role === 'admin' ? 'administrador' : 'rececionista';

  await dbConnect();

  const existing = await User.findOne({ email }).select('role status');
  if (existing) {
    // Reconvite implícito só se for a MESMA situação pendente
    if (existing.status === 'invited' && existing.role === role) {
      return resendCodeFor(String(existing._id), guard.adminId);
    }
    // 1 email = 1 conta = 1 perfil — mensagem informativa (mesma lógica
    // do convite de médicos em doctors.ts)
    const roleLabel: Record<string, string> = {
      patient: 'uma conta de PACIENTE',
      admin: 'uma conta de ADMINISTRADOR',
      receptionist: 'uma conta de RECEÇÃO',
      doctor: 'uma conta de MÉDICO',
    };
    return {
      error: `Este email já pertence a ${roleLabel[existing.role] ?? 'outra conta'}. Cada perfil precisa do seu próprio email — use um email distinto para este perfil, ou um alias como nome+cdc@gmail.com (entrega na mesma caixa).`,
    };
  }

  const created = await User.create({
    name,
    email,
    role,
    status: 'invited',
  });

  const result = await resendCodeFor(String(created._id), guard.adminId);

  await logAudit({
    userId: guard.adminId,
    action: 'create',
    entityType: 'User',
    entityId: String(created._id),
    summary: `Utilizador convidado: ${name} (${roleLabel})`,
  });

  revalidatePath('/admin/configuracoes');
  return result;
}

// -----------------------------------------------------------------------------
// REENVIAR CONVITE — novo código (invalida anteriores), novo email
// -----------------------------------------------------------------------------
const idSchema = z.object({
  userId: z.string().regex(OBJECT_ID, 'Utilizador inválido'),
});

export async function resendInviteAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const parsed = idSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await dbConnect();
  const user = await User.findById(parsed.data.userId).select(
    'name email role status',
  );
  if (!user || !['admin', 'receptionist'].includes(user.role)) {
    return { error: 'Utilizador não encontrado.' };
  }
  if (user.status !== 'invited') {
    return { error: 'Esta conta já foi ativada.' };
  }

  const result = await resendCodeFor(String(user._id), guard.adminId);
  revalidatePath('/admin/configuracoes');
  return result;
}

async function resendCodeFor(
  userId: string,
  adminId: string,
): Promise<UsersActionState> {
  const user = await User.findById(userId).select('name email');
  if (!user?.email) return { error: 'Conta sem email.' };

  const { plainCode, expiresAt } = await createActivationCode({
    userId,
    purpose: 'account-activation',
    createdBy: adminId,
    sentVia: 'email',
  });
  const sent = await sendActivationEmail({
    to: user.email,
    name: user.name,
    plainCode,
    expiresAt,
  });

  await logAudit({
    userId: adminId,
    action: 'create',
    entityType: 'ActivationCode',
    entityId: userId,
    summary: sent.ok
      ? `Convite enviado a ${user.name} (${user.email})`
      : `Convite de ${user.name} criado; FALHA no email (${sent.error})`,
  });

  // Email falhou (Resend em baixo, domínio, etc.) → o admin entrega o
  // código em mão; o convite não fica bloqueado pela infraestrutura
  return sent.ok
    ? {
        success: true,
        message: `Convite enviado para ${user.email}. Válido até ${expiresAt.toLocaleDateString('pt-PT')}.`,
      }
    : {
        success: true,
        message: `O email falhou — entregue este código manualmente (uso único):`,
        manualCode: plainCode,
      };
}

// -----------------------------------------------------------------------------
// DESATIVAR / REATIVAR — nunca apagar; guardas de lockout
// -----------------------------------------------------------------------------
export async function setUserActiveAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const parsed = idSchema.extend({ enable: z.coerce.boolean() }).safeParse({
    userId: formData.get('userId'),
    enable: formData.get('enable') === 'true',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { userId, enable } = parsed.data;

  await dbConnect();

  const user = await User.findById(userId).select('name role status');
  if (!user || !['admin', 'receptionist'].includes(user.role)) {
    return { error: 'Utilizador não encontrado.' };
  }

  if (!enable) {
    // --- Desativar: as duas guardas de lockout ------------------------------
    if (userId === guard.adminId) {
      return { error: 'Não pode desativar a sua própria conta.' };
    }
    if (user.role === 'admin' && user.status === 'active') {
      const otherActiveAdmins = await User.countDocuments({
        _id: { $ne: user._id },
        role: 'admin',
        status: 'active',
      });
      if (otherActiveAdmins === 0) {
        return {
          error:
            'Não é possível desativar o último administrador ativo do sistema.',
        };
      }
    }
    if (user.status === 'disabled') {
      return { success: true, message: 'Conta já estava desativada.' };
    }
    user.set('status', 'disabled');
    await user.save();
  } else {
    // --- Reativar: só contas desativadas (invited ativa-se pelo código) ----
    if (user.status !== 'disabled') {
      return { error: 'Só contas desativadas podem ser reativadas.' };
    }
    user.set('status', 'active');
    await user.save();
  }

  await logAudit({
    userId: guard.adminId,
    action: 'update',
    entityType: 'User',
    entityId: userId,
    summary: `Conta ${enable ? 'reativada' : 'desativada'}: ${user.name}`,
    changedFields: ['status'],
  });

  revalidatePath('/admin/configuracoes');
  return {
    success: true,
    message: `Conta de ${user.name} ${enable ? 'reativada' : 'desativada'}.`,
  };
}

// -----------------------------------------------------------------------------
// CONTA SÓ COM NOME DE UTILIZADOR E SENHA (Victor, 11/11/2026)
// -----------------------------------------------------------------------------
// "Prefiro sem e-mail, só com nome e senha, que é mais prático. Se a
// colaboradora se esquecer da senha, a gestão poderia redefini-la."
// A gestão cria a conta da RECEÇÃO já ativa, com uma senha inicial que
// entrega em mão; a colaboradora pode mudá-la em Configurações → Conta.
// Só para a receção: administração e médicos continuam com email (têm
// recuperação de senha autónoma e, no caso da gestão, acesso total).
// -----------------------------------------------------------------------------
export async function createUsernameAccountAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const name = String(formData.get('name') ?? '').trim();
  const username = normalizeUsername(String(formData.get('username') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (name.length < 2 || name.length > 120) return { error: 'Indique o nome.' };
  if (!isValidUsername(username)) {
    return {
      error:
        'Nome de utilizador inválido: 3 a 30 caracteres, só letras, números, ponto, hífen ou sublinhado (ex.: ana.silva).',
    };
  }
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  await dbConnect();
  const taken = await User.exists({
    $or: [{ username }, { email: placeholderEmail(username) }],
  });
  if (taken) {
    return { error: `O nome de utilizador "${username}" já existe.` };
  }

  const created = await User.create({
    name,
    username,
    email: placeholderEmail(username),
    role: 'receptionist',
    status: 'active',
    passwordHash: await bcrypt.hash(password, 12),
  });
  await logAudit({
    userId: guard.adminId,
    action: 'create',
    entityType: 'User',
    entityId: String(created._id),
    summary: `Conta da receção criada com nome de utilizador: ${name} (${username})`,
  });
  revalidatePath('/admin/configuracoes');
  return {
    success: true,
    message: `Conta criada. ${name} entra com o utilizador "${username}" e a senha que definiu.`,
  };
}

// -----------------------------------------------------------------------------
// REPOR A SENHA DE UMA CONTA DA RECEÇÃO (pela gestão)
// -----------------------------------------------------------------------------
// Só contas da receção: a senha de outro administrador nunca é reposta por
// aqui (cada um recupera a sua por email). Desbloqueia também a conta se
// estava bloqueada por tentativas falhadas.
// -----------------------------------------------------------------------------
export async function adminSetPasswordAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard;

  const parsed = idSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const password = String(formData.get('password') ?? '');
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  await dbConnect();
  const user = await User.findById(parsed.data.userId).select(
    'name role status username',
  );
  if (!user || user.role !== 'receptionist') {
    return { error: 'Só é possível repor a senha de contas da receção.' };
  }
  if (user.status === 'disabled') {
    return { error: 'Conta desativada — reative-a primeiro.' };
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await bcrypt.hash(password, 12),
        status: 'active',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    },
  );
  await logAudit({
    userId: guard.adminId,
    action: 'update',
    entityType: 'User',
    entityId: String(user._id),
    summary: `Senha reposta pela gestão: ${user.name}`,
    changedFields: ['passwordHash'],
  });
  revalidatePath('/admin/configuracoes');
  return {
    success: true,
    message: `Senha de ${user.name} reposta. Entregue-lhe a nova senha em mão.`,
  };
}
