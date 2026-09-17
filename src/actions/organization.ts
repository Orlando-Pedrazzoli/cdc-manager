// 📄 src/actions/organization.ts
// =============================================================================
// CDC Manager — Server Actions: Organização (identidade do cliente)
// -----------------------------------------------------------------------------
// ADMIN-ONLY. Upsert do singleton Organization: nome, nome da app, dados
// legais, logo, cor de marca e remetente de email. Revalida os layouts
// (o branding aparece em todas as páginas) e regista auditoria.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { updateOrganizationSchema } from '@/lib/validations/settings';
import Organization from '@/models/Organization';

export type OrganizationActionState =
  | { success: true }
  | { error: string }
  | undefined;

export async function updateOrganizationAction(
  _prev: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const parsed = updateOrganizationSchema.safeParse({
      name: formData.get('name'),
      appName: formData.get('appName'),
      legalName: formData.get('legalName'),
      nipc: formData.get('nipc'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      website: formData.get('website'),
      logoUrl: formData.get('logoUrl'),
      primaryColor: formData.get('primaryColor'),
      emailFromName: formData.get('emailFromName'),
      emailFromAddress: formData.get('emailFromAddress'),
      emailFooter: formData.get('emailFooter'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();

    const existing = await Organization.findOne();
    const changedFields: string[] = [];
    if (existing) {
      for (const [key, value] of Object.entries(parsed.data)) {
        if ((existing.get(key) ?? null) !== value) changedFields.push(key);
      }
      existing.set(parsed.data);
      await existing.save();
    } else {
      await Organization.create(parsed.data);
      changedFields.push('created');
    }

    await logAudit({
      userId: session.user.id,
      action: existing ? 'update' : 'create',
      entityType: 'Organization',
      entityId: String((existing ?? (await Organization.findOne()))?._id),
      summary: `Organização atualizada: ${parsed.data.name} (${parsed.data.appName})`,
      changedFields,
    });

    // Branding entra em todos os layouts
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[organization] update:', err);
    return { error: 'Erro inesperado ao gravar a organização.' };
  }
}
