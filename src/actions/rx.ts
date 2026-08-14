// 📄 src/actions/rx.ts
// =============================================================================
// CDC Manager — Actions: pedidos de Raio-X
// -----------------------------------------------------------------------------
// RBAC:
// · createRxRequestAction / cancelRxRequestAction — MÉDICO, apenas nas SUAS
//   consultas (mesma guard requireOwnAppointment do registo de atos); pedir
//   só com consulta em curso (in-progress) — o pedido nasce na triagem.
// · advanceRxRequestAction — STAFF (admin/receção): é o operador da sala de
//   RX que inicia/conclui. Transições validadas por canTransitionRx.
// Auditoria com logAudit em todas as escritas (entityType 'RxRequest').
// Never delete: cancelar guarda autor+motivo; concluir guarda operador.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Appointment from '@/models/Appointment';
import RxRequest from '@/models/RxRequest';
import ClinicalDocument from '@/models/Document';
import {
  patientDocumentPublicId,
  uploadAuthenticatedDataUrl,
} from '@/lib/cloudinary';
import {
  canTransitionRx,
  RX_MODALITY_LABEL,
  RX_CONSENT_LEGAL_TEXT,
  type RxStatus,
} from '@/lib/domain';
import {
  createRxRequestSchema,
  advanceRxRequestSchema,
  cancelRxRequestSchema,
} from '@/lib/validations/rx';

export type RxActionState = { error: string } | { success: true } | undefined;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function fail(e: unknown): { error: string } {
  return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
}

// -----------------------------------------------------------------------------
// Guards
// -----------------------------------------------------------------------------
async function requireOwnAppointment(appointmentId: string) {
  const session = await auth();
  if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
    throw new Error('Sem permissões.');
  }
  if (!OBJECT_ID.test(appointmentId)) throw new Error('Marcação inválida.');
  await dbConnect();

  const appt = await Appointment.findById(appointmentId).lean();
  if (!appt || String(appt.doctorId) !== session.user.doctorId) {
    throw new Error('Marcação não encontrada.'); // não vazar existência
  }
  return { userId: session.user.id, doctorId: session.user.doctorId, appt };
}

async function requireStaff() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para operar a sala de RX.');
  }
  await dbConnect();
  return session.user;
}

