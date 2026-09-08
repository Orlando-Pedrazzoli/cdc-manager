// 📄 src/app/conta/documentos/page.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: os meus documentos
// -----------------------------------------------------------------------------
// Lista APENAS documentos visibleToPatient: true e não anulados, do próprio
// paciente (patientId da sessão) — os consentimentos RX assinados no gabinete
// aparecem aqui de imediato; as imagens RX da Fase 2 aterram sem mais código.
// A formatação de datas é feita AQUI (servidor, tz Lisboa) — o client
// component só apresenta e pede o download à action, que re-valida tudo.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import ClinicalDocument from '@/models/Document';
import { DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from '@/lib/domain';
import MyDocumentsList, {
  type MyDocumentItem,
} from '@/components/portal/MyDocumentsList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Os meus documentos' };

function lisbonDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

export default async function MyDocumentsPage() {
  const session = await auth();
  const patientId = session?.user?.patientId;

  await dbConnect();

  const docs = patientId
    ? await ClinicalDocument.find({
        patientId,
        visibleToPatient: true,
        voidedAt: null,
      })
        .select('title category format createdAt')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    : [];

  const items: MyDocumentItem[] = docs.map(d => ({
    id: String(d._id),
    title: d.title,
    categoryLabel:
      DOCUMENT_CATEGORY_LABEL[d.category as DocumentCategory] ?? 'Documento',
    createdAtLabel: lisbonDate(d.createdAt),
    format: d.format ?? null,
  }));

  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Os meus documentos
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Consentimentos assinados, radiografias e outros documentos partilhados
          pela clínica.
        </p>
      </div>

      <MyDocumentsList documents={items} />
    </div>
  );
}
