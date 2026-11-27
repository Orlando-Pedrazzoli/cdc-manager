// 📄 src/app/admin/modelos/page.tsx
// =============================================================================
// CDC Manager — Admin: Modelos de documentos (Fase 5A, P14)
// "modelos de documentos mais utilizados, prontos para editar e imprimir".
// Semeia os defaults na primeira visita; lista por tipo; editar/desativar.
// 3.ª reunião/05 (Victor): pesquisa por nome e filtro por tipo — a tabela
// passou para o client component TemplatesTable; esta página só carrega.
// =============================================================================

import { FileText } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import DocumentTemplate from '@/models/DocumentTemplate';
import { ensureDefaultTemplates } from '@/lib/document-templates-seed';
import {
  templateFolder,
  type TemplateKind,
} from '@/lib/data/document-templates';
import { placeholdersIn } from '@/lib/document-merge';
import Doctor from '@/models/Doctor';
import {
  TemplateEditorButton,
  type DoctorOption,
} from '@/components/documentos/TemplateEditor';
import {
  TemplatesTable,
  type TemplateRow,
} from '@/components/documentos/TemplatesTable';

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
  // 9.ª ronda (c): médicos ativos, para a lista de acesso dos modelos
  // restritos (contratos). Os inativos que ainda estejam numa lista
  // aparecem também, para poderem ser retirados.
  const listed = new Set(
    templates.flatMap(t => (t.allowedDoctorIds ?? []).map(String)),
  );
  const doctorDocs = await Doctor.find({
    $or: [{ active: true }, { _id: { $in: [...listed] } }],
  })
    .select('name active')
    .sort({ name: 1 })
    .lean();
  const doctors: DoctorOption[] = doctorDocs.map(d => ({
    id: String(d._id),
    name: d.name,
    active: !!d.active,
  }));

  const rows: TemplateRow[] = templates.map(t => ({
    id: String(t._id),
    kind: t.kind as TemplateKind,
    folder: templateFolder(t.folder),
    title: t.title,
    body: t.body,
    bodyLength: t.body.length,
    placeholders: placeholdersIn(t.body),
    allowStaff: !!t.allowStaff,
    requiresSignature: !!t.requiresSignature,
    restrictedToDoctors: !!t.restrictedToDoctors,
    allowedDoctorIds: (t.allowedDoctorIds ?? []).map(String),
    active: !!t.active,
  }));

  return (
    // os modelos têm campos {{…}} e saem em PDF como escritos (F3)
    <div data-keep-case style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
        <TemplateEditorButton doctors={doctors} />
      </div>

      <TemplatesTable templates={rows} doctors={doctors} />
    </div>
  );
}
