// 📄 src/lib/age.ts
// =============================================================================
// CDC Manager — Idade em anos completos (função pura)
// =============================================================================

/** Anos completos entre a data de nascimento e `now`; null sem data válida */
export function ageInYears(
  birthDate: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getFullYear() - b.getFullYear();
  if (
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  ) {
    age--;
  }
  return age >= 0 ? age : null;
}
