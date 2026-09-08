// 📄 src/actions/portal.ts
// =============================================================================
// CDC Manager — Actions: Portal do Paciente
// -----------------------------------------------------------------------------
// TODAS as actions deste ficheiro são exclusivas do role 'patient' e operam
// SEMPRE sobre o patientId DA SESSÃO — nunca sobre um patientId vindo do
// cliente. Esta é a regra de segurança nº 1 do portal: um paciente
// autenticado só consegue tocar nos seus próprios dados, por construção.
//
// getMyDocumentUrlAction: variante do download de documentos para o portal.
// Difere da versão de staff (actions/documents.ts) em três guardas extra:
//   1. doc.patientId TEM de ser o patientId da sessão
//   2. doc.visibleToPatient TEM de ser true (notas internas nunca saem)
//   3. doc anulado (voidedAt) é invisível — never delete, mas nunca exposto
// URL assinada de curta duração (TTL do lib/cloudinary) + audit 'view':
// acesso de pacientes a binários de dados de saúde fica registado como o
// de staff — trilho RGPD completo de quem viu o quê e quando.
// =============================================================================

'use server';

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { signedDownloadUrl } from '@/lib/cloudinary';
import ClinicalDocument from '@/models/Document';

type ActionError = { ok: false; error: string };

// -----------------------------------------------------------------------------
// RBAC do portal: sessão de paciente ativa COM perfil ligado
// -----------------------------------------------------------------------------
async function requirePatient(): Promise<
  { ok: true; userId: string; patientId: string } | ActionError
> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.role !== 'patient' || !user.patientId) {
    return { ok: false, error: 'Sem permissões.' };
  }
  return { ok: true, userId: user.id, patientId: user.patientId };
}

// -----------------------------------------------------------------------------
// DOWNLOAD de documento próprio — URL assinada + audit de acesso
// -----------------------------------------------------------------------------
export async function getMyDocumentUrlAction(input: {
  documentId: string;
}): Promise<{ ok: true; url: string } | ActionError> {
  const gate = await requirePatient();
  if (!gate.ok) return gate;

  if (!/^[0-9a-fA-F]{24}$/.test(input.documentId)) {
    return { ok: false, error: 'Documento inválido.' };
  }

  await dbConnect();

  // As três guardas na PRÓPRIA query: documento de outro paciente, interno
  // ou anulado responde "não encontrado" — sem distinguir os casos (não
  // confirmar a existência de documentos alheios é deliberado)
  const doc = await ClinicalDocument.findOne({
    _id: input.documentId,
    patientId: gate.patientId,
    visibleToPatient: true,
    voidedAt: null,
  }).lean();

  if (!doc) return { ok: false, error: 'Documento não encontrado.' };

  const url = signedDownloadUrl({
    publicId: doc.publicId,
    resourceType: doc.resourceType as 'image' | 'raw',
    format: doc.format ?? null,
  });

  await logAudit({
    userId: gate.userId,
    action: 'view',
    entityType: 'Document',
    entityId: String(doc._id),
    patientId: gate.patientId,
    summary: `Download pelo próprio paciente no portal: ${doc.title}`,
  });

  return { ok: true, url };
}
