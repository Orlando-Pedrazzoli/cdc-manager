// 📄 src/lib/document-templates-seed.ts
// =============================================================================
// CDC Manager — Seed idempotente dos modelos de documentos (Fase 5A)
// -----------------------------------------------------------------------------
// Chamado por páginas de servidor (/admin/modelos, toolbar de emissão) para
// garantir que os 9 modelos default existem. Vive em src/lib e NÃO em
// src/actions: num ficheiro 'use server' seria um endpoint público sem
// sessão. Não recebe input do utilizador; só escreve se a coleção estiver
// vazia.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import DocumentTemplate from '@/models/DocumentTemplate';
import { DEFAULT_TEMPLATES } from '@/lib/data/document-templates';

export async function ensureDefaultTemplates(): Promise<void> {
  await dbConnect();
  const n = await DocumentTemplate.countDocuments();
  if (n > 0) return;
  await DocumentTemplate.insertMany(
    DEFAULT_TEMPLATES.map(t => ({
      key: t.key,
      kind: t.kind,
      title: t.title,
      body: t.body,
      allowStaff:
        t.kind === 'presenca' ||
        t.kind === 'acompanhante' ||
        t.kind === 'autorizacao',
      requiresSignature:
        t.kind === 'consentimento' ||
        t.kind === 'termo' ||
        t.kind === 'autorizacao',
      active: true,
    })),
  );
}
