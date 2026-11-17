// 📄 src/lib/knowledge.ts
// =============================================================================
// CDC Manager — Protocolos internos e Treinamento (8.ª ronda/07 e 08)
// -----------------------------------------------------------------------------
// Victor (17/11/2026):
//   07 — "Uma área com todos os processos administrativos da clínica, para
//        quando a receção tiver dúvidas. Pesquisa pelo nome e aparece logo o
//        protocolo a seguir. Eu coloco tudo o que seja processo
//        administrativo, e a lista vai crescendo."
//   08 — "Um treinamento completo de cada área do CDC: o que tem, para que
//        serve e como usar. Versões: Médicos, Receção, Área do cliente. O
//        conteúdo pode ser gerado com o Claude, área a área, e depois revisto
//        por nós antes de publicar."
// As duas áreas são a mesma coisa por dentro: artigos de texto com título,
// pesquisa e publicação pela gestão. Só muda a secção e quem os lê.
// Sem BD nem React aqui, para se poder testar.
// =============================================================================

export const KNOWLEDGE_SECTIONS = ['protocol', 'training'] as const;
export type KnowledgeSection = (typeof KNOWLEDGE_SECTIONS)[number];

/** Versões do treinamento (para os protocolos é sempre 'reception') */
export const KNOWLEDGE_AUDIENCES = ['reception', 'doctor', 'portal'] as const;
export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];

export const KNOWLEDGE_AUDIENCE_LABEL: Record<KnowledgeAudience, string> = {
  reception: 'Receção',
  doctor: 'Médicos',
  portal: 'Área do cliente',
};

/** Quem pode LER uma versão do treinamento (a gestão lê tudo) */
export function canReadAudience(
  role: string | null | undefined,
  audience: KnowledgeAudience,
): boolean {
  if (role === 'admin') return true;
  if (role === 'receptionist') return audience !== 'doctor';
  if (role === 'doctor') return audience === 'doctor';
  return false;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export interface KnowledgeSearchable {
  title: string;
  body: string;
  keywords?: string | null;
}

/**
 * Pesquisa sem acentos nem maiúsculas: todas as palavras têm de aparecer no
 * título, nas palavras-chave ou no texto. Quem acerta no título vem primeiro.
 */
export function searchKnowledge<T extends KnowledgeSearchable>(
  articles: T[],
  query: string,
): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return articles;
  const scored: { a: T; score: number; i: number }[] = [];
  articles.forEach((a, i) => {
    const title = fold(a.title);
    const keys = fold(a.keywords ?? '');
    const body = fold(a.body);
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 3;
      else if (keys.includes(w)) score += 2;
      else if (body.includes(w)) score += 1;
      else return;
    }
    scored.push({ a, score, i });
  });
  return scored.sort((x, y) => y.score - x.score || x.i - y.i).map(x => x.a);
}
