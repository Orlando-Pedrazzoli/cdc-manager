// 📄 src/lib/commission-adjustments.ts
// =============================================================================
// CDC Manager — Estorno de comissão (Fase 1)
// -----------------------------------------------------------------------------
// Partilhado pela anulação de atos (actions/procedures.ts) e pela anulação de
// faturas (actions/billing.ts). Vive em src/lib e NÃO num ficheiro
// 'use server': recebe o snapshot do ato por parâmetro, logo, se fosse uma
// action exportada, qualquer pedido POST anónimo podia lançar estornos
// forjados a qualquer médico. Os chamadores validam a sessão antes.
// Idempotente pelo índice único em procedureId (E11000 = já lançado).
// =============================================================================

import type mongoose from 'mongoose';
import CommissionAdjustment from '@/models/CommissionAdjustment';

export async function createVoidAdjustment(params: {
  proc: {
    _id: mongoose.Types.ObjectId;
    clinicId: mongoose.Types.ObjectId;
    doctorId: mongoose.Types.ObjectId;
    patientId: mongoose.Types.ObjectId;
    nameSnapshot: string;
    categorySnapshot?: string | null;
    priceCents: number;
    costCents?: number | null;
    commissionBaseCents?: number | null;
    commissionCents: number;
    executedAt?: Date | null;
  };
  reason: 'invoice-void' | 'procedure-void';
  invoiceId: string | null;
  effectiveAt: Date;
  userId: string;
  note: string | null;
}): Promise<void> {
  const { proc } = params;
  const cost = proc.costCents ?? 0;
  const base = proc.commissionBaseCents ?? proc.priceCents;
  try {
    await CommissionAdjustment.create({
      clinicId: proc.clinicId,
      doctorId: proc.doctorId,
      patientId: proc.patientId,
      procedureId: proc._id,
      invoiceId: params.invoiceId,
      reason: params.reason,
      descriptionSnapshot: proc.nameSnapshot,
      categorySnapshot: proc.categorySnapshot ?? null,
      priceCents: -proc.priceCents,
      costCents: -cost,
      commissionBaseCents: -base,
      commissionCents: -proc.commissionCents,
      effectiveAt: params.effectiveAt,
      originalExecutedAt: proc.executedAt ?? null,
      note: params.note,
      createdByUserId: params.userId,
    });
  } catch (err) {
    const isDup =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: number }).code === 11000;
    if (!isDup) throw err;
  }
}
