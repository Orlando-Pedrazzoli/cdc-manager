// 📄 src/actions/signature-requests.ts
// =============================================================================
// CDC Manager — Server Actions: tablet de assinatura (3.ª reunião, out/2026)
// -----------------------------------------------------------------------------
// DUAS portas para o mesmo núcleo (src/lib/signing.ts):
//
// · LADO DA RECEÇÃO (sessão NextAuth, admin/receção/médico)
//   - listTabletsAction              → clínicas com tablet ligado
//   - createGdprSignatureRequestAction / createTemplateSignatureRequestAction
//   - getSignatureRequestStatusAction (polling de 3 s no modal)
//   - cancelSignatureRequestAction
//   - linkTabletAction / unlinkTabletAction (admin — Configurações → Clínicas)
//
// · LADO DO TABLET (cookie de dispositivo, SEM sessão — ver src/lib/kiosk.ts)
//   - kioskStateAction               → clínica + pedido pendente mais antigo
//   - kioskSignAction                → assina → Document gerado
//   O tablet nunca recebe mais do que o pedido que está a mostrar.
// =============================================================================

'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Clinic from '@/models/Clinic';
import Patient from '@/models/Patient';
import DocumentTemplate from '@/models/DocumentTemplate';
import SignatureRequest, {
  SIGNATURE_REQUEST_TTL_MS,
  type SignatureRequestStatus,
} from '@/models/SignatureRequest';
import { getOrganization } from '@/models/Organization';
import { gdprConsentText } from '@/lib/domain';
import { clinicBadge } from '@/lib/branding';
import {
  finalizeGdprConsent,
  finalizeIssuedDocument,
  validateSignatureDataUrl,
} from '@/lib/signing';
import { getKioskClinic, newKioskToken } from '@/lib/kiosk';

const OID = /^[0-9a-fA-F]{24}$/;
type StaffRole = 'admin' | 'receptionist' | 'doctor';

async function requireStaff(): Promise<{
  userId: string;
  role: StaffRole;
  doctorId: string | null;
} | null> {
  const session = await auth();
  const role = session?.user?.role;
  if (
    !session?.user?.id ||
    (role !== 'admin' && role !== 'receptionist' && role !== 'doctor')
  )
    return null;
  return {
    userId: session.user.id,
    role,
    doctorId: session.user.doctorId ?? null,
  };
}

/** Pendentes cuja validade passou → 'expired' (chamado antes de ler filas) */
async function sweepExpired(clinicId?: string) {
  await SignatureRequest.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() },
      ...(clinicId ? { clinicId } : {}),
    },
    { $set: { status: 'expired' } },
  );
}

// =============================================================================
// LADO DA RECEÇÃO
// =============================================================================

export interface TabletOption {
  clinicId: string;
  label: string;
  color: string;
}

/** Clínicas ativas com tablet ligado — alimenta o botão "Enviar para o tablet" */
export async function listTabletsAction(): Promise<TabletOption[]> {
  if (!(await requireStaff())) return [];
  await dbConnect();
  const clinics = await Clinic.find({
    isActive: true,
    kioskToken: { $ne: null },
  })
    .select('slug name shortName color')
    .sort({ slug: 1 })
    .lean();
  return clinics.map((c, i) => {
    const b = clinicBadge(c, i);
    return { clinicId: String(c._id), label: b.label, color: b.fg };
  });
}

export interface SignatureRequestState {
  id: string;
  status: SignatureRequestStatus;
  documentId: string | null;
  lastError: string | null;
}

