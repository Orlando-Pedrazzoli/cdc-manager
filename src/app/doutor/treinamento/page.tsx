// 📄 src/app/doutor/treinamento/page.tsx
// =============================================================================
// CDC Manager — Treinamento do CDC, versão Médicos (8.ª ronda/08)
// Só leitura: os artigos publicados da versão "Médicos".
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { loadKnowledge } from '@/lib/knowledge-data';
import { KnowledgeBase } from '@/components/conhecimento/KnowledgeBase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Treinamento' };

export default async function DoutorTreinamentoPage() {
  const session = await requireActiveSession(['doctor'] as const);
  if (!session?.user?.id) return null;
  await dbConnect();
  const { rows, audiences } = await loadKnowledge('training', 'doctor');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Treinamento do CDC
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Como usar o sistema no dia a dia da consulta.
        </p>
      </div>
      <KnowledgeBase section='training' articles={rows} audiences={audiences} canEdit={false} />
    </div>
  );
}
