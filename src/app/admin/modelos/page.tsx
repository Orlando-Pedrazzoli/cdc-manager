// 📄 src/app/admin/modelos/page.tsx
// =============================================================================
// CDC Manager — Admin: Modelos de documentos (Fase 5A, P14)
// "modelos de documentos mais utilizados, prontos para editar e imprimir".
// Semeia os defaults na primeira visita; lista por tipo; editar/desativar.
// =============================================================================

import { FileText } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import DocumentTemplate from '@/models/DocumentTemplate';
import { ensureDefaultTemplates } from '@/lib/document-templates-seed';
import {
  TEMPLATE_KIND_LABEL,
  type TemplateKind,
} from '@/lib/data/document-templates';
import { placeholdersIn } from '@/lib/document-merge';
import { Badge } from '@/components/ui/Badge';
import {
  TemplateEditorButton,
  TemplateToggle,
} from '@/components/documentos/TemplateEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modelos de documentos' };

export default async function ModelosPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return null;
  await dbConnect();
  await ensureDefaultTemplates();
  const templates = await DocumentTemplate.find({})
    .sort({ active: -1, kind: 1, title: 1 })
    .lean();

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    overflow: 'hidden',
  };
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
  };
  const td: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
    verticalAlign: 'top',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#1B2A6B',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <FileText size={22} />
            Modelos de documentos
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            Atestados, certificados, relatórios, consentimentos, termos e
            instruções — emitidos a partir da ficha do paciente com os dados
            preenchidos e o texto editável antes de gerar o PDF.
          </p>
        </div>
        <TemplateEditorButton />
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Modelo</th>
              <th style={th}>Tipo</th>
              <th style={th}>Campos automáticos</th>
              <th style={th}>Quem emite</th>
              <th style={{ ...th, textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={String(t._id)} style={{ opacity: t.active ? 1 : 0.55 }}>
                <td style={td}>
                  <div style={{ fontWeight: 700 }}>{t.title}</div>
                  <div style={{ fontSize: '11px', color: '#9AA1B4' }}>
                    {t.body.length.toLocaleString('pt-PT')} caracteres
                    {t.requiresSignature ? ' · exige assinatura' : ''}
                  </div>
                </td>
                <td style={td}>
                  <Badge variant='info'>
                    {TEMPLATE_KIND_LABEL[t.kind as TemplateKind]}
                  </Badge>
                </td>
                <td style={{ ...td, fontSize: '11.5px', color: '#6A7186' }}>
                  {placeholdersIn(t.body).join(', ') || '—'}
                </td>
                <td style={td}>
                  {t.allowStaff ? 'Médico e receção' : 'Só médico'}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <TemplateEditorButton
                      initial={{
                        id: String(t._id),
                        kind: t.kind,
                        title: t.title,
                        body: t.body,
                        allowStaff: !!t.allowStaff,
                        requiresSignature: !!t.requiresSignature,
                        active: !!t.active,
                      }}
                    />
                    <TemplateToggle id={String(t._id)} active={!!t.active} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
