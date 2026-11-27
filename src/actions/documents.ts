// 📄 src/actions/documents.ts
// =============================================================================
// CDC Manager — Actions: Documentos clínicos (admin + receção + médicos)
// -----------------------------------------------------------------------------
// Fluxo de upload em 3 passos (ver lib/storage.ts):
//   1. createDocumentUploadTicketAction → documentId novo + URL PUT assinada
//   2. o browser envia o ficheiro DIRETO ao R2 (fora da Vercel)
//   3. registerDocumentAction → VERIFICA o objeto no R2 (bytes/tipo reais —
//      nunca confiar no client), gera as miniaturas e grava o Document com
//      _id = documentId (chave opaca garantida por construção)
//
// getDocumentDownloadUrlAction: URL do original com expiração 10 min +
// audit 'view' (acesso a binário de dados de saúde fica registado).
//
// voidDocumentAction: never delete — voidedAt/autor/motivo; o ficheiro
// fica no R2. Admin anula qualquer; receção/médico só os próprios.
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
  createUploadTicket,
  deleteObjectAndDerivatives,
  downloadUrl,
  fetchObjectInfo,
  generateDerivatives,
  patientDocumentKey,
  MAX_DOCUMENT_BYTES,
  type UploadFileInfo,
  type UploadTicket,
} from '@/lib/storage';
import ClinicalDocument from '@/models/Document';
import Patient from '@/models/Patient';
import User from '@/models/User';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import { doctorCanSeeDocument } from '@/lib/patient-access';
import { doctorSeesContracts } from '@/lib/contract-access';

const STAFF_ROLES = ['admin', 'receptionist', 'doctor'] as const;

type ActionError = { ok: false; error: string };

// -----------------------------------------------------------------------------
// RBAC comum
// -----------------------------------------------------------------------------
async function requireStaff(): Promise<
  { ok: true; userId: string; role: string; clinicIds: string[] } | ActionError
> {
  const session = await auth();
  const role = session?.user?.role ?? '';
  if (!session?.user?.id || !STAFF_ROLES.includes(role as never)) {
    return { ok: false, error: 'Sem permissões.' };
  }

  await dbConnect();
  const user = await User.findById(session.user.id).select('role status clinicIds').lean();
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== role
  ) {
    return { ok: false, error: 'Conta inativa ou permissões alteradas. Inicie sessão novamente.' };
  }
  return {
    ok: true,
    userId: session.user.id,
    role,
    clinicIds: (user.clinicIds ?? []).map(id => String(id)),
  };
}

