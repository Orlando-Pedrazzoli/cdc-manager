// 📄 src/actions/post-clinic.ts
// =============================================================================
// CDC Manager — Server Action: escolher a unidade deste posto (9.ª ronda/03)
// Gestão e receção. Só grava um cookie de preferência no browser; não mexe
// em permissões (quem só opera numa clínica continua limitado a ela).
// =============================================================================

'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { getActiveClinics } from '@/models/Clinic';
import { POST_CLINIC_COOKIE, POST_CLINIC_MAX_AGE } from '@/lib/post-clinic';

export async function setPostClinicAction(
  slug: string,
): Promise<{ error?: string }> {
  const session = await getVerifiedSession(['admin', 'receptionist'] as const);
  if (!session?.user?.id) return { error: 'Sem permissões.' };
  const clinics = await getActiveClinics();
  const clinic = clinics.find(c => c.slug === slug);
  if (!clinic) return { error: 'Clínica inválida.' };
  const store = await cookies();
  store.set(POST_CLINIC_COOKIE, clinic.slug, {
    path: '/',
    maxAge: POST_CLINIC_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  revalidatePath('/admin', 'layout');
  return {};
}
