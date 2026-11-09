// 📄 src/lib/audit.ts
// =============================================================================
// CDC Manager — Helper de auditoria
// -----------------------------------------------------------------------------
// logAudit: best-effort para eventos operacionais não críticos.
// logAuditRequired: confirmação explícita para operações que dependem de uma
// trilha de auditoria, como a emissão de URLs para documentos clínicos.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import AuditLog, { type AuditAction } from '@/models/AuditLog';

export type AuditParams = {
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
};

async function writeAudit(params: AuditParams): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error('[audit] falha ao registar:', err);
    return false;
  }
}

/** Registo não bloqueante para eventos operacionais comuns. */
export async function logAudit(params: AuditParams): Promise<void> {
  await writeAudit(params);
}

/**
 * Registo obrigatório: o chamador só deve concluir a operação se retornar true.
 * Usar em ações nas quais a ausência de trilha de auditoria é inaceitável.
 */
export async function logAuditRequired(params: AuditParams): Promise<boolean> {
  return writeAudit(params);
}
