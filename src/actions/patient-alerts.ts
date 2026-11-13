// 📄 src/actions/patient-alerts.ts
// =============================================================================
// CDC Manager — Server Actions: avisos do paciente (7.ª ronda/B5)
// -----------------------------------------------------------------------------
//   · getPatientAlertsAction — avisos automáticos + observação da equipa
//   · updatePatientAlertNoteAction — "que todos possam editar e colocar estas
//     observações": gestão, receção e médicos. Fica no registo de auditoria.
// Regras e textos em lib/patient-alerts.ts.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { summarizeAttendance } from '@/lib/attendance';
import { requireDoctorWithPatient } from '@/lib/rbac';
import {
  ALERT_ATTENDANCE_MONTHS,
  ALERT_NOTE_MAX,
  buildPatientAlerts,
  type PatientAlert,
} from '@/lib/patient-alerts';
import Appointment from '@/models/Appointment';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import User from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const ROLES = ['admin', 'receptionist'];

/**
 * Gestão e receção veem qualquer paciente; o médico só os pacientes com quem
 * tem (ou teve) consulta — a mesma regra do resto da área clínica.
 */
async function requireTeam(patientId: string) {
  const session = await auth();
  if (session?.user?.role === 'doctor') {
    const { userId } = await requireDoctorWithPatient(patientId);
    return { id: userId };
  }
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !ROLES.includes(role)) {
    throw new Error('Sem permissões para consultar pacientes.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== role) {
    throw new Error(
      'Conta inativa ou permissões alteradas. Inicie sessão novamente.',
    );
  }
  return { id: session.user.id };
}

export type PatientAlertsResult = {
  patientName: string;
  alerts: PatientAlert[];
  /** Observação escrita pela equipa (editável por todos) */
  note: string;
};

export async function getPatientAlertsAction(
  patientId: string,
): Promise<PatientAlertsResult | { error: string }> {
  if (!OBJECT_ID.test(patientId)) return { error: 'Paciente inválido.' };
  try {
    await requireTeam(patientId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const since = new Date();
  since.setMonth(since.getMonth() - ALERT_ATTENDANCE_MONTHS);

  const [patient, invoices, unbilled, appts] = await Promise.all([
    Patient.findById(patientId)
      .select('name notes status bookingBlockedAt bookingBlockReason')
      .lean(),
    Invoice.find({ patientId, status: { $ne: 'voided' } })
      .select('totalCents paidCents')
      .lean(),
    Procedure.find({ patientId, status: 'completed', invoiceId: null })
      .select('priceCents')
      .lean(),
    Appointment.find({
      patientId,
      startAt: { $gte: since },
      status: { $in: ['no-show', 'cancelled', 'completed'] },
    })
      .select('status startAt cancelledAt cancelledBy rescheduledToId')
      .lean(),
  ]);
  if (!patient || patient.status === 'anonymized') {
    return { error: 'Paciente não encontrado.' };
  }

  const att = summarizeAttendance(
    appts.map(a => ({
      status: a.status as string,
      startAt: a.startAt as Date,
      cancelledAt: (a.cancelledAt as Date | null) ?? null,
      cancelledBy: (a.cancelledBy as string | null) ?? null,
      rescheduledToId: a.rescheduledToId,
    })),
  );
  const note = ((patient.notes as string | null) ?? '').trim();

  return {
    patientName: patient.name,
    note,
    alerts: buildPatientAlerts({
      blockReason: patient.bookingBlockedAt
        ? (patient.bookingBlockReason ?? '').trim() || 'sem motivo indicado'
        : null,
      note,
      unbilledCents: unbilled.reduce((a, p) => a + p.priceCents, 0),
      unbilledCount: unbilled.length,
      dueCents: invoices.reduce(
        (a, i) => a + (i.totalCents - (i.paidCents ?? i.totalCents)),
        0,
      ),
      noShows: att.noShows,
      lateCancels: att.lateCancels,
    }),
  };
}

export async function updatePatientAlertNoteAction(
  patientId: string,
  rawNote: string,
): Promise<{ success: true } | { error: string }> {
  if (!OBJECT_ID.test(patientId)) return { error: 'Paciente inválido.' };
  let user;
  try {
    user = await requireTeam(patientId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const note = typeof rawNote === 'string' ? rawNote.trim() : '';
  if (note.length > ALERT_NOTE_MAX) {
    return { error: `Observação demasiado longa (máx. ${ALERT_NOTE_MAX}).` };
  }

  const patient = await Patient.findById(patientId).select('notes status').lean();
  if (!patient || patient.status === 'anonymized') {
    return { error: 'Paciente não encontrado.' };
  }
  const next = note === '' ? null : note;
  if (((patient.notes as string | null) ?? null) === next) {
    return { success: true };
  }
  await Patient.updateOne({ _id: patientId }, { $set: { notes: next } });
  await logAudit({
    userId: user.id,
    action: 'update',
    entityType: 'Patient',
    entityId: patientId,
    patientId,
    summary: 'Observação importante do paciente atualizada (janela de avisos)',
    changedFields: ['notes'],
  });
  revalidatePath(`/admin/pacientes/${patientId}`);
  revalidatePath('/admin/agenda');
  return { success: true };
}
