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
    return { error: 'Este email já está associado a uma conta.' };
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