export async function createGdprSignatureRequestAction(input: {
  patientId: string;
  clinicId: string;
}): Promise<{ error?: string; request?: SignatureRequestState }> {
  try {
    const staff = await requireStaff();
    if (!staff || staff.role === 'doctor') return { error: 'Sem permissões.' };
    if (!OID.test(input.patientId) || !OID.test(input.clinicId))
      return { error: 'Dados inválidos.' };
    await dbConnect();
    const [patient, clinic, org] = await Promise.all([
      Patient.findById(input.patientId).select('name status').lean(),
      Clinic.findOne({ _id: input.clinicId, isActive: true })
        .select('+kioskToken')
        .lean(),
      getOrganization(),
    ]);
    if (!patient || patient.status !== 'active')
      return { error: 'Paciente não encontrado ou inativo.' };
    if (!clinic?.kioskToken)
      return { error: 'Esta clínica não tem tablet ligado.' };

    // Um pedido pendente por paciente+tipo: reenviar substitui o anterior
    await SignatureRequest.updateMany(
      { patientId: patient._id, kind: 'gdpr', status: 'pending' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
    );
    const req = await SignatureRequest.create({
      clinicId: clinic._id,
      patientId: patient._id,
      patientName: patient.name,
      kind: 'gdpr',
      title: 'Consentimento RGPD',
      body: gdprConsentText(org),
      requestedByUserId: staff.userId,
      expiresAt: new Date(Date.now() + SIGNATURE_REQUEST_TTL_MS),
    });
    return {
      request: {
        id: String(req._id),
        status: 'pending',
        documentId: null,
        lastError: null,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function createTemplateSignatureRequestAction(input: {
  templateId: string;
  patientId: string;
  clinicId: string;
  title: string;
  body: string;
  visibleToPatient: boolean;
}): Promise<{ error?: string; request?: SignatureRequestState }> {
  try {
    const staff = await requireStaff();
    if (!staff) return { error: 'Sem permissões.' };
    if (
      !OID.test(input.templateId) ||
      !OID.test(input.patientId) ||
      !OID.test(input.clinicId)
    )
      return { error: 'Dados inválidos.' };
    const title = input.title.trim().slice(0, 120);
    const body = input.body.replace(/\r/g, '').trim();
    if (title.length < 3 || body.length < 10)
      return { error: 'Título ou texto em falta.' };
    await dbConnect();
    const [patient, clinic, t] = await Promise.all([
      Patient.findById(input.patientId).select('name status').lean(),
      Clinic.findOne({ _id: input.clinicId, isActive: true })
        .select('+kioskToken')
        .lean(),
      DocumentTemplate.findById(input.templateId)
        .select('active allowStaff title')
        .lean(),
    ]);
    if (!patient || patient.status !== 'active')
      return { error: 'Paciente não encontrado ou inativo.' };
    if (!clinic?.kioskToken)
      return { error: 'Esta clínica não tem tablet ligado.' };
    if (!t || !t.active) return { error: 'Modelo indisponível.' };
    if (staff.role !== 'doctor' && !t.allowStaff)
      return { error: 'Este modelo só pode ser emitido pelo médico.' };

    const req = await SignatureRequest.create({
      clinicId: clinic._id,
      patientId: patient._id,
      patientName: patient.name,
      kind: 'template',
      templateId: t._id,
      doctorId: staff.role === 'doctor' ? staff.doctorId : null,
      visibleToPatient: input.visibleToPatient,
      title,
      body,
      requestedByUserId: staff.userId,
      expiresAt: new Date(Date.now() + SIGNATURE_REQUEST_TTL_MS),
    });
    return {
      request: {
        id: String(req._id),
        status: 'pending',
        documentId: null,
        lastError: null,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

/** Polling do modal da receção (3 s) */
export async function getSignatureRequestStatusAction(
  id: string,
): Promise<{ error?: string; request?: SignatureRequestState }> {
  try {
    const staff = await requireStaff();
    if (!staff) return { error: 'Sem permissões.' };
    if (!OID.test(id)) return { error: 'Pedido inválido.' };
    await dbConnect();
    await sweepExpired();
    const r = await SignatureRequest.findById(id)
      .select('status documentId lastError patientId')
      .lean();
    if (!r) return { error: 'Pedido não encontrado.' };
    if (r.status === 'signed') {
      // A ficha do paciente mostra o novo documento sem F5
      revalidatePath(`/admin/pacientes/${String(r.patientId)}`);
      revalidatePath(`/doutor/pacientes/${String(r.patientId)}`);
    }
    return {
      request: {
        id,
        status: r.status as SignatureRequestStatus,
        documentId: r.documentId ? String(r.documentId) : null,
        lastError: r.lastError ?? null,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function cancelSignatureRequestAction(
  id: string,
): Promise<{ error?: string }> {
  try {
    const staff = await requireStaff();
    if (!staff) return { error: 'Sem permissões.' };
    if (!OID.test(id)) return { error: 'Pedido inválido.' };
    await dbConnect();
    await SignatureRequest.updateOne(
      { _id: id, status: 'pending' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
    );
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// --- Admin: ligar / desligar o tablet de uma clínica ---------------------------

export async function linkTabletAction(
  clinicId: string,
): Promise<{ error?: string; url?: string }> {
  try {
    const staff = await requireStaff();
    if (!staff || staff.role !== 'admin') return { error: 'Sem permissões.' };
    if (!OID.test(clinicId)) return { error: 'Clínica inválida.' };
    await dbConnect();
    const token = newKioskToken();
    const r = await Clinic.updateOne(
      { _id: clinicId, isActive: true },
      { $set: { kioskToken: token, kioskTokenAt: new Date() } },
    );
    if (!r.matchedCount) return { error: 'Clínica não encontrada.' };
    await logAudit({
      userId: staff.userId,
      action: 'update',
      entityType: 'Clinic',
      entityId: clinicId,
      clinicId,
      summary: 'Tablet de assinatura ligado (novo token)',
      changedFields: ['kioskToken'],
    });
    revalidatePath('/admin/configuracoes');
    return { url: `/quiosque/ligar/${token}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function unlinkTabletAction(
  clinicId: string,
): Promise<{ error?: string }> {
  try {
    const staff = await requireStaff();
    if (!staff || staff.role !== 'admin') return { error: 'Sem permissões.' };
    if (!OID.test(clinicId)) return { error: 'Clínica inválida.' };
    await dbConnect();
    await Clinic.updateOne(
      { _id: clinicId },
      { $set: { kioskToken: null, kioskTokenAt: null } },
    );
    await logAudit({
      userId: staff.userId,
      action: 'update',
      entityType: 'Clinic',
      entityId: clinicId,
      clinicId,
      summary: 'Tablet de assinatura desligado',
      changedFields: ['kioskToken'],
    });
    revalidatePath('/admin/configuracoes');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// =============================================================================
// LADO DO TABLET (cookie de dispositivo)
// =============================================================================

export interface KioskState {
  linked: boolean;
  clinic: { name: string; label: string; color: string } | null;
  org: { name: string; logoUrl: string | null } | null;
  request: {
    id: string;
    patientName: string;
    title: string;
    body: string;
    kind: 'gdpr' | 'template';
  } | null;
}

/** Polling do tablet (3 s): o pedido pendente mais antigo da sua clínica */
export async function kioskStateAction(): Promise<KioskState> {
  await dbConnect();
  const clinic = await getKioskClinic();
  if (!clinic) return { linked: false, clinic: null, org: null, request: null };
  await sweepExpired(String(clinic._id));
  const [org, r] = await Promise.all([
    getOrganization(),
    SignatureRequest.findOne({ clinicId: clinic._id, status: 'pending' })
      .sort({ createdAt: 1 })
      .select('patientName title body kind')
      .lean(),
  ]);
  const badge = clinicBadge(clinic);
  return {
    linked: true,
    clinic: { name: clinic.name, label: badge.label, color: badge.fg },
    org: { name: org.name, logoUrl: org.logoUrl ?? null },
    request: r
      ? {
          id: String(r._id),
          patientName: r.patientName,
          title: r.title,
          body: r.body,
          kind: r.kind as 'gdpr' | 'template',
        }
      : null,
  };
}

export async function kioskSignAction(input: {
  requestId: string;
  signatureDataUrl: string;
}): Promise<{ error?: string; ok?: true }> {
  try {
    await dbConnect();
    const clinic = await getKioskClinic();
    if (!clinic) return { error: 'Tablet não ligado.' };
    if (!OID.test(input.requestId)) return { error: 'Pedido inválido.' };
    const v = validateSignatureDataUrl(input.signatureDataUrl);
    if (v.error) return v;

    // Só pedidos DESTA clínica, ainda pendentes e dentro da validade
    const r = await SignatureRequest.findOne({
      _id: input.requestId,
      clinicId: clinic._id,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });
    if (!r) return { error: 'Este pedido já não está disponível.' };

    const res =
      r.kind === 'gdpr'
        ? await finalizeGdprConsent({
            patientId: String(r.patientId),
            signatureDataUrl: input.signatureDataUrl,
            userId: String(r.requestedByUserId),
            via: 'tablet',
          })
        : await finalizeIssuedDocument({
            templateId: String(r.templateId),
            patientId: String(r.patientId),
            clinicId: String(r.clinicId),
            doctorId: r.doctorId ? String(r.doctorId) : null,
            title: r.title,
            body: r.body,
            signatureDataUrl: input.signatureDataUrl,
            visibleToPatient: r.visibleToPatient !== false,
            userId: String(r.requestedByUserId),
            via: 'tablet',
          });

    if (res.error) {
      r.lastError = res.error;
      await r.save();
      return { error: res.error };
    }
    r.status = 'signed';
    r.signedAt = new Date();
    r.documentId = res.documentId
      ? new mongoose.Types.ObjectId(res.documentId)
      : null;
    r.lastError = null;
    await r.save();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
