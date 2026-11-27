// 📄 src/lib/template-import.ts
// =============================================================================
// CDC Manager — Regras puras da importação dos modelos da clínica
// (scripts/import-modelos-clinica.ts). Sem base de dados: testável.
// =============================================================================

/** "Dra. ANA PAULA BORGES" → "dra. ana paula borges" (sem acentos) */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DoctorMatch {
  /** Nome pedido ("Ana Paula") */
  wanted: string;
  /** Médicos ativos cujo nome contém todas as palavras pedidas */
  found: { id: string; name: string }[];
}

/**
 * Procura cada nome pedido nos médicos. Só conta como encontrado quando há
 * EXATAMENTE um médico — com zero ou vários, quem corre o script decide.
 * A comparação é por palavras inteiras: "Ana" não apanha "Mariana".
 */
export function matchDoctors(
  wanted: readonly string[],
  doctors: readonly { id: string; name: string }[],
): DoctorMatch[] {
  return wanted
    .map(w => w.trim())
    .filter(Boolean)
    .map(w => {
      const words = foldName(w).split(' ');
      const found = doctors.filter(d => {
        const have = foldName(d.name).replace(/[.,]/g, ' ').split(' ');
        return words.every(x => have.includes(x));
      });
      return { wanted: w, found: found.map(d => ({ id: d.id, name: d.name })) };
    });
}

/** Ids dos que foram encontrados sem ambiguidade */
export function unambiguousIds(matches: readonly DoctorMatch[]): string[] {
  const out: string[] = [];
  for (const m of matches)
    if (m.found.length === 1 && !out.includes(m.found[0].id))
      out.push(m.found[0].id);
  return out;
}

/** O que a importação faz a um modelo, comparando com o que está na base */
export type ImportAction = 'criar' | 'igual' | 'substituir';
export function importAction(
  existing: { title?: string; body?: string; kind?: string; folder?: string } | null,
  next: { title: string; body: string; kind: string; folder: string },
): ImportAction {
  if (!existing) return 'criar';
  return existing.title === next.title &&
    existing.body === next.body &&
    existing.kind === next.kind &&
    (existing.folder ?? 'geral') === next.folder
    ? 'igual'
    : 'substituir';
}
