// 📄 src/lib/rbac.ts
// =============================================================================
// CDC Manager — Guards de RBAC partilhados entre actions
// -----------------------------------------------------------------------------
// Vivem em src/lib (sem 'use server') para poderem ser importados por várias
// actions sem se tornarem, elas próprias, endpoints públicos.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * RBAC de dados (ficha): o médico só acede a pacientes COM QUEM TEM CONSULTAS.
 * Lança Error('Sem permissões.') / Error('Paciente não encontrado.') (sem
 * vazar a existência do paciente).
 */
export async function requireDoctorWithPatient(patientId: string) {
  const session = await auth();
  if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
    throw new Error('Sem permissões.');
  }
  if (!OBJECT_ID.test(patientId)) throw new Error('Paciente inválido.');
  await dbConnect();

  const hasRelation = await Appointment.exists({
    doctorId: session.user.doctorId,
    patientId,
  });
  if (!hasRelation) throw new Error('Paciente não encontrado.'); // não vazar

  return { userId: session.user.id, doctorId: session.user.doctorId };
}
