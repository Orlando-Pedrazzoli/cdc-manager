// 📄 src/actions/treatment-notes.ts
// =============================================================================
// CDC Manager — Server Actions: notas do tratamento (ponto 32, 27/11/2026)
//   · addTreatmentNoteAction     — gestão, receção e médicos
//   · archiveTreatmentNoteAction — quem pode ver o paciente pode arquivar
// Gestão e receção veem qualquer paciente; o médico só os pacientes com quem
// tem (ou teve) consulta — a regra do resto da área clínica. Tudo fica no
// registo de auditoria.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { requireDoctorWithPatient } from '@/lib/rbac';
import { cleanTreatmentNote } from '@/lib/treatment-notes';
import Patient from '@/models/Patient';
import TreatmentNote from '@/models/TreatmentNote';
import User from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export type TreatmentNoteState = { success: true } | { error: string };

async function requireTeam(patientId: string) {
  const session = await auth();
  const role = session?.user?.role;
  if (role === 'doctor') {
    const { userId } = await requireDoctorWithPatient(patientId);
    const user = await User.findById(userId).select('name').lean();
    return { id: userId, role, name: user?.name ?? null };
  }
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist'))
    throw new Error('Sem permissões.');
  await dbConnect();
  const user = await User.findById(session.user.id)
    .select('role status name')
    .lean();
  if (!user || user.status !== 'active' || user.role !== role)
    throw new Error(
      'Conta inativa ou permissões alteradas. Inicie sessão novamente.',
    );
  return { id: session.user.id, role, name: user.name ?? null };
}

function refresh(patientId: string) {
  revalidatePath(`/admin/pacientes/${patientId}/odontograma`);
  revalidatePath(`/doutor/pacientes/${patientId}/odontograma`);
}

export async function addTreatmentNoteAction(input: {
  patientId: string;
  text: string;
}): Promise<TreatmentNoteState> {
  try {
    if (!OBJECT_ID.test(input.patientId)) return { error: 'Paciente inválido.' };
    const clean = cleanTreatmentNote(input.text);
    if ('error' in clean) return { error: clean.error };
    const who = await requireTeam(input.patientId);
    const patient = await Patient.findById(input.patientId)
      .select('status')
      .lean();
    if (!patient || patient.status === 'anonymized')
      return { error: 'Paciente não encontrado.' };

    const note = await TreatmentNote.create({
      patientId: input.patientId,
      text: clean.text,
      authorUserId: who.id,
      authorName: who.name,
      authorRole: who.role,
    });
    await logAudit({
      userId: who.id,
      action: 'create',
      entityType: 'TreatmentNote',
      entityId: String(note._id),
      patientId: input.patientId,
      summary: 'Nota do tratamento registada (odontograma)',
    });
    refresh(input.patientId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function archiveTreatmentNoteAction(input: {
  noteId: string;
}): Promise<TreatmentNoteState> {
  try {
    if (!OBJECT_ID.test(input.noteId)) return { error: 'Nota inválida.' };
    await dbConnect();
    const note = await TreatmentNote.findById(input.noteId);
    if (!note) return { error: 'Nota não encontrada.' };
    const patientId = String(note.patientId);
    const who = await requireTeam(patientId);
    if (note.archivedAt) return { success: true }; // já estava arquivada

    note.set('archivedAt', new Date());
    note.set('archivedByUserId', who.id);
    note.set('archivedByName', who.name);
    await note.save();
    await logAudit({
      userId: who.id,
      action: 'update',
      entityType: 'TreatmentNote',
      entityId: String(note._id),
      patientId,
      summary: 'Nota do tratamento arquivada (odontograma)',
    });
    refresh(patientId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
