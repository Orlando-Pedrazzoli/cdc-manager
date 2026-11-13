// 📄 src/actions/patient-block.ts
// =============================================================================
// CDC Manager — Server Action: bloquear / desbloquear marcações de um paciente
// -----------------------------------------------------------------------------
// 7.ª ronda/B4 (Victor, 13/11/2026). Só a GESTÃO (perfil admin) bloqueia e
// desbloqueia. O bloqueio guarda o motivo, quem o fez e quando; fica também
// no registo de auditoria. As actions de marcação (nova marcação, encaixe e
// remarcação) recusam um paciente bloqueado e devolvem o motivo.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { parseBlockReason } from '@/lib/booking-block';
import Patient from '@/models/Patient';
import User from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Só a gestão pode bloquear ou desbloquear marcações.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    throw new Error(
      'Conta inativa ou permissões alteradas. Inicie sessão novamente.',
    );
  }
  return session.user;
}

export async function setBookingBlockAction(
  patientId: string,
  input: { blocked: boolean; reason?: string },
): Promise<{ error?: string }> {
  if (!OBJECT_ID.test(patientId)) return { error: 'Paciente inválido.' };
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const patient = await Patient.findById(patientId).select(
    'name bookingBlockedAt bookingBlockReason',
  );
  if (!patient) return { error: 'Paciente não encontrado.' };

  if (input.blocked) {
    const parsed = parseBlockReason(input.reason);
    if (!parsed.ok) return { error: parsed.error };
    await Patient.updateOne(
      { _id: patientId },
      {
        $set: {
          bookingBlockedAt: new Date(),
          bookingBlockReason: parsed.reason,
          bookingBlockedByUserId: admin.id,
        },
      },
    );
    await logAudit({
      userId: admin.id,
      action: 'update',
      entityType: 'Patient',
      entityId: patientId,
      patientId,
      summary: `Marcações bloqueadas: ${parsed.reason}`,
      changedFields: ['bookingBlockedAt', 'bookingBlockReason'],
    });
  } else {
    if (!patient.bookingBlockedAt) return {};
    await Patient.updateOne(
      { _id: patientId },
      {
        $set: {
          bookingBlockedAt: null,
          bookingBlockReason: null,
          bookingBlockedByUserId: null,
        },
      },
    );
    await logAudit({
      userId: admin.id,
      action: 'update',
      entityType: 'Patient',
      entityId: patientId,
      patientId,
      summary: `Marcações desbloqueadas (motivo anterior: ${patient.bookingBlockReason ?? '—'})`,
      changedFields: ['bookingBlockedAt', 'bookingBlockReason'],
    });
  }

  revalidatePath(`/admin/pacientes/${patientId}`);
  revalidatePath('/admin/agenda');
  return {};
}
