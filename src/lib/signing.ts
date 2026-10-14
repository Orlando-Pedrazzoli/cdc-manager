// 📄 src/lib/signing.ts
// =============================================================================
// CDC Manager — Núcleo partilhado de assinatura (balcão E tablet)
// -----------------------------------------------------------------------------
// 3.ª reunião (Victor, 09/10/2026): "o paciente assina no tablet, ao balcão,
// o consentimento RGPD no momento da criação da ficha e os consentimentos
// informados dos tratamentos". Para o tablet produzir EXATAMENTE o mesmo
// resultado que a assinatura no ecrã da receção, a lógica que estava nas
// actions (signGdprConsentAction, issueDocumentAction) vive aqui e ambas as
// portas — a action autenticada por sessão e a action do quiosque autenticada
// por cookie de dispositivo — chamam estas funções.
//
// Nunca importar de 'use server': são funções Node puras com acesso à base.
// Quem chama já validou permissões; aqui valida-se apenas o conteúdo.
// =============================================================================

import mongoose from 'mongoose';
import ClinicalDocument from '@/models/Document';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import DocumentTemplate from '@/models/DocumentTemplate';
import { getActiveClinics } from '@/models/Clinic';
import { getOrganization } from '@/models/Organization';
import { gdprConsentText } from '@/lib/domain';
import { logAudit } from '@/lib/audit';
import { renderDocumentPdf } from '@/lib/document-pdf';
import { longDatePt, shortDatePt } from '@/lib/document-merge';
import {
  patientDocumentPublicId,
  uploadAuthenticatedDataUrl,
  uploadAuthenticatedPdf,
} from '@/lib/cloudinary';
import {
  TEMPLATE_KIND_DOC_CATEGORY,
  type TemplateKind,
} from '@/lib/data/document-templates';

const OID = /^[0-9a-fA-F]{24}$/;

/** PNG base64 vindo do SignaturePad; ≤ 400 KB */
export function validateSignatureDataUrl(s: string | null | undefined): {
  error?: string;
} {
  if (!s || !/^data:image\/png;base64,/.test(s))
    return { error: 'Assinatura em falta.' };
  if (s.length > 400_000) return { error: 'Assinatura demasiado grande.' };
  return {};
}

// -----------------------------------------------------------------------------
// RGPD — Document 'consent' com a imagem da assinatura e o texto congelado
// -----------------------------------------------------------------------------
export async function finalizeGdprConsent(params: {
  patientId: string;
  signatureDataUrl: string;
  /** Utilizador responsável (quem recolheu / quem enviou para o tablet) */
  userId: string;
  /** 'balcão' | 'tablet' — só para o resumo da auditoria */
  via: 'balcao' | 'tablet';
}): Promise<{ error?: string; documentId?: string }> {
  if (!OID.test(params.patientId)) return { error: 'Paciente inválido.' };
  const v = validateSignatureDataUrl(params.signatureDataUrl);
  if (v.error) return v;

  const patient = await Patient.findById(params.patientId).select(
    'name consents status',
  );
  if (!patient || patient.status !== 'active')
    return { error: 'Paciente não encontrado ou inativo.' };

  const docId = new mongoose.Types.ObjectId();
  const publicId = patientDocumentPublicId(String(docId));
  const asset = await uploadAuthenticatedDataUrl(
    publicId,
    params.signatureDataUrl,
  );
  const now = new Date();

  await ClinicalDocument.create({
    _id: docId,
    patientId: patient._id,
    category: 'consent',
    title: `Consentimento RGPD — ${shortDatePt(now)}`,
    publicId,
    resourceType: 'image',
    format: asset.format,
    bytes: asset.bytes,
    visibleToPatient: true,
    uploadedByUserId: params.userId,
    appointmentId: null,
    note: gdprConsentText(await getOrganization()), // snapshot imutável do texto assinado
  });

  const $set: Record<string, unknown> = {
    'consents.gdprSignedAt': now,
    'consents.gdprDocumentId': docId,
  };
  if (!patient.consents?.dataProcessingAt)
    $set['consents.dataProcessingAt'] = now;
  await Patient.updateOne({ _id: patient._id }, { $set });

  await logAudit({
    userId: params.userId,
    action: 'create',
    entityType: 'Document',
    entityId: String(docId),
    patientId: String(patient._id),
    summary:
      params.via === 'tablet'
        ? 'Consentimento RGPD assinado no tablet'
        : 'Consentimento RGPD assinado na ficha',
  });
  return { documentId: String(docId) };
}

