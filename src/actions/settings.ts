// 📄 src/actions/settings.ts
// =============================================================================
// CDC Manager — Actions: Configurações (admin-only)
// -----------------------------------------------------------------------------
// CATÁLOGO DE ATOS:
//   · createTreatmentTypeAction — slug gerado do nome (imutável; colisão
//     resolve com sufixo -2, -3…)
//   · updateTreatmentTypeAction — edita tudo menos o slug; a flag
//     "confirmado pela clínica" grava source (benchmark → clinic-confirmed)
//   · toggleTreatmentActiveAction — soft on/off (never delete)
//
// CLÍNICAS:
//   · updateClinicAction — identidade/fiscal/políticas online/comissão default
//   · updateClinicHoursAction — REGRA DE OURO: gravar horários NUNCA toca
//     marcações existentes (mesma regra dos horários dos profissionais).
//     O motor de disponibilidade aplica os novos horários daí em diante;
//     esta action apenas AVISA quantas marcações futuras ficam fora do novo
//     horário (leitura pura) — remarcar é decisão humana, caso a caso.
//
// RBAC: admin apenas (a receção não mexe em preços nem horários de clínica).
// Auditoria em todas as escritas (enum fechado: create/update/delete).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  createTreatmentTypeSchema,
  updateTreatmentTypeSchema,
  toggleTreatmentActiveSchema,
  updateClinicSchema,
  updateClinicHoursSchema,
  durationSourceFromFlag,
} from '@/lib/validations/settings';
import {
  utcToLisbonParts,
  fitsWithinRanges,
  hhmmToMin,
  type MinRange,
} from '@/lib/availability';
import TreatmentType from '@/models/TreatmentType';
import Product from '@/models/Product';
import Clinic from '@/models/Clinic';
import Appointment, { BLOCKING_STATUS } from '@/models/Appointment';

export type SettingsActionState =
  | { error: string }
  | {
      success: true;
      /** Só em updateClinicHoursAction: marcações futuras fora do novo horário */
      conflicts?: number;
      /** Amostras 'dd/mm HH:mm' das primeiras marcações em conflito */
      conflictSamples?: string[];
    }
  | undefined;

// -----------------------------------------------------------------------------
// Helpers locais (não exportados — ficheiro 'use server' só exporta async)
// -----------------------------------------------------------------------------

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') return null;
  return session.user.id;
}

/** Nome → slug estável: sem acentos, minúsculas, hífens (a-z0-9-) */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Dados inválidos.';
}

// -----------------------------------------------------------------------------
// 1. CATÁLOGO — criar ato
// -----------------------------------------------------------------------------

