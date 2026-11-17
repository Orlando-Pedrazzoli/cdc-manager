// 📄 src/lib/knowledge-data.ts
// =============================================================================
// CDC Manager — Protocolos e Treinamento: leitura da base (8.ª ronda/07, 08)
// Só para Server Components.
// =============================================================================

import KnowledgeArticle from '@/models/KnowledgeArticle';
import {
  KNOWLEDGE_AUDIENCES,
  canReadAudience,
  type KnowledgeAudience,
  type KnowledgeSection,
} from '@/lib/knowledge';
import type { KnowledgeRow } from '@/components/conhecimento/KnowledgeBase';

const stampFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

/** Artigos que este perfil pode ler: a gestão vê os rascunhos, os outros não */
export async function loadKnowledge(
  section: KnowledgeSection,
  role: string,
): Promise<{ rows: KnowledgeRow[]; audiences: KnowledgeAudience[] }> {
  const isAdmin = role === 'admin';
  const audiences = KNOWLEDGE_AUDIENCES.filter(a => canReadAudience(role, a));
  const docs = await KnowledgeArticle.find({
    section,
    active: true,
    ...(isAdmin ? {} : { published: true }),
    ...(section === 'training' ? { audience: { $in: audiences } } : {}),
  })
    .sort({ order: 1, title: 1 })
    .lean();
  return {
    audiences,
    rows: docs.map(d => ({
      id: String(d._id),
      audience: (d.audience ?? 'reception') as KnowledgeAudience,
      title: d.title,
      keywords: d.keywords ?? null,
      body: d.body,
      published: !!d.published,
      updatedLabel: stampFmt.format(d.updatedAt as Date),
    })),
  };
}
