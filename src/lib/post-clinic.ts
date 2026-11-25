// 📄 src/lib/post-clinic.ts
// =============================================================================
// CDC Manager — Unidade deste posto (clínica pré-definida)
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 03, Victor, 17 e 18/11): "o campo Clínica fica sempre
// pré-definido com a unidade onde se está a trabalhar: no Colombo, Colombo;
// na Buraca, Buraca".
//
// O sistema não sabe sozinho em que unidade está cada computador, por isso
// cada posto diz uma vez onde está (seletor "Este posto" na barra superior).
// A escolha fica num cookie DO BROWSER (um ano), não na conta: a mesma
// pessoa pode trabalhar num dia no Colombo e noutro na Buraca, e o posto é
// que não muda de sítio. Sem cookie, vale a clínica principal, como antes.
// =============================================================================

import { cookies } from 'next/headers';
import { defaultClinic } from '@/lib/branding';

export const POST_CLINIC_COOKIE = 'cdc-posto-clinica';
export const POST_CLINIC_MAX_AGE = 60 * 60 * 24 * 365;

/** Escolha pura (testável): a do posto se existir na lista, senão a principal */
export function pickPostClinic<
  T extends { slug: string; isDefault?: boolean | null },
>(clinics: T[], postSlug: string | null | undefined): T | undefined {
  return (
    (postSlug ? clinics.find(c => c.slug === postSlug) : undefined) ??
    defaultClinic(clinics)
  );
}

/** Slug guardado neste posto (null se nunca foi escolhido) */
export async function postClinicSlug(): Promise<string | null> {
  try {
    const store = await cookies();
    const v = store.get(POST_CLINIC_COOKIE)?.value ?? '';
    return /^[a-z0-9-]{1,40}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Clínica pré-selecionada neste posto (server components e actions) */
export async function defaultClinicForPost<
  T extends { slug: string; isDefault?: boolean | null },
>(clinics: T[]): Promise<T | undefined> {
  return pickPostClinic(clinics, await postClinicSlug());
}
