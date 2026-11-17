// 📄 src/app/admin/treinamento/page.tsx
// =============================================================================
// CDC Manager — Treinamento do CDC (8.ª ronda/08, Victor 17/11/2026)
// Receção: versões "Receção" e "Área do cliente". Gestão: todas, com edição.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { loadKnowledge } from '@/lib/knowledge-data';
import { KnowledgeBase } from '@/components/conhecimento/KnowledgeBase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Treinamento' };

export default async function TreinamentoPage() {
  const session = await requireActiveSession(['admin', 'receptionist'] as const);
  if (!session?.user?.id) return null;
  await dbConnect();
  const { rows, audiences } = await loadKnowledge('training', session.user.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Treinamento do CDC
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Cada área do sistema: o que tem, para que serve e como usar. Pensado
          para quem está a começar.
        </p>
      </div>
      <KnowledgeBase
        section='training'
        articles={rows}
        audiences={audiences}
        canEdit={session.user.role === 'admin'}
      />
    </div>
  );
}
