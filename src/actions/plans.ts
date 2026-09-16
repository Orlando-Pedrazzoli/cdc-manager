// 📄 src/actions/plans.ts
// =============================================================================
// CDC Manager — Actions: planos de tratamento (área do médico)
// -----------------------------------------------------------------------------
// CICLO: draft → proposed → approved → in-progress → completed
//                     └──► declined
//
// PRINCÍPIOS:
// · PREÇOS congelados na CRIAÇÃO do plano (o orçamento é um compromisso —
//   a tabela pode mudar, o plano entregue ao paciente não)
// · APROVAR gera um Procedure 'planned' por item (com comissão provisória
//   resolvida nesse momento) e liga item↔procedure
// · EXECUTAR um item: procedure planned→completed, comissão RE-resolvida
//   e congelada na execução (regra do snapshot); o plano passa a
//   in-progress no 1º item e a completed no último
// · Validade default: 60 dias a partir da proposta
// · RBAC: mesmo padrão da ficha (médico só mexe em planos seus, de
//   pacientes com quem tem consultas)
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  resolveCommission,
  computeLineFinancials,
  discountCentsOf,
  type DiscountInput,
} from '@/lib/commissions';
import { spawnRecallForProcedure } from '@/lib/recalls';
import {
  createPlanSchema,
  planIdSchema,
  executePlanItemSchema,
} from '@/lib/validations/procedure';
import { requireDoctorWithPatient } from '@/lib/rbac';
import TreatmentPlan from '@/models/TreatmentPlan';
import TreatmentType from '@/models/TreatmentType';
import Procedure from '@/models/Procedure';
import Doctor from '@/models/Doctor';
import { getClinicById } from '@/models/Clinic';

export type PlanActionState = { error: string } | { success: true } | undefined;

const VALIDITY_DAYS = 60;

function fail(e: unknown): { error: string } {
  return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
}

async function requireOwnPlan(planId: string) {
  const session = await auth();
  if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
    throw new Error('Sem permissões.');
  }
  await dbConnect();
  const plan = await TreatmentPlan.findById(planId);
  if (!plan || String(plan.doctorId) !== session.user.doctorId) {
    throw new Error('Plano não encontrado.');
  }
  return { plan, userId: session.user.id, doctorId: session.user.doctorId };
}

