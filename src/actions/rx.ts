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
  fetchDocumentAssetInfo,
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

// -----------------------------------------------------------------------------
// STAFF: anexar imagem captada ao pedido (fecha o circuito clínico)
// -----------------------------------------------------------------------------
// O operador da sala de RX capta no RVG5200/Carestream, exporta (jpg/png/
// pdf) e anexa aqui. A imagem entra por DOIS caminhos ao mesmo tempo:
//   1. Document (category 'xray') na ficha do paciente — visível nos
//      separadores Documentos (médico e admin)
//   2. imageRef {source:'manual'} no RxRequest — o painel de RX da
//      consulta mostra a imagem ao médico, que a apresenta ao paciente
// Anexar também CONCLUI o pedido se ainda estiver requested/in-progress
// (a imagem É a prova da captação). Quando a ponte iRYS/CS Imaging chegar
// (fase 2), preencherá os mesmos imageRefs — a UI não muda.
// Fluxo de upload: o MESMO 3-passos dos documentos (ticket assinado →
// POST direto ao Cloudinary → registo verificado aqui).
export async function registerRxImageAction(
  formData: FormData,
): Promise<RxActionState> {
  try {
    const user = await requireStaff();

    const requestId = String(formData.get('requestId') ?? '');
    const documentId = String(formData.get('documentId') ?? '');
    if (!OBJECT_ID.test(requestId) || !OBJECT_ID.test(documentId)) {
      return { error: 'Dados inválidos.' };
    }

    const req = await RxRequest.findById(requestId);
    if (!req) return { error: 'Pedido não encontrado.' };
    if (req.status === 'cancelled') {
      return { error: 'Pedido cancelado — não é possível anexar imagens.' };
    }

    // Fonte de verdade: o asset TEM de existir no Cloudinary com o
    // public_id que NÓS emitimos no ticket (mesma regra dos documentos)
    const publicId = patientDocumentPublicId(documentId);
    const asset = await fetchDocumentAssetInfo(publicId);
    if (!asset) {
      return { error: 'Upload não encontrado no Cloudinary — tente de novo.' };
    }

    const modalityLabel =
      RX_MODALITY_LABEL[req.modality as keyof typeof RX_MODALITY_LABEL] ??
      req.modality;
    const teeth = (req.toothNumbers ?? []) as string[];
    const title = `RX ${modalityLabel}${teeth.length ? ` — dentes ${teeth.join(', ')}` : ''}`;

    // 1. Document na ficha (idempotente: re-submissão não duplica)
    const existing = await ClinicalDocument.findById(documentId)
      .select('_id')
      .lean();
    if (!existing) {
      await ClinicalDocument.create({
        _id: new mongoose.Types.ObjectId(documentId),
        patientId: req.patientId,
        category: 'xray',
        title,
        publicId,
        resourceType: asset.resourceType,
        format: asset.format,
        bytes: asset.bytes,
        visibleToPatient: false,
        uploadedByUserId: user.id,
        appointmentId: req.appointmentId,
        note: `Captado na sala de RX (pedido ${modalityLabel})`,
      });
    }

    // 2. imageRef no pedido (idempotente pelo externalRef)
    const alreadyLinked = (req.imageRefs ?? []).some(
      r => r.externalRef === publicId,
    );
    if (!alreadyLinked) {
      await RxRequest.updateOne(
        { _id: req._id },
        {
          $push: {
            imageRefs: {
              source: 'manual',
              externalRef: publicId,
              url: null,
              addedAt: new Date(),
            },
          },
        },
      );
    }

    // 3. Anexar conclui a captação (se ainda aberta) — condicionado ao
    //    estado lido, como no advance (operadores simultâneos não se pisam)
    if (req.status === 'requested' || req.status === 'in-progress') {
      const now = new Date();
      await RxRequest.updateOne(
        { _id: req._id, status: req.status },
        {
          $set: {
            status: 'done',
            completedAt: now,
            completedByUserId: user.id,
            ...(req.startedAt ? {} : { startedAt: now }),
          },
        },
      );
    }

    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'RxRequest',
      entityId: String(req._id),
      patientId: String(req.patientId),
      clinicId: String(req.clinicId),
      summary: `Imagem de RX anexada (${modalityLabel})`,
    });

    revalidatePath('/admin/rx');
    revalidatePath(`/doutor/consulta/${String(req.appointmentId)}`);
    revalidatePath(`/admin/pacientes/${String(req.patientId)}`);
    revalidatePath(`/doutor/pacientes/${String(req.patientId)}`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