// -----------------------------------------------------------------------------
// MÉDICO: criar pedido (na consulta em curso)
// -----------------------------------------------------------------------------
export async function createRxRequestAction(
  _prev: RxActionState,
  formData: FormData,
): Promise<RxActionState> {
  try {
    const parsed = createRxRequestSchema.safeParse({
      appointmentId: formData.get('appointmentId'),
      modality: formData.get('modality'),
      toothNumbers: formData.get('toothNumbers'),
      notes: formData.get('notes'),
      consentSignature: formData.get('consentSignature'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const { appointmentId, modality, toothNumbers, notes, consentSignature } =
      parsed.data;

    const { userId, doctorId, appt } =
      await requireOwnAppointment(appointmentId);

    // O pedido nasce na triagem — só com a consulta em curso
    if (appt.status !== 'in-progress') {
      return { error: 'Inicie a consulta para pedir Raio-X.' };
    }
    // Panorâmica não leva dentes-alvo (limpar em vez de recusar)
    const teeth = modality === 'panoramica' ? [] : toothNumbers;

    // --- B.6: consentimento POR EXPOSIÇÃO, assinado ANTES do pedido --------
    // 1) Assinatura sobe para o Cloudinary (authenticated, id opaco)
    // 2) Document categoria 'consent' com snapshot do texto legal
    // 3) Só então nasce o RxRequest, já ligado ao consentimento
    // Se (1) falhar, NÃO há pedido — RX sem consentimento não existe.
    // Se (3) falhar após (2), fica um consentimento órfão auditado —
    // inofensivo e visível nos Documentos; nunca o inverso.
    const consentDocId = new mongoose.Types.ObjectId();
    const publicId = patientDocumentPublicId(String(consentDocId));
    const asset = await uploadAuthenticatedDataUrl(publicId, consentSignature);

    const dateLabel = new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Lisbon',
    }).format(new Date());

    await ClinicalDocument.create({
      _id: consentDocId,
      patientId: appt.patientId,
      category: 'consent',
      title: `Consentimento RX — ${RX_MODALITY_LABEL[modality]} — ${dateLabel}`,
      publicId,
      resourceType: 'image',
      format: asset.format,
      bytes: asset.bytes,
      visibleToPatient: true, // o paciente pode rever o que assinou no portal
      uploadedByUserId: userId,
      appointmentId: appt._id,
      note: RX_CONSENT_LEGAL_TEXT, // snapshot imutável do texto apresentado
    });

    await logAudit({
      userId,
      action: 'create',
      entityType: 'Document',
      entityId: String(consentDocId),
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: `Consentimento RX assinado (${modality})`,
    });

    const created = await RxRequest.create({
      clinicId: appt.clinicId,
      patientId: appt.patientId,
      doctorId,
      appointmentId: appt._id,
      modality,
      toothNumbers: teeth,
      notes,
      consentDocumentId: consentDocId,
    });

    await logAudit({
      userId,
      action: 'create',
      entityType: 'RxRequest',
      entityId: String(created._id),
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: `Pedido de RX (${modality}${teeth.length ? ` ${teeth.join(',')}` : ''})`,
    });

    revalidatePath(`/doutor/consulta/${appointmentId}`);
    revalidatePath('/admin/rx');
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// STAFF: avançar estado (iniciar captação / concluir)
// -----------------------------------------------------------------------------
export async function advanceRxRequestAction(
  _prev: RxActionState,
  formData: FormData,
): Promise<RxActionState> {
  try {
    const parsed = advanceRxRequestSchema.safeParse({
      requestId: formData.get('requestId'),
      to: formData.get('to'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const user = await requireStaff();
    const { requestId, to } = parsed.data;

    const req = await RxRequest.findById(requestId);
    if (!req) return { error: 'Pedido não encontrado.' };

    if (!canTransitionRx(req.status as RxStatus, to)) {
      return {
        error: `Transição inválida (${req.status} → ${to}) — atualize a página.`,
      };
    }

    // Atualização condicionada ao estado lido — se outro operador avançou
    // entretanto, aborta em vez de pisar (invariante por transação simples)
    const now = new Date();
    const updated = await RxRequest.findOneAndUpdate(
      { _id: req._id, status: req.status },
      {
        $set: {
          status: to,
          ...(to === 'in-progress' ? { startedAt: now } : {}),
          ...(to === 'done'
            ? {
                completedAt: now,
                completedByUserId: user.id,
                // Captação rápida sem "iniciar": regista início = fim
                ...(req.startedAt ? {} : { startedAt: now }),
              }
            : {}),
        },
      },
      { new: true },
    );
    if (!updated) {
      return { error: 'O pedido mudou de estado entretanto — atualize.' };
    }

    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'RxRequest',
      entityId: String(req._id),
      patientId: String(req.patientId),
      clinicId: String(req.clinicId),
      summary: `RX ${req.status} → ${to}`,
    });

    revalidatePath('/admin/rx');
    revalidatePath(`/doutor/consulta/${String(req.appointmentId)}`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// MÉDICO: cancelar o SEU pedido (só enquanto 'requested')
// -----------------------------------------------------------------------------
export async function cancelRxRequestAction(
  _prev: RxActionState,
  formData: FormData,
): Promise<RxActionState> {
  try {
    const parsed = cancelRxRequestSchema.safeParse({
      requestId: formData.get('requestId'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const { requestId, reason } = parsed.data;

    await dbConnect();
    const req = await RxRequest.findById(requestId);
    if (!req) return { error: 'Pedido não encontrado.' };

    // Guard de posse via consulta de origem (reusa a mesma verificação)
    const { userId } = await requireOwnAppointment(String(req.appointmentId));

    if (!canTransitionRx(req.status as RxStatus, 'cancelled')) {
      return { error: 'Este pedido já foi iniciado — fale com a sala de RX.' };
    }

    const updated = await RxRequest.findOneAndUpdate(
      { _id: req._id, status: req.status },
      {
        $set: {
          status: 'cancelled',
          cancelledByUserId: userId,
          cancelReason: reason,
        },
      },
      { new: true },
    );
    if (!updated) {
      return { error: 'O pedido mudou de estado entretanto — atualize.' };
    }

    await logAudit({
      userId,
      action: 'delete',
      entityType: 'RxRequest',
      entityId: String(req._id),
      patientId: String(req.patientId),
      clinicId: String(req.clinicId),
      summary: `Pedido de RX cancelado${reason ? `: ${reason}` : ''}`,
    });

    revalidatePath(`/doutor/consulta/${String(req.appointmentId)}`);
    revalidatePath('/admin/rx');
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
