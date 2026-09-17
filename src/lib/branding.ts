// 📄 src/lib/branding.ts
// =============================================================================
// CDC Manager — Helpers de identidade visual (sem acesso a base de dados)
// -----------------------------------------------------------------------------
// · clinicLabel(c)  — nome curto da clínica para pastilhas/pills
//                     (Clinic.shortName, senão slug capitalizado)
// · clinicBadge(c)  — cores da pastilha a partir de Clinic.color; sem cor,
//                     paleta estável por ordem (3.ª clínica = zero código)
// · tint(hex, a)    — cor com alpha, para fundos claros de marca
// Substitui os CLINIC_STYLE hardcoded por slug ('colombo'/'buraca').
// =============================================================================

export type ClinicLike = {
  slug: string;
  name?: string | null;
  shortName?: string | null;
  color?: string | null;
};

/** Paleta de fallback para clínicas sem cor definida (índice estável) */
const FALLBACK_COLORS = ['#1B2A6B', '#5B2E91', '#0F7B4D', '#8A5A00', '#B3261E'];

export function clinicLabel(c: ClinicLike): string {
  if (c.shortName) return c.shortName;
  return c.slug.charAt(0).toUpperCase() + c.slug.slice(1);
}

/** #RRGGBB → rgba(r,g,b,a) */
export function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(27,42,107,${alpha})`;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Cores da pastilha de uma clínica. `index` = posição na lista ordenada de
 * clínicas ativas — só usado quando a clínica não tem `color`.
 */
export function clinicBadge(
  c: ClinicLike,
  index = 0,
): { bg: string; fg: string; label: string } {
  const base = c.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  return { bg: tint(base, 0.12), fg: base, label: clinicLabel(c) };
}

/** Mapa slug → badge para páginas que já iteram clínicas por slug */
export function clinicBadgeMap<T extends ClinicLike>(
  clinics: T[],
): Record<string, { bg: string; fg: string; label: string }> {
  const out: Record<string, { bg: string; fg: string; label: string }> = {};
  clinics.forEach((c, i) => {
    out[c.slug] = clinicBadge(c, i);
  });
  return out;
}