async function doctorCanAccessPatient(
  gate: { role: string; userId: string },
  patientId: string,
): Promise<boolean> {
  if (gate.role !== 'doctor') return true;

  const user = await User.findById(gate.userId)
    .select('status doctorId')
    .lean();
  if (!user || user.status !== 'active' || !user.doctorId) return false;

  // A conta ativa não basta: o perfil clínico também tem de estar ativo.
  const doctor = await Doctor.findOne({
    _id: user.doctorId,
    active: true,
  })
    .select('_id')
    .lean();
  if (!doctor) return false;

  return Boolean(
    await Appointment.exists({
      doctorId: doctor._id,
      patientId,
    }),
  );
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
  file: UploadFileInfo;
}): Promise<
  { ok: true; documentId: string; ticket: UploadTicket } | ActionError
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
  if (!(await doctorCanAccessPatient(gate, parsed.data.patientId))) {
    return { ok: false, error: 'Paciente não encontrado.' };
  }

  if (!input.file || input.file.size <= 0) {
    return { ok: false, error: 'Ficheiro vazio.' };
  }
  if (input.file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'O ficheiro tem de ter no máximo 50 MB.' };
  }

  const documentId = new mongoose.Types.ObjectId();
  const publicId = patientDocumentKey(String(documentId));

  try {
    const ticket = await createUploadTicket(publicId, {
      contentType: input.file.type,
      filename: input.file.name,
    });
    return { ok: true, documentId: String(documentId), ticket };
  } catch (err) {
    console.error('[documents] assinatura de upload falhou:', err);
    return {
      ok: false,
      error: 'Armazenamento não configurado — verifique as variáveis R2_*.',
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
    .select('_id patientId')
    .lean();
  if (existing) {
    if (
      String(existing.patientId) !== data.patientId ||
      !(await doctorCanAccessPatient(gate, String(existing.patientId)))
    ) {
      return { ok: false, error: 'Documento não encontrado.' };
    }
    return { ok: true, documentId: data.documentId };
  }

  const patient = await Patient.findById(data.patientId).select('_id').lean();
  if (!patient) return { ok: false, error: 'Paciente não encontrado.' };
  if (!(await doctorCanAccessPatient(gate, data.patientId))) {
    return { ok: false, error: 'Paciente não encontrado.' };
  }

  // Uma associação a consulta tem de pertencer ao mesmo paciente e à clínica autorizada.
  if (data.appointmentId) {
    const appointment = await Appointment.findById(data.appointmentId)
      .select('patientId clinicId doctorId')
      .lean();
    if (!appointment || String(appointment.patientId) !== data.patientId) {
      return { ok: false, error: 'Consulta não encontrada para este paciente.' };
    }
    if (
      gate.role === 'receptionist' &&
      gate.clinicIds.length > 0 &&
      !gate.clinicIds.includes(String(appointment.clinicId))
    ) {
      return { ok: false, error: 'Sem permissões para esta clínica.' };
    }
    if (gate.role === 'doctor') {
      const user = await User.findById(gate.userId).select('doctorId').lean();
      if (!user?.doctorId || String(appointment.doctorId) !== String(user.doctorId)) {
        return { ok: false, error: 'Sem permissões para esta consulta.' };
      }
    }
  }

  // Fonte de verdade: o objeto TEM de existir no R2 com a chave que NÓS
  // emitimos no ticket (o client nunca escolhe o caminho)
  const publicId = patientDocumentKey(data.documentId);
  const asset = await fetchObjectInfo(publicId);
  if (!asset) {
    return {
      ok: false,
      error: 'Upload não encontrado — tente novamente.',
    };
  }
  if (asset.bytes > MAX_DOCUMENT_BYTES) {
    await deleteObjectAndDerivatives(publicId);
    return { ok: false, error: 'O ficheiro tem de ter no máximo 50 MB.' };
  }
  // Miniaturas (imagens): falha aqui não impede o registo do documento
  await generateDerivatives(publicId).catch(err =>
    console.error('[documents] miniaturas falharam:', err),
  );

  const filenameBase = data.filename?.replace(/\.[a-z0-9]{1,5}$/i, '') || null;
  const title =
    data.title ??
    filenameBase?.slice(0, 160) ??
    DOCUMENT_CATEGORY_LABEL[data.category];
  const format =
    asset.format ?? data.filename?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() ?? null;

  await ClinicalDocument.create({
    _id: new mongoose.Types.ObjectId(data.documentId),
    patientId: data.patientId,
    category: data.category,
    title,
    publicId,
    resourceType: asset.resourceType,
    format,
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
  if (
    !doc ||
    doc.voidedAt ||
    !(await doctorCanAccessPatient(gate, String(doc.patientId))) ||
    // Victor, 25/11 (B3): "Outro" fica fora do alcance do médico
    (gate.role === 'doctor' &&
      !doctorCanSeeDocument(
        doc,
        gate.userId,
        // 9.ª ronda (c): contratos só para os médicos autorizados
        doc.category === 'contract'
          ? await doctorSeesContracts(
              String(
                (await User.findById(gate.userId).select('doctorId').lean())
                  ?.doctorId ?? '',
              ),
            )
          : false,
      ))
  ) {
    return { ok: false, error: 'Documento não encontrado.' };
  }

  const url = await downloadUrl({
    key: doc.publicId,
    filename: doc.title,
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
  if (
    !doc ||
    doc.voidedAt ||
    !(await doctorCanAccessPatient(gate, String(doc.patientId)))
  ) {
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
