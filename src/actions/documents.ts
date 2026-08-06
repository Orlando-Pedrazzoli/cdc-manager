// 📄 src/actions/documents.ts
// =============================================================================
// CDC Manager — Actions: Documentos clínicos (admin + receção + médicos)
// -----------------------------------------------------------------------------
// Fluxo de upload em 3 passos (ver lib/cloudinary.ts):
//   1. createDocumentUploadTicketAction → documentId novo + assinatura
//   2. o browser envia o ficheiro DIRETO ao Cloudinary (fora da Vercel)
//   3. registerDocumentAction → VERIFICA o asset no Cloudinary (bytes/
//      formato reais — nunca confiar no client) e grava o Document com
//      _id = documentId (public_id opaco garantido por construção)
//
// getDocumentDownloadUrlAction: URL do original com expiração 10 min +
// audit 'view' (acesso a binário de dados de saúde fica registado).
//
// voidDocumentAction: never delete — voidedAt/autor/motivo; o asset fica
// no Cloudinary. Admin anula qualquer; receção/médico só os próprios.
//
// RBAC: documentos são GLOBAIS como a ficha do paciente (sem clinicId) —
// admin, receção e médicos ativos; sem canOperateClinic aqui.
// =============================================================================

'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  documentUploadTicketSchema,
  registerDocumentSchema,
  voidDocumentSchema,
} from '@/lib/validations/documents';
import { DOCUMENT_CATEGORY_LABEL } from '@/lib/domain';
import {
  patientDocumentPublicId,
  signDocumentUpload,
  fetchDocumentAssetInfo,
  signedDownloadUrl,
  type CloudinaryUploadTicket,
} from '@/lib/cloudinary';
import ClinicalDocument from '@/models/Document';
import Patient from '@/models/Patient';

const STAFF_ROLES = ['admin', 'receptionist', 'doctor'] as const;

type ActionError = { ok: false; error: string };

// -----------------------------------------------------------------------------
// RBAC comum
// -----------------------------------------------------------------------------
async function requireStaff(): Promise<
  { ok: true; userId: string; role: string } | ActionError
> {
  const session = await auth();
  const role = session?.user?.role ?? '';
  if (!session?.user?.id || !STAFF_ROLES.includes(role as never)) {
    return { ok: false, error: 'Sem permissões.' };
  }
  return { ok: true, userId: session.user.id, role };
}

function revalidatePatientPaths(patientId: string): void {
  revalidatePath(`/admin/pacientes/${patientId}`);
  revalidatePath(`/doutor/pacientes/${patientId}`);
}

// -----------------------------------------------------------------------------
// 1. TICKET — documentId novo + assinatura de upload direto
// -----------------------------------------------------------------------------
export async function createDocumentUploadTicketAction(input: {
  patientId: string;
}): Promise<
  { ok: true; documentId: string; ticket: CloudinaryUploadTicket } | ActionError
> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;

  const parsed = documentUploadTicketSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    };
  }

  await dbConnect();
  const patient = await Patient.findById(parsed.data.patientId)
    .select('_id')
    .lean();
  if (!patient) return { ok: false, error: 'Paciente não encontrado.' };

  const documentId = new mongoose.Types.ObjectId();
  const publicId = patientDocumentPublicId(String(documentId));

  try {
    const ticket = signDocumentUpload(publicId);
    return { ok: true, documentId: String(documentId), ticket };
  } catch (err) {
    console.error('[documents] assinatura de upload falhou:', err);
    return {
      ok: false,
      error: 'Cloudinary não configurado — verifique as variáveis de ambiente.',
    };
  }
}