// -----------------------------------------------------------------------------
// CRIAR (draft) — snapshots de nome+preço congelados já aqui
// -----------------------------------------------------------------------------
export async function createPlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  try {
    const parsed = createPlanSchema.safeParse({
      patientId: formData.get('patientId'),
      clinicId: formData.get('clinicId'),
      title: formData.get('title'),
      items: formData.get('items'),
      discountEuros: formData.get('discountEuros'),
      notes: formData.get('notes'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const { userId, doctorId } = await requireDoctorWithPatient(data.patientId);

    const treatments = await TreatmentType.find({
      _id: { $in: data.items.map(i => i.treatmentTypeId) },
    })
      .select('name priceCents')
      .lean();
    const catalog = new Map(treatments.map(t => [String(t._id), t]));

    // Fase 4C: PVP aplicado (editável) − desconto por item = valor ao paciente
    const items = data.items.map(i => {
      const cat = catalog.get(i.treatmentTypeId);
      const discount: DiscountInput =
        i.discountMode === 'percent'
          ? { mode: 'percent', value: i.discountPct as number }
          : i.discountMode === 'amount'
            ? { mode: 'amount', cents: i.discountEuros as number }
            : null;
      const discountCents = discountCentsOf(i.priceEuros, discount);
      return {
        treatmentTypeId: i.treatmentTypeId,
        nameSnapshot: cat?.name ?? '(ato removido)',
        catalogPriceCents: cat?.priceCents ?? null,
        listPriceCents: i.priceEuros,
        priceEdited: cat != null && cat.priceCents !== i.priceEuros,
        discountMode: i.discountMode,
        discountPct: i.discountMode === 'percent' ? i.discountPct : null,
        discountCents,
        priceCents: i.priceEuros - discountCents,
        note: i.note,
        toothNumbers: i.toothNumbers,
        phase: i.phase,
        procedureId: null,
      };
    });
    const totalCents = items.reduce((s, i) => s + i.priceCents, 0);
    const editedCount = items.filter(i => i.priceEdited).length;
    if (data.discountEuros > totalCents) {
      return { error: 'O desconto não pode exceder o total do plano.' };
    }

    const plan = await TreatmentPlan.create({
      clinicId: data.clinicId,
      patientId: data.patientId,
      doctorId,
      title: data.title,
      status: 'draft',
      items,
      totalCents,
      discountCents: data.discountEuros,
      notes: data.notes,
    });

    await logAudit({
      userId,
      action: 'create',
      entityType: 'TreatmentPlan',
      entityId: String(plan._id),
      patientId: data.patientId,
      clinicId: data.clinicId,
      summary: `Plano criado: ${data.title} (${items.length} ato${items.length === 1 ? '' : 's'}, ${(totalCents / 100).toFixed(2)} €${editedCount ? `, ${editedCount} preço(s) editado(s) pelo médico` : ''})`,
    });

    revalidatePath(`/doutor/pacientes/${data.patientId}/plano`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// PROPOR (draft → proposed) — validade 60 dias
// -----------------------------------------------------------------------------
export async function proposePlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  try {
    const parsed = planIdSchema.safeParse({ planId: formData.get('planId') });
    if (!parsed.success) return { error: 'Plano inválido.' };
    const { plan, userId } = await requireOwnPlan(parsed.data.planId);

    if (plan.status !== 'draft') {
      return { error: 'Só um rascunho pode ser proposto.' };
    }
    const now = new Date();
    plan.set('status', 'proposed');
    plan.set('proposedAt', now);
    plan.set(
      'validUntil',
      new Date(now.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000),
    );
    await plan.save();

    await logAudit({
      userId,
      action: 'update',
      entityType: 'TreatmentPlan',
      entityId: String(plan._id),
      patientId: String(plan.patientId),
      clinicId: String(plan.clinicId),
      summary: `Plano proposto: ${plan.title}`,
    });

    revalidatePath(`/doutor/pacientes/${String(plan.patientId)}/plano`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// APROVAR (presencial) — gera Procedures 'planned' e liga aos itens
// -----------------------------------------------------------------------------
export async function approvePlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  try {
    const parsed = planIdSchema.safeParse({ planId: formData.get('planId') });
    if (!parsed.success) return { error: 'Plano inválido.' };
    const { plan, userId, doctorId } = await requireOwnPlan(parsed.data.planId);

    if (plan.status !== 'proposed') {
      return { error: 'Só um plano proposto pode ser aprovado.' };
    }

    const [doctor, clinic, itemTreatments] = await Promise.all([
      Doctor.findById(doctorId)
        .select(
          'commissionRate commissionOverrides commissionCategoryOverrides',
        )
        .lean(),
      getClinicById(String(plan.clinicId)),
      TreatmentType.find({
        _id: { $in: plan.items.map(i => i.treatmentTypeId) },
      })
        .select('commissionRate category costCents')
        .lean(),
    ]);
    if (!doctor || !clinic)
      return { error: 'Dados de comissão indisponíveis.' };
    const treatmentById = new Map(itemTreatments.map(t => [String(t._id), t]));

    // Um Procedure 'planned' por item, com financeiro PROVISÓRIO (o
    // definitivo é congelado na execução — princípio do snapshot).
    // Itens de plano ainda não têm desconto por linha (Fase 4); o custo
    // direto é o do catálogo.
    for (const item of plan.items) {
      const t = treatmentById.get(String(item.treatmentTypeId));
      const commission = resolveCommission({
        overrides: doctor.commissionOverrides,
        categoryOverrides: doctor.commissionCategoryOverrides,
        doctorRate: doctor.commissionRate,
        treatmentRate: t?.commissionRate ?? null,
        clinicDefault: clinic.defaultDoctorCommission,
        treatmentTypeId: String(item.treatmentTypeId),
        category: t?.category ?? null,
      });
      // Fase 4C: o item já traz PVP aplicado + desconto → o Procedure
      // 'planned' nasce com o mesmo financeiro (a execução re-resolve)
      const fin = computeLineFinancials({
        listPriceCents: item.listPriceCents ?? item.priceCents,
        discount:
          item.discountMode === 'percent' && item.discountPct != null
            ? { mode: 'percent', value: item.discountPct }
            : item.discountMode === 'amount'
              ? { mode: 'amount', cents: item.discountCents ?? 0 }
              : null,
        costCents: t?.costCents ?? 0,
        commission,
      });
      const proc = await Procedure.create({
        clinicId: plan.clinicId,
        patientId: plan.patientId,
        doctorId,
        treatmentTypeId: item.treatmentTypeId,
        appointmentId: null,
        treatmentPlanId: plan._id,
        status: 'planned',
        nameSnapshot: item.nameSnapshot,
        categorySnapshot: t?.category ?? null,
        ...fin,
        toothNumbers: item.toothNumbers,
        notes: null,
        executedAt: null,
      });
      item.procedureId = proc._id;
    }

    plan.set('status', 'approved');
    plan.set('approvedAt', new Date());
    plan.set('approvedVia', 'in-person');
    plan.markModified('items');
    await plan.save();

    await logAudit({
      userId,
      action: 'update',
      entityType: 'TreatmentPlan',
      entityId: String(plan._id),
      patientId: String(plan.patientId),
      clinicId: String(plan.clinicId),
      summary: `Plano aprovado (presencial): ${plan.title} — ${plan.items.length} ato${plan.items.length === 1 ? '' : 's'} planeado${plan.items.length === 1 ? '' : 's'}`,
    });

    revalidatePath(`/doutor/pacientes/${String(plan.patientId)}/plano`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// RECUSAR (proposed → declined)
// -----------------------------------------------------------------------------
export async function declinePlanAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  try {
    const parsed = planIdSchema.safeParse({ planId: formData.get('planId') });
    if (!parsed.success) return { error: 'Plano inválido.' };
    const { plan, userId } = await requireOwnPlan(parsed.data.planId);

    if (plan.status !== 'proposed') {
      return { error: 'Só um plano proposto pode ser recusado.' };
    }
    plan.set('status', 'declined');
    plan.set('declinedAt', new Date());
    await plan.save();

    await logAudit({
      userId,
      action: 'update',
      entityType: 'TreatmentPlan',
      entityId: String(plan._id),
      patientId: String(plan.patientId),
      clinicId: String(plan.clinicId),
      summary: `Plano recusado: ${plan.title}`,
    });

    revalidatePath(`/doutor/pacientes/${String(plan.patientId)}/plano`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// EXECUTAR ITEM — planned → completed; comissão congelada AGORA;
// plano approved → in-progress (1º) → completed (último)
// -----------------------------------------------------------------------------
export async function executePlanItemAction(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  try {
    const parsed = executePlanItemSchema.safeParse({
      procedureId: formData.get('procedureId'),
    });
    if (!parsed.success) return { error: 'Ato inválido.' };

    const session = await auth();
    if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
      return { error: 'Sem permissões.' };
    }
    const doctorId = session.user.doctorId;
    await dbConnect();

    const proc = await Procedure.findById(parsed.data.procedureId);
    if (!proc || String(proc.doctorId) !== doctorId) {
      return { error: 'Ato não encontrado.' };
    }
    if (proc.status !== 'planned') {
      return { error: 'Este ato já não está por executar.' };
    }
    if (!proc.treatmentPlanId) {
      return { error: 'Ato sem plano associado.' };
    }
    const plan = await TreatmentPlan.findById(proc.treatmentPlanId);
    if (!plan || !['approved', 'in-progress'].includes(plan.status)) {
      return { error: 'O plano não está em execução.' };
    }

    // Financeiro DEFINITIVO resolvido e congelado na execução. O PVP e o
    // desconto do item (se existir) mantêm-se; o custo direto é o do
    // catálogo NESTE momento (o material é comprado quando se executa).
    const [doctor, clinic, procTreatment] = await Promise.all([
      Doctor.findById(doctorId)
        .select(
          'commissionRate commissionOverrides commissionCategoryOverrides',
        )
        .lean(),
      getClinicById(String(proc.clinicId)),
      TreatmentType.findById(proc.treatmentTypeId)
        .select('commissionRate category costCents')
        .lean(),
    ]);
    if (!doctor || !clinic)
      return { error: 'Dados de comissão indisponíveis.' };
    const commission = resolveCommission({
      overrides: doctor.commissionOverrides,
      categoryOverrides: doctor.commissionCategoryOverrides,
      doctorRate: doctor.commissionRate,
      treatmentRate: procTreatment?.commissionRate ?? null,
      clinicDefault: clinic.defaultDoctorCommission,
      treatmentTypeId: String(proc.treatmentTypeId),
      category: procTreatment?.category ?? proc.categorySnapshot ?? null,
    });
    const listPrice = proc.listPriceCents ?? proc.priceCents;
    const fin = computeLineFinancials({
      listPriceCents: listPrice,
      discount:
        proc.discountMode === 'percent' && proc.discountPct != null
          ? { mode: 'percent', value: proc.discountPct }
          : proc.discountMode === 'amount'
            ? { mode: 'amount', cents: proc.discountCents ?? 0 }
            : null,
      costCents: procTreatment?.costCents ?? proc.costCents ?? 0,
      commission,
    });

    proc.set('status', 'completed');
    proc.set('executedAt', new Date());
    proc.set(
      'categorySnapshot',
      procTreatment?.category ?? proc.categorySnapshot ?? null,
    );
    proc.set(fin);
    await proc.save();

    // Estado do plano: in-progress no 1º; completed quando não restar planned
    const remaining = await Procedure.countDocuments({
      treatmentPlanId: plan._id,
      status: 'planned',
    });
    if (remaining === 0) {
      plan.set('status', 'completed');
      plan.set('completedAt', new Date());
    } else if (plan.status === 'approved') {
      plan.set('status', 'in-progress');
    }
    await plan.save();

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Procedure',
      entityId: String(proc._id),
      patientId: String(proc.patientId),
      clinicId: String(proc.clinicId),
      summary: `Ato do plano executado: ${proc.nameSnapshot} (${(proc.priceCents / 100).toFixed(2)} €)`,
    });

    // Recall automático — mesmo contrato do registo direto na consulta:
    // best-effort, clinicId = clínica do ato do plano
    await spawnRecallForProcedure({
      procedureId: String(proc._id),
      clinicId: String(proc.clinicId),
      patientId: String(proc.patientId),
      doctorId,
      treatmentTypeId: String(proc.treatmentTypeId),
      executedAt: proc.executedAt ?? new Date(),
    });

    revalidatePath(`/doutor/pacientes/${String(proc.patientId)}/plano`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