export async function createTreatmentTypeAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const parsed = createTreatmentTypeSchema.safeParse({
      name: formData.get('name'),
      specialty: formData.get('specialty'),
      category: formData.get('category'),
      entityCode: formData.get('entityCode'),
      durationMin: formData.get('durationMin'),
      bufferMin: formData.get('bufferMin'),
      // O form fala em euros; o schema converte para cêntimos inteiros
      priceCents: formData.get('priceEuros'),
      costCents: formData.get('costEuros'),
      bookableOnline: formData.get('bookableOnline'),
      requiresEvaluation: formData.get('requiresEvaluation'),
      controlsTooth: formData.get('controlsTooth'),
      requiresRxConsent: formData.get('requiresRxConsent'),
      recallIntervalMonths: formData.get('recallIntervalMonths'),
      notes: formData.get('notes'),
      clinicConfirmed: formData.get('clinicConfirmed'),
      bom: formData.get('bom'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;

    const adminId = await requireAdmin();
    if (!adminId) return { error: 'Sem permissões.' };
    await dbConnect();

    const base = slugify(data.name);
    if (!base) return { error: 'Nome inválido para gerar identificador.' };

    // Slug único: tenta base, base-2, base-3… (colisão E11000 no índice unique)
    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        // Todos os produtos da BOM têm de existir e estar ativos
        if (data.bom.length > 0) {
          const found = await Product.countDocuments({
            _id: { $in: data.bom.map(b => b.productId) },
            active: true,
          });
          if (found !== data.bom.length) {
            return { error: 'A lista de materiais inclui produtos inválidos.' };
          }
        }

        created = await TreatmentType.create({
          slug,
          name: data.name,
          specialty: data.specialty,
          category: data.category,
          entityCode: data.entityCode,
          durationMin: data.durationMin,
          bufferMin: data.bufferMin,
          priceCents: data.priceCents,
          costCents: data.costCents,
          bookableOnline: data.bookableOnline,
          requiresEvaluation: data.requiresEvaluation,
          controlsTooth: data.controlsTooth,
          requiresRxConsent: data.requiresRxConsent,
          bom: data.bom,
          recallIntervalMonths: data.recallIntervalMonths,
          notes: data.notes,
          source: durationSourceFromFlag(data.clinicConfirmed),
          active: true,
        });
      } catch (err) {
        const isDup =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 11000;
        if (!isDup) throw err;
      }
    }
    if (!created) {
      return { error: 'Já existem vários atos com este nome — renomeie.' };
    }

    await logAudit({
      userId: adminId,
      action: 'create',
      entityType: 'TreatmentType',
      entityId: String(created._id),
      summary: `Ato criado: ${data.name} (${(data.priceCents / 100).toFixed(2)} €, ${data.durationMin}+${data.bufferMin} min)`,
    });

    revalidatePath('/admin/tratamentos');
    revalidatePath('/marcar');
    return { success: true };
  } catch (err) {
    console.error('[settings] createTreatmentType:', err);
    return { error: 'Erro inesperado ao criar o ato.' };
  }
}

// -----------------------------------------------------------------------------
// 1b. CATÁLOGO — editar ato (slug intocável)
// -----------------------------------------------------------------------------

export async function updateTreatmentTypeAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const parsed = updateTreatmentTypeSchema.safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      specialty: formData.get('specialty'),
      category: formData.get('category'),
      entityCode: formData.get('entityCode'),
      durationMin: formData.get('durationMin'),
      bufferMin: formData.get('bufferMin'),
      priceCents: formData.get('priceEuros'),
      costCents: formData.get('costEuros'),
      bookableOnline: formData.get('bookableOnline'),
      requiresEvaluation: formData.get('requiresEvaluation'),
      controlsTooth: formData.get('controlsTooth'),
      requiresRxConsent: formData.get('requiresRxConsent'),
      recallIntervalMonths: formData.get('recallIntervalMonths'),
      notes: formData.get('notes'),
      clinicConfirmed: formData.get('clinicConfirmed'),
      bom: formData.get('bom'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const data = parsed.data;

    const adminId = await requireAdmin();
    if (!adminId) return { error: 'Sem permissões.' };
    await dbConnect();

    const doc = await TreatmentType.findById(data.id);
    if (!doc) return { error: 'Ato não encontrado.' };

    // Diff só para o audit (snapshots de Procedure NUNCA são afetados por
    // mudanças de preço — regra dos snapshots imutáveis)
    const changedFields: string[] = [];
    // source: confirmado vence sempre; sem confirmação, um ato 'imported'
    // MANTÉM a proveniência (banner amarelo até o Victor validar) — só os
    // restantes voltam a 'benchmark'
    const nextSource = data.clinicConfirmed
      ? ('clinic-confirmed' as const)
      : doc.source === 'imported'
        ? ('imported' as const)
        : ('benchmark' as const);
    const next = {
      name: data.name,
      specialty: data.specialty,
      category: data.category,
      entityCode: data.entityCode,
      durationMin: data.durationMin,
      bufferMin: data.bufferMin,
      priceCents: data.priceCents,
      costCents: data.costCents,
      bookableOnline: data.bookableOnline,
      requiresEvaluation: data.requiresEvaluation,
      controlsTooth: data.controlsTooth,
      requiresRxConsent: data.requiresRxConsent,
      recallIntervalMonths: data.recallIntervalMonths,
      notes: data.notes,
      source: nextSource,
    } as const;
    for (const [key, value] of Object.entries(next)) {
      if (doc.get(key) !== value) changedFields.push(key);
    }
    // BOM à parte (array — comparação por conteúdo, não por referência)
    const prevBom = (doc.bom ?? []).map(
      (b: { productId: unknown; quantity: number }) =>
        `${String(b.productId)}:${b.quantity}`,
    );
    const nextBom = data.bom.map(b => `${b.productId}:${b.quantity}`);
    if (
      prevBom.length !== nextBom.length ||
      prevBom.some((v: string, i: number) => v !== nextBom[i])
    ) {
      // Todos os produtos da BOM têm de existir e estar ativos
      if (data.bom.length > 0) {
        const found = await Product.countDocuments({
          _id: { $in: data.bom.map(b => b.productId) },
          active: true,
        });
        if (found !== data.bom.length) {
          return { error: 'A lista de materiais inclui produtos inválidos.' };
        }
      }
      doc.set('bom', data.bom);
      changedFields.push('bom');
    }
    doc.set(next);
    await doc.save();

    await logAudit({
      userId: adminId,
      action: 'update',
      entityType: 'TreatmentType',
      entityId: String(doc._id),
      summary: `Ato atualizado: ${data.name}`,
      changedFields,
    });

    revalidatePath('/admin/tratamentos');
    revalidatePath('/marcar');
    return { success: true };
  } catch (err) {
    console.error('[settings] updateTreatmentType:', err);
    return { error: 'Erro inesperado ao atualizar o ato.' };
  }
}

