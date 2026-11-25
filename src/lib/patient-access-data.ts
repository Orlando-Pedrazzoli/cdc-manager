// 📄 src/lib/patient-access-data.ts
// =============================================================================
// CDC Manager — Acesso do médico às fichas: registo e leitura (9.ª ronda/08)
// Só para Server Components e actions. Regras em lib/patient-access.ts.
// =============================================================================

import mongoose from 'mongoose';
import AuditLog from '@/models/AuditLog';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { logAudit } from '@/lib/audit';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import {
  ACCESS_ENTITY,
  ACCESS_OUTSIDE_AGENDA,
  PATIENT_ACCESS_DEDUPE_MIN,
  patientAccessAlerts,
  type OutsideAgendaAccess,
} from '@/lib/patient-access';
import type { ManagementAlert } from '@/lib/management-alerts';

/**
 * O médico tem (ou teve) consultas com este paciente? É a "agenda dele":
 * com relação edita como sempre; sem relação abre só para leitura.
 */
export async function doctorHasRelation(
  doctorId: string,
  patientId: string,
): Promise<boolean> {
  return !!(await Appointment.exists({ doctorId, patientId }));
}

/**
 * Regista "o médico abriu esta ficha" — TODAS as fichas, com ou sem relação.
 * A mesma ficha reaberta pelo mesmo utilizador em menos de 30 minutos não
 * repete a linha (passar de separador em separador não enche o registo).
 * Nunca lança: a ficha abre mesmo que o registo falhe (o logAudit já regista
 * o erro na consola).
 */
export async function logDoctorPatientView(params: {
  userId: string;
  patientId: string;
  hasRelation: boolean;
  /** Onde: "ficha", "odontograma", "planos", "consulta" */
  where: string;
}): Promise<void> {
  try {
    const since = new Date(Date.now() - PATIENT_ACCESS_DEDUPE_MIN * 60_000);
    const recent = await AuditLog.exists({
      userId: params.userId,
      patientId: params.patientId,
      action: 'view',
      entityType: ACCESS_ENTITY,
      createdAt: { $gte: since },
    });
    if (recent) return;
    await logAudit({
      userId: params.userId,
      action: 'view',
      entityType: ACCESS_ENTITY,
      patientId: params.patientId,
      summary: params.hasRelation
        ? `Ficha aberta pelo médico (${params.where})`
        : `Ficha aberta pelo médico sem consultas com o paciente (${params.where}; só leitura)`,
      changedFields: params.hasRelation ? [] : [ACCESS_OUTSIDE_AGENDA],
    });
  } catch (err) {
    console.error('[acessos] registo de abertura de ficha falhou', err);
  }
}

/** Por médico: fichas diferentes abertas ESTE MÊS fora da agenda dele */
export async function loadOutsideAgendaAccess(
  now: Date = new Date(),
): Promise<OutsideAgendaAccess[]> {
  // Mês civil de Lisboa em curso (Victor, 25/11, A9)
  const monthStart = `${todayLisbon().slice(0, 7)}-01`;
  const grouped = await AuditLog.aggregate<{
    _id: mongoose.Types.ObjectId;
    patients: mongoose.Types.ObjectId[];
  }>([
    {
      $match: {
        action: 'view',
        entityType: ACCESS_ENTITY,
        changedFields: ACCESS_OUTSIDE_AGENDA,
        createdAt: { $gte: lisbonToUtc(monthStart, 0), $lte: now },
      },
    },
    { $group: { _id: '$userId', patients: { $addToSet: '$patientId' } } },
  ]);
  if (grouped.length === 0) return [];
  const users = await User.find({ _id: { $in: grouped.map(g => g._id) } })
    .select('name doctorId')
    .lean();
  const userById = new Map(users.map(u => [String(u._id), u]));
  const doctors = await Doctor.find({
    _id: { $in: users.flatMap(u => (u.doctorId ? [String(u.doctorId)] : [])) },
  })
    .select('name')
    .lean();
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));
  return grouped.map(g => {
    const u = userById.get(String(g._id));
    const doctorId = u?.doctorId ? String(u.doctorId) : null;
    return {
      doctorId,
      doctorName:
        (doctorId ? doctorName.get(doctorId) : null) ?? u?.name ?? 'Utilizador removido',
      patients: g.patients.length,
    };
  });
}

/** Avisos para a gestão (painel e Prazos e avisos) */
export async function getPatientAccessAlerts(
  now: Date = new Date(),
): Promise<ManagementAlert[]> {
  return patientAccessAlerts(await loadOutsideAgendaAccess(now), todayLisbon());
}