// -----------------------------------------------------------------------------
// Documento a partir de modelo — PDF (react-pdf) com assinatura opcional
// -----------------------------------------------------------------------------
export async function finalizeIssuedDocument(params: {
  templateId: string;
  patientId: string;
  clinicId: string | null;
  /** Médico emissor (só quando quem emite é médico) */
  doctorId: string | null;
  title: string;
  body: string; // texto final, já editado
  signatureDataUrl: string | null;
  visibleToPatient: boolean;
  userId: string;
  via: 'balcao' | 'tablet';
}): Promise<{ error?: string; documentId?: string }> {
  if (!OID.test(params.templateId) || !OID.test(params.patientId))
    return { error: 'Dados inválidos.' };
  const title = params.title.trim().slice(0, 120);
  const body = params.body.replace(/\r/g, '').trim();
  if (title.length < 3 || body.length < 10)
    return { error: 'Título ou texto em falta.' };
  if (params.signatureDataUrl) {
    const v = validateSignatureDataUrl(params.signatureDataUrl);
    if (v.error) return { error: 'Assinatura inválida.' };
  }

  const t = await DocumentTemplate.findById(params.templateId).lean();
  if (!t || !t.active) return { error: 'Modelo indisponível.' };
  if (t.requiresSignature && !params.signatureDataUrl)
    return { error: 'Este documento exige a assinatura do paciente.' };

  const [patient, doctor, clinics] = await Promise.all([
    Patient.findById(params.patientId).select('name').lean(),
    params.doctorId && OID.test(params.doctorId)
      ? Doctor.findById(params.doctorId).select('name licenseNumber').lean()
      : null,
    getActiveClinics(),
  ]);
  if (!patient) return { error: 'Paciente não encontrado.' };
  const clinic =
    clinics.find(c => String(c._id) === (params.clinicId ?? '')) ?? clinics[0];

  const now = new Date();
  const pdf = await renderDocumentPdf({
    clinic: {
      name: clinic?.name ?? 'Centro Dentário Colombo',
      legalName: clinic?.legalName ?? null,
      nipc: clinic?.nipc ?? null,
      address: clinic?.address ?? null,
      phone: clinic?.phone ?? null,
      email: clinic?.email ?? null,
    },
    title,
    body,
    doctorName: doctor?.name ?? null,
    doctorLicense: doctor?.licenseNumber ?? null,
    issuedAtLabel: `${clinic?.address?.split(',').pop()?.trim() || 'Lisboa'}, ${longDatePt(now)}`,
    patientSignatureDataUrl: params.signatureDataUrl,
    patientSignatureLabel:
      t.requiresSignature || params.signatureDataUrl
        ? 'O(a) paciente / representante legal'
        : null,
  });

  const docId = new mongoose.Types.ObjectId();
  const publicId = patientDocumentPublicId(String(docId));
  const asset = await uploadAuthenticatedPdf(publicId, pdf);
  const category =
    TEMPLATE_KIND_DOC_CATEGORY[t.kind as TemplateKind] ?? 'other';
  await ClinicalDocument.create({
    _id: docId,
    patientId: patient._id,
    category,
    title: `${title} — ${shortDatePt(now)}`,
    publicId,
    resourceType: 'image',
    format: asset.format ?? 'pdf',
    bytes: asset.bytes,
    visibleToPatient: params.visibleToPatient,
    uploadedByUserId: params.userId,
    appointmentId: null,
    note: `Emitido a partir do modelo «${t.title}»${doctor ? ` por ${doctor.name}` : ''}${params.via === 'tablet' ? ' · assinado no tablet' : ''}`,
  });
  await logAudit({
    userId: params.userId,
    action: 'create',
    entityType: 'Document',
    entityId: String(docId),
    patientId: String(patient._id),
    summary: `Documento emitido: ${title}${params.signatureDataUrl ? (params.via === 'tablet' ? ' (assinado no tablet)' : ' (assinado)') : ''}`,
  });
  return { documentId: String(docId) };
}
