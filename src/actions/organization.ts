// 📄 src/actions/organization.ts
// =============================================================================
// CDC Manager — Server Actions: Organização (identidade do cliente)
// -----------------------------------------------------------------------------
// ADMIN-ONLY. Upsert do singleton Organization: nome, nome da app, dados
// legais, logo, cor de marca e remetente de email. Revalida os layouts
// (o branding aparece em todas as páginas) e regista auditoria.
//
// Logo: upload SERVER-SIDE pela própria action (ficheiro pequeno, ≤ 800 KB —
// abaixo do limite de 1 MB do body das server actions), guardado como asset
// PÚBLICO no Cloudinary (ver lib/cloudinary § 4). O URL versionado fica em
// Organization.logoUrl — o mesmo campo que o admin pode preencher à mão.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { updateOrganizationSchema } from '@/lib/validations/settings';
import Organization from '@/models/Organization';
import { uploadPublicLogo, destroyPublicLogo } from '@/lib/cloudinary';

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

// -----------------------------------------------------------------------------
// Logo: upload e remoção
// -----------------------------------------------------------------------------
const LOGO_MAX_BYTES = 800 * 1024;
const LOGO_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') return null;
  return session;
}

export async function uploadOrganizationLogoAction(
  _prev: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const session = await requireAdminSession();
    if (!session) return { error: 'Sem permissões.' };

    const file = formData.get('logo');
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Escolha um ficheiro de imagem.' };
    }
    if (!LOGO_MIMES.has(file.type)) {
      return { error: 'Formato inválido — use PNG, JPEG, WebP ou SVG.' };
    }
    if (file.size > LOGO_MAX_BYTES) {
      return { error: 'O logo tem de ter no máximo 800 KB.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, bytes } = await uploadPublicLogo(buffer, file.type);

    await dbConnect();
    const org =
      (await Organization.findOne()) ??
      (await Organization.create({
        name: 'Organização',
        appName: 'Gestão da clínica',
      }));
    org.logoUrl = url;
    await org.save();

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Organization',
      entityId: String(org._id),
      summary: `Logo da organização atualizado (${Math.round(bytes / 1024)} KB)`,
      changedFields: ['logoUrl'],
    });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[organization] upload logo:', err);
    return { error: 'Não foi possível carregar o logo.' };
  }
}

export async function removeOrganizationLogoAction(): Promise<OrganizationActionState> {
  try {
    const session = await requireAdminSession();
    if (!session) return { error: 'Sem permissões.' };
    await dbConnect();
    const org = await Organization.findOne();
    if (!org) return { success: true };

    // Só destrói no Cloudinary se o logo atual for o asset gerido por nós
    // (um URL manual para /public ou outro CDN não é nosso para apagar)
    if (org.logoUrl?.includes('/organizacao/logo')) {
      await destroyPublicLogo().catch(err =>
        console.error('[organization] destroy logo:', err),
      );
    }
    org.logoUrl = null;
    await org.save();

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Organization',
      entityId: String(org._id),
      summary: 'Logo da organização removido',
      changedFields: ['logoUrl'],
    });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[organization] remove logo:', err);
    return { error: 'Não foi possível remover o logo.' };
  }
}
