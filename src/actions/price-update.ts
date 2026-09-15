// 📄 src/actions/price-update.ts
// =============================================================================
// CDC Manager — Server Actions: Aumentos de tabela (Fase 4, E8)
// -----------------------------------------------------------------------------
// Dois passos, mesma validação: previewPriceUpdateAction devolve as linhas
// (antes → depois) sem gravar; applyPriceUpdateAction recalcula NO SERVIDOR
// (nunca confia nos valores do preview) e grava com bulkWrite, guardando o
// histórico de preço em cada ato e um AuditLog com o resumo.
// Só admin. Atos já registados NÃO mudam (snapshot no Procedure).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import mongoose from 'mongoose';
import TreatmentType from '@/models/TreatmentType';
import {
  priceUpdateSchema,
  type PriceUpdateInput,
} from '@/lib/validations/price-update';
import { applyPriceRule, describeRule } from '@/lib/price-update';

export interface PricePreviewRow {
  id: string;
  name: string;
  category: string | null;
  fromCents: number;
  toCents: number;
}
export type PricePreviewState =
  | { error: string }
  | {
      rows: PricePreviewRow[];
      ruleLabel: string;
      totalFrom: number;
      totalTo: number;
    }
  | undefined;
export type PriceApplyState =
  | { error: string }
  | { success: true; updated: number }
  | undefined;

function parse(formData: FormData) {
  return priceUpdateSchema.safeParse({
    scope: formData.get('scope'),
    category: formData.get('category') || null,
    lineIds: formData.get('lineIds'),
    mode: formData.get('mode'),
    value: formData.get('value'),
    rounding: formData.get('rounding') || 'cent',
    reason: formData.get('reason') || null,
  });
}

async function computeRows(data: PriceUpdateInput): Promise<PricePreviewRow[]> {
  const query: Record<string, unknown> = { active: true };
  if (data.scope === 'category') query.category = data.category;
  if (data.scope === 'lines') query._id = { $in: data.lineIds };
  const docs = await TreatmentType.find(query)
    .select('name category priceCents')
    .sort({ category: 1, name: 1 })
    .lean();
  const rule = {
    mode: data.mode,
    value: data.mode === 'amount' ? Math.round(data.value * 100) : data.value,
    rounding: data.rounding,
  } as const;
  return docs.map(d => ({
    id: String(d._id),
    name: d.name,
    category: d.category ?? null,
    fromCents: d.priceCents,
    toCents: applyPriceRule(d.priceCents, rule),
  }));
}

function ruleLabelOf(data: PriceUpdateInput): string {
  return describeRule({
    mode: data.mode,
    value: data.mode === 'amount' ? Math.round(data.value * 100) : data.value,
    rounding: data.rounding,
  });
}

export async function previewPriceUpdateAction(
  _prev: PricePreviewState,
  formData: FormData,
): Promise<PricePreviewState> {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return { error: 'Apenas a administração pode atualizar preços.' };
    }
    const parsed = parse(formData);
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    await dbConnect();
    const rows = await computeRows(parsed.data);
    return {
      rows,
      ruleLabel: ruleLabelOf(parsed.data),
      totalFrom: rows.reduce((s, r) => s + r.fromCents, 0),
      totalTo: rows.reduce((s, r) => s + r.toCents, 0),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function applyPriceUpdateAction(
  _prev: PriceApplyState,
  formData: FormData,
): Promise<PriceApplyState> {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return { error: 'Apenas a administração pode atualizar preços.' };
    }
    const parsed = parse(formData);
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    await dbConnect();
    const rows = (await computeRows(parsed.data)).filter(
      r => r.toCents !== r.fromCents,
    );
    if (rows.length === 0)
      return { error: 'Nenhum preço muda com esta regra.' };

    const now = new Date();
    const label = ruleLabelOf(parsed.data);
    await TreatmentType.bulkWrite(
      rows.map(r => ({
        updateOne: {
          // não pisa alterações concorrentes (o preço tem de ser o do preview)
          filter: {
            _id: new mongoose.Types.ObjectId(r.id),
            priceCents: r.fromCents,
          },
          update: {
            $set: { priceCents: r.toCents, source: 'clinic-confirmed' },
            $push: {
              priceHistory: {
                $each: [
                  {
                    at: now,
                    fromCents: r.fromCents,
                    toCents: r.toCents,
                    rule: label,
                    reason: parsed.data.reason,
                    userId: new mongoose.Types.ObjectId(session.user.id),
                  },
                ],
                $slice: -20,
              },
            },
          },
        },
      })) as unknown as Parameters<typeof TreatmentType.bulkWrite>[0],
    );

    const scopeLabel =
      parsed.data.scope === 'all'
        ? 'toda a tabela'
        : parsed.data.scope === 'category'
          ? `categoria ${parsed.data.category}`
          : `${rows.length} linha(s)`;
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'TreatmentType',
      summary: `Atualização de preços (${scopeLabel}): ${label} — ${rows.length} ato(s)${parsed.data.reason ? ` · ${parsed.data.reason}` : ''}`,
      changedFields: ['priceCents'],
    });

    revalidatePath('/admin/tratamentos');
    revalidatePath('/marcar');
    return { success: true, updated: rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
