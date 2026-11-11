// 📄 src/actions/operations.ts
// =============================================================================
// CDC Manager — Server Actions: definições operacionais (5.ª ronda, nov. 2026)
// -----------------------------------------------------------------------------
// · Promoção do mês (09) — texto curto, atualizado a cada mês; aparece como
//   opção em "Como nos conheceu" na nova marcação.
// · Acesso só dentro da clínica (14) — lista de IP públicos permitidos e
//   perfis abrangidos. A administração nunca é abrangida. Não deixa ligar a
//   restrição com a lista vazia.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Organization from '@/models/Organization';
import User from '@/models/User';
import { RESTRICTABLE_ROLES, isValidAllowEntry } from '@/lib/network-access';

export type OperationsActionState =
  | { success: true; message: string }
  | { error: string }
  | undefined;

async function requireAdminId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') return null;
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== 'admin') return null;
  return session.user.id;
}

async function organizationDoc() {
  return (
    (await Organization.findOne()) ??
    (await Organization.create({
      name: 'Organização',
      appName: 'Gestão da clínica',
    }))
  );
}

export async function updateMonthlyPromoAction(
  _prev: OperationsActionState,
  formData: FormData,
): Promise<OperationsActionState> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: 'Sem permissões.' };

  const parsed = z
    .string()
    .trim()
    .max(80, 'Nome da promoção demasiado longo (máx. 80)')
    .safeParse(formData.get('monthlyPromo') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const org = await organizationDoc();
  org.monthlyPromo = parsed.data === '' ? null : parsed.data;
  await org.save();
  await logAudit({
    userId: adminId,
    action: 'update',
    entityType: 'Organization',
    entityId: String(org._id),
    summary: parsed.data
      ? `Promoção do mês: ${parsed.data}`
      : 'Promoção do mês removida',
    changedFields: ['monthlyPromo'],
  });
  revalidatePath('/admin/configuracoes');
  revalidatePath('/admin/agenda');
  return {
    success: true,
    message: parsed.data ? 'Promoção do mês guardada.' : 'Promoção removida.',
  };
}

export async function updateNetworkRestrictionAction(
  _prev: OperationsActionState,
  formData: FormData,
): Promise<OperationsActionState> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: 'Sem permissões.' };

  const enabled = formData.get('enabled') === 'on';
  const roles = RESTRICTABLE_ROLES.filter(r => formData.get(`role-${r}`) === 'on');
  const allowedIps = Array.from(
    new Set(
      String(formData.get('allowedIps') ?? '')
        .split(/[\s,;]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const bad = allowedIps.find(e => !isValidAllowEntry(e));
  if (bad) {
    return {
      error: `"${bad}" não é um IP válido. Use o IP público da clínica (ex.: 203.0.113.25) ou um bloco (ex.: 203.0.113.0/29).`,
    };
  }
  if (allowedIps.length > 20) return { error: 'No máximo 20 endereços.' };
  if (enabled && allowedIps.length === 0) {
    return {
      error:
        'Indique pelo menos um IP da clínica antes de ligar a restrição — sem lista ninguém conseguiria entrar.',
    };
  }
  if (enabled && roles.length === 0) {
    return { error: 'Escolha pelo menos um perfil a limitar.' };
  }

  const org = await organizationDoc();
  org.set('networkRestriction', { enabled, allowedIps, roles });
  await org.save();
  await logAudit({
    userId: adminId,
    action: 'update',
    entityType: 'Organization',
    entityId: String(org._id),
    summary: enabled
      ? `Acesso só dentro da clínica LIGADO (${roles.join(', ')}; ${allowedIps.length} IP)`
      : 'Acesso só dentro da clínica desligado',
    changedFields: ['networkRestriction'],
  });
  revalidatePath('/', 'layout');
  return {
    success: true,
    message: enabled
      ? 'Restrição ligada. Os perfis escolhidos só entram a partir dos IP indicados.'
      : 'Restrição desligada — a lista ficou guardada.',
  };
}