// -----------------------------------------------------------------------------
// 1c. CATÁLOGO — ativar/desativar (soft, never delete)
// -----------------------------------------------------------------------------

export async function toggleTreatmentActiveAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const parsed = toggleTreatmentActiveSchema.safeParse({
      id: formData.get('id'),
      active: formData.get('active'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { id, active } = parsed.data;

    const adminId = await requireAdmin();
    if (!adminId) return { error: 'Sem permissões.' };
    await dbConnect();

    const doc = await TreatmentType.findByIdAndUpdate(
      id,
      { active },
      { returnDocument: 'after' },
    );
    if (!doc) return { error: 'Ato não encontrado.' };

    await logAudit({
      userId: adminId,
      // Enum fechado: desativação regista-se como 'delete' (soft), reativação 'update'
      action: active ? 'update' : 'delete',
      entityType: 'TreatmentType',
      entityId: String(doc._id),
      summary: `Ato ${active ? 'reativado' : 'desativado'}: ${doc.name}`,
      changedFields: ['active'],
    });

    revalidatePath('/admin/tratamentos');
    revalidatePath('/marcar');
    return { success: true };
  } catch (err) {
    console.error('[settings] toggleTreatmentActive:', err);
    return { error: 'Erro inesperado ao alterar o estado do ato.' };
  }
}

// -----------------------------------------------------------------------------
// 2. CLÍNICA — identidade, fiscal e políticas de marcação online
// -----------------------------------------------------------------------------

export async function updateClinicAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const parsed = updateClinicSchema.safeParse({
      clinicId: formData.get('clinicId'),
      name: formData.get('name'),
      legalName: formData.get('legalName'),
      nipc: formData.get('nipc'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      maxConcurrentAppointments: formData.get('maxConcurrentAppointments'),
      onlineMinNoticeHours: formData.get('onlineMinNoticeHours'),
      onlineMaxAdvanceDays: formData.get('onlineMaxAdvanceDays'),
      cancellationMinNoticeHours: formData.get('cancellationMinNoticeHours'),
      bookableOnline: formData.get('bookableOnline'),
      // Form em percentagem (40) → schema converte para fração (0.40)
      defaultDoctorCommission: formData.get('defaultDoctorCommission'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { clinicId, ...fields } = parsed.data;

    const adminId = await requireAdmin();
    if (!adminId) return { error: 'Sem permissões.' };
    await dbConnect();

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) return { error: 'Clínica não encontrada.' };

    const changedFields: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (clinic.get(key) !== value) changedFields.push(key);
    }
    clinic.set(fields);
    await clinic.save();

    await logAudit({
      userId: adminId,
      action: 'update',
      entityType: 'Clinic',
      entityId: String(clinic._id),
      clinicId: String(clinic._id),
      summary: `Dados da clínica atualizados: ${fields.name}`,
      changedFields,
    });

    // Comissão default só afeta EXECUÇÕES futuras (snapshots congelados
    // continuam intocáveis — nota já visível nos Relatórios)
    revalidatePath('/admin/configuracoes');
    revalidatePath('/admin/dashboard');
    revalidatePath('/marcar');
    return { success: true };
  } catch (err) {
    console.error('[settings] updateClinic:', err);
    return { error: 'Erro inesperado ao atualizar a clínica.' };
  }
}

// -----------------------------------------------------------------------------
// 2b. CLÍNICA — horários de funcionamento (REGRA DE OURO: nunca toca marcações)
// -----------------------------------------------------------------------------

export async function updateClinicHoursAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const parsed = updateClinicHoursSchema.safeParse({
      clinicId: formData.get('clinicId'),
      openingHours: formData.get('openingHours'),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { clinicId, openingHours } = parsed.data;

    const adminId = await requireAdmin();
    if (!adminId) return { error: 'Sem permissões.' };
    await dbConnect();

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) return { error: 'Clínica não encontrada.' };

    clinic.set({ openingHours });
    await clinic.save();

    // --- Aviso de conflitos (LEITURA pura — nada é alterado nem cancelado) --
    // Marcações futuras bloqueantes que ficam fora do NOVO horário. Cap de
    // 500 mantém a resposta rápida; acima disso o número já é alarme q.b.
    const future = await Appointment.find({
      clinicId,
      status: { $in: BLOCKING_STATUS },
      startAt: { $gte: new Date() },
    })
      .select('startAt endAt')
      .sort({ startAt: 1 })
      .limit(500)
      .lean();

    const rangesByWeekday = new Map<number, MinRange[]>(
      openingHours.map(d => [
        d.weekday,
        d.ranges.map(r => ({
          start: hhmmToMin(r.start),
          end: hhmmToMin(r.end),
        })),
      ]),
    );

    let conflicts = 0;
    const conflictSamples: string[] = [];
    for (const appt of future) {
      const start = utcToLisbonParts(appt.startAt as Date);
      const end = utcToLisbonParts(appt.endAt as Date);
      const ranges = rangesByWeekday.get(start.weekday) ?? [];
      // Cruza a meia-noite (dias civis diferentes) → nunca cabe num horário
      // diário; senão, tem de caber inteira num dos intervalos do dia
      const fits =
        start.dateStr === end.dateStr &&
        fitsWithinRanges(start.min, end.min, ranges);
      if (!fits) {
        conflicts++;
        if (conflictSamples.length < 5) {
          const [, mo, d] = start.dateStr.split('-');
          const h = String(Math.floor(start.min / 60)).padStart(2, '0');
          const m = String(start.min % 60).padStart(2, '0');
          conflictSamples.push(`${d}/${mo} ${h}:${m}`);
        }
      }
    }

    await logAudit({
      userId: adminId,
      action: 'update',
      entityType: 'Clinic',
      entityId: String(clinic._id),
      clinicId: String(clinic._id),
      summary: `Horário de funcionamento atualizado: ${clinic.name}${
        conflicts
          ? ` (${conflicts} marcações futuras fora do novo horário)`
          : ''
      }`,
      changedFields: ['openingHours'],
    });

    revalidatePath('/admin/configuracoes');
    revalidatePath('/admin/agenda');
    revalidatePath('/marcar');
    return { success: true, conflicts, conflictSamples };
  } catch (err) {
    console.error('[settings] updateClinicHours:', err);
    return { error: 'Erro inesperado ao atualizar o horário.' };
  }
}
