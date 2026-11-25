// 📄 src/actions/doctor-signature.ts
// =============================================================================
// CDC Manager — Actions: imagem da assinatura do médico (só gestão)
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta A8). A gestão carrega, na ficha do médico, a
// imagem da assinatura que ele entregou; passa a sair impressa nos documentos
// que ele emite (atestados, relatórios, certificados…). Substituir = carregar
// outra. Remover = os documentos voltam a sair só com a linha para assinar.
// Documentos já emitidos não mudam.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  deleteObjectAndDerivatives,
  doctorSignatureKey,
  putObject,
} from '@/lib/storage';
import {
  SIGNATURE_MAX_BYTES,
  SIGNATURE_MIMES,
  normalizeSignatureImage,
} from '@/lib/document-signature';
import Doctor from '@/models/Doctor';

export type DoctorSignatureState = { error: string } | { success: true } | undefined;

const OID = /^[0-9a-fA-F]{24}$/;

export async function uploadDoctorSignatureAction(
  _prev: DoctorSignatureState,
  formData: FormData,
): Promise<DoctorSignatureState> {
  try {
    const session = await getVerifiedSession(['admin']);
    if (!session?.user?.id) return { error: 'Apenas a gestão pode carregar a assinatura.' };

    const doctorId = String(formData.get('doctorId') ?? '');
    if (!OID.test(doctorId)) return { error: 'Médico inválido.' };
    const file = formData.get('signature');
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Escolha a imagem da assinatura.' };
    }
    if (!SIGNATURE_MIMES.has(file.type)) {
      return { error: 'Formato inválido — use PNG ou JPEG.' };
    }
    if (file.size > SIGNATURE_MAX_BYTES) {
      return { error: 'A imagem tem de ter no máximo 800 KB.' };
    }

    await dbConnect();
    const doctor = await Doctor.findById(doctorId).select('name');
    if (!doctor) return { error: 'Médico não encontrado.' };

    let png: Buffer;
    try {
      png = await normalizeSignatureImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      return {
        error:
          'Não foi possível ler a imagem. Use uma fotografia nítida da assinatura em papel branco.',
      };
    }
    const { bytes } = await putObject(doctorSignatureKey(doctorId), png, 'image/png');
    await Doctor.updateOne({ _id: doctorId }, { $set: { signatureUpdatedAt: new Date() } });

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Doctor',
      entityId: doctorId,
      summary: `Assinatura para documentos carregada: ${doctor.name} (${Math.round(bytes / 1024)} KB)`,
      changedFields: ['signatureUpdatedAt'],
    });
    revalidatePath(`/admin/medicos/${doctorId}`);
    return { success: true };
  } catch (err) {
    console.error('[medicos] upload da assinatura:', err);
    return { error: 'Não foi possível carregar a assinatura.' };
  }
}

export async function removeDoctorSignatureAction(
  doctorId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await getVerifiedSession(['admin']);
    if (!session?.user?.id) return { error: 'Apenas a gestão pode remover a assinatura.' };
    if (!OID.test(doctorId)) return { error: 'Médico inválido.' };

    await dbConnect();
    const doctor = await Doctor.findById(doctorId).select('name');
    if (!doctor) return { error: 'Médico não encontrado.' };

    await deleteObjectAndDerivatives(doctorSignatureKey(doctorId));
    await Doctor.updateOne({ _id: doctorId }, { $set: { signatureUpdatedAt: null } });
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Doctor',
      entityId: doctorId,
      summary: `Assinatura para documentos removida: ${doctor.name}`,
      changedFields: ['signatureUpdatedAt'],
    });
    revalidatePath(`/admin/medicos/${doctorId}`);
    return { ok: true };
  } catch (err) {
    console.error('[medicos] remover a assinatura:', err);
    return { error: 'Não foi possível remover a assinatura.' };
  }
}
