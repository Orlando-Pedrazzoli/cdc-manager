// 📄 src/app/doutor/protocolos/page.tsx
// =============================================================================
// CDC Manager — Médico: Protocolos internos (9.ª ronda, ponto 06)
// "Todos têm acesso aos protocolos internos da clínica" (Victor, 17 e 18/11).
// Só leitura: os protocolos publicados pela gestão em /admin/protocolos.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { loadKnowledge } from '@/lib/knowledge-data';
import { KnowledgeBase } from '@/components/conhecimento/KnowledgeBase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Protocolos internos' };

export default async function DoutorProtocolosPage() {
  const session = await requireActiveSession(['doctor'] as const);
  if (!session?.user?.id) return null;
  await dbConnect();
  const { rows, audiences } = await loadKnowledge('protocol', 'doctor');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Protocolos internos
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Os processos da clínica: o que fazer em cada situação. Pesquise pelo
          nome e abra o protocolo.
        </p>
      </div>
      <KnowledgeBase section='protocol' articles={rows} audiences={audiences} canEdit={false} />
    </div>
  );
}