// -----------------------------------------------------------------------------
// 2. REGISTO — verifica o asset e grava o Document
// -----------------------------------------------------------------------------
export async function registerDocumentAction(
  formData: FormData,
): Promise<{ ok: true; documentId: string } | ActionError> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;

  const parsed = registerDocumentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    };
  }
  const data = parsed.data;

  await dbConnect();

  // Idempotência: re-submissão do mesmo ticket não duplica nem falha
  const existing = await ClinicalDocument.findById(data.documentId)
    .select('_id')
    .lean();
  if (existing) return { ok: true, documentId: data.documentId };

  const patient = await Patient.findById(data.patientId).select('_id').lean();
  if (!patient) return { ok: false, error: 'Paciente não encontrado.' };

  // Fonte de verdade: o asset TEM de existir no Cloudinary com o public_id
  // que NÓS emitimos no ticket (o client nunca escolhe o caminho)
  const publicId = patientDocumentPublicId(data.documentId);
  const asset = await fetchDocumentAssetInfo(publicId);
  if (!asset) {
    return {
      ok: false,
      error: 'Upload não encontrado no Cloudinary — tente novamente.',
    };
  }

  const title =
    data.title ??
    asset.originalFilename ??
    DOCUMENT_CATEGORY_LABEL[data.category];

  await ClinicalDocument.create({
    _id: new mongoose.Types.ObjectId(data.documentId),
    patientId: data.patientId,
    category: data.category,
    title,
    publicId,
    resourceType: asset.resourceType,
    format: asset.format,
    bytes: asset.bytes,
    visibleToPatient: data.visibleToPatient,
    uploadedByUserId: gate.userId,
    appointmentId: data.appointmentId,
    note: data.note,
  });

  await logAudit({
    userId: gate.userId,
    action: 'create',
    entityType: 'Document',
    entityId: data.documentId,
    patientId: data.patientId,
    summary: `Documento carregado: ${title} (${DOCUMENT_CATEGORY_LABEL[data.category]})`,
  });

  revalidatePatientPaths(data.patientId);
  return { ok: true, documentId: data.documentId };
}

// -----------------------------------------------------------------------------
// 3. DOWNLOAD do original — URL com expiração + audit de acesso
// -----------------------------------------------------------------------------
export async function getDocumentDownloadUrlAction(input: {
  documentId: string;
}): Promise<{ ok: true; url: string } | ActionError> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;

  if (!/^[0-9a-fA-F]{24}$/.test(input.documentId)) {
    return { ok: false, error: 'Documento inválido.' };
  }

  await dbConnect();
  const doc = await ClinicalDocument.findById(input.documentId).lean();
  if (!doc || doc.voidedAt) {
    return { ok: false, error: 'Documento não encontrado.' };
  }

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
    patientId: String(doc.patientId),
    summary: `Download do documento: ${doc.title}`,
  });

  return { ok: true, url };
}

// -----------------------------------------------------------------------------
// 4. ANULAÇÃO — never delete
// -----------------------------------------------------------------------------
export async function voidDocumentAction(
  formData: FormData,
): Promise<{ ok: true } | ActionError> {
  const gate = await requireStaff();
  if (!gate.ok) return gate;

  const parsed = voidDocumentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    };
  }

  await dbConnect();
  const doc = await ClinicalDocument.findById(parsed.data.documentId);
  if (!doc || doc.voidedAt) {
    return { ok: false, error: 'Documento não encontrado.' };
  }

  // Admin anula qualquer; receção/médico só os próprios uploads
  if (gate.role !== 'admin' && String(doc.uploadedByUserId) !== gate.userId) {
    return {
      ok: false,
      error: 'Só o autor do upload (ou a administração) pode anular.',
    };
  }

  doc.voidedAt = new Date();
  doc.voidedByUserId = new mongoose.Types.ObjectId(gate.userId);
  doc.voidReason = parsed.data.reason;
  await doc.save();

  await logAudit({
    userId: gate.userId,
    action: 'delete',
    entityType: 'Document',
    entityId: String(doc._id),
    patientId: String(doc.patientId),
    summary: `Documento anulado: ${doc.title} — ${parsed.data.reason}`,
  });

  revalidatePatientPaths(String(doc.patientId));
  return { ok: true };
}
