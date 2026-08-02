// 📄 src/lib/audit.ts
// =============================================================================
// CDC Manager — Helper de auditoria
// -----------------------------------------------------------------------------
// Ponto único de escrita no AuditLog. Fire-and-forget com catch: um log
// falhado NUNCA pode partir a operação principal (mas fica registado na
// consola do servidor para investigação).
//
// clinicId (opcional): eventos operacionais (marcações, faturas, stock)
// registam a clínica onde aconteceram; eventos globais (login, edição de
// paciente) omitem-no — ver AuditLog.ts.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import AuditLog, { type AuditAction } from '@/models/AuditLog';

export async function logAudit(params: {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  patientId?: string | null;
  clinicId?: string | null;
  summary?: string;
  changedFields?: string[];
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await dbConnect();
    await AuditLog.create({
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      patientId: params.patientId ?? null,
      clinicId: params.clinicId ?? null,
      summary: params.summary ?? null,
      changedFields: params.changedFields ?? [],
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (err) {
    console.error('[audit] falha ao registar:', err);
  }
}
