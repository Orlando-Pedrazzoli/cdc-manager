// 📄 src/components/portal/MyDocumentsList.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: lista de documentos com download
// -----------------------------------------------------------------------------
// Recebe do Server Component APENAS documentos já filtrados (visibleToPatient
// + não anulados + do próprio) — este componente não decide segurança, só
// apresenta. O download pede a URL assinada à action do portal (que re-valida
// tudo no servidor: nunca confiar no que o client mostra).
// Mesmo padrão do DocumentsTab de staff: window.location.href com attachment.
// =============================================================================

'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { getMyDocumentUrlAction } from '@/actions/portal';

export type MyDocumentItem = {
  id: string;
  title: string;
  categoryLabel: string;
  createdAtLabel: string; // já formatado no servidor (tz Lisboa)
  format: string | null;
};

export default function MyDocumentsList({
  documents,
}: {
  documents: MyDocumentItem[];
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (doc: MyDocumentItem) => {
    if (downloadingId) return;
    setDownloadingId(doc.id);
    try {
      const res = await getMyDocumentUrlAction({ documentId: doc.id });
      if (!res.ok) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      window.location.href = res.url; // attachment → transfere sem navegar
    } finally {
      setDownloadingId(null);
    }
  };

  if (documents.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
        Ainda não tem documentos disponíveis. Os documentos partilhados pela
        clínica (consentimentos assinados, radiografias, receitas) aparecem
        aqui.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {documents.map(doc => (
        <div
          key={doc.id}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: '#1C2233',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {doc.title}
            </p>
            <p
              style={{ margin: '3px 0 0', fontSize: '12px', color: '#6A7186' }}
            >
              {doc.categoryLabel} · {doc.createdAtLabel}
              {doc.format ? ` · ${doc.format.toUpperCase()}` : ''}
            </p>
          </div>
          <button
            type='button'
            onClick={() => download(doc)}
            disabled={downloadingId !== null}
            style={{
              flexShrink: 0,
              borderRadius: '10px',
              border: '1px solid #C9D4FF',
              backgroundColor: '#F5F8FF',
              color: '#1B2A6B',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: downloadingId ? 'wait' : 'pointer',
              opacity: downloadingId && downloadingId !== doc.id ? 0.6 : 1,
            }}
          >
            {downloadingId === doc.id ? 'A preparar…' : 'Transferir'}
          </button>
        </div>
      ))}
    </div>
  );
}
