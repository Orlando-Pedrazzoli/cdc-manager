// 📄 src/app/admin/protocolos/page.tsx
// =============================================================================
// CDC Manager — Protocolos internos (8.ª ronda/07, Victor 17/11/2026)
// A receção pesquisa e lê; a gestão escreve. Ver src/lib/knowledge.ts.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { loadKnowledge } from '@/lib/knowledge-data';
import { KnowledgeBase } from '@/components/conhecimento/KnowledgeBase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Protocolos internos' };

export default async function ProtocolosPage() {
  const session = await requireActiveSession(['admin', 'receptionist'] as const);
  if (!session?.user?.id) return null;
  await dbConnect();
  const { rows, audiences } = await loadKnowledge('protocol', session.user.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Protocolos internos
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Os processos administrativos da clínica: o que fazer em cada situação.
          Pesquise pelo nome e abra o protocolo.
        </p>
      </div>
      <KnowledgeBase
        section='protocol'
        articles={rows}
        audiences={audiences}
        canEdit={session.user.role === 'admin'}
      />
    </div>
  );
}
