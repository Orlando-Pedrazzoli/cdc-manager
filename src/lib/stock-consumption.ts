// 📄 src/lib/stock-consumption.ts
// =============================================================================
// CDC Manager — Baixa automática de stock por BOM (consumo e estorno)
// -----------------------------------------------------------------------------
// DESENHO (decisão de arquitetura, ago/2026):
//   · A baixa acontece ao CONCLUIR A CONSULTA, não na cobrança: os materiais
//     consomem-se quando o ato é executado; a cobrança pode ser mais tarde,
//     falhar, ou (conta-corrente, Bloco A.1) ser parcial. O stock físico já
//     saiu da gaveta independentemente do pagamento.
//   · Armazém alvo: o DEFAULT (isDefault) da clínica da consulta — é para
//     isso que o campo existe (ver comentário no model Warehouse).
//   · Stock insuficiente NUNCA bloqueia o fluxo clínico: a realidade física
//     vence o registo. O consumo automático pode deixar saldo NEGATIVO —
//     isso é sinal de inventário errado e aparece no KPI "Stock a repor".
//     (Diferente das saídas MANUAIS em actions/stock.ts, que continuam
//     condicionadas a saldo suficiente — aí não há realidade física a impor.)
//   · Best-effort como o spawnRecall: uma falha de stock nunca reverte a
//     conclusão da consulta nem a anulação do ato — regista-se no audit e
//     segue-se. O ledger permite sempre reconciliar depois.
//   · IDEMPOTENTE: procedimentos que já têm movimentos 'consumption' são
//     saltados — re-execuções (retry, dupla submissão) são seguras.
//   · ESTORNO por movimentos REAIS: ao anular um ato já consumido, devolve-se
//     exatamente o que os movimentos daquele procedureId registaram
//     (adjustment-in) — imune a edições da BOM feitas entretanto.
// =============================================================================

import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import Procedure from '@/models/Procedure';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import TreatmentType from '@/models/TreatmentType';
import Warehouse from '@/models/Warehouse';
import { logAudit } from '@/lib/audit';

// -----------------------------------------------------------------------------
// Cache de saldo SEM condição de suficiência (só para consumo automático):
// permite negativo por decisão de desenho — ver cabeçalho. As saídas manuais
// usam o applyCacheDelta condicionado em actions/stock.ts.
// -----------------------------------------------------------------------------
async function applyCacheDeltaUnconditional(
  productId: mongoose.Types.ObjectId,
  warehouseId: mongoose.Types.ObjectId,
  delta: number,
  mongooseSession: mongoose.ClientSession,
): Promise<void> {
  const inc = await Product.updateOne(
    { _id: productId, 'stockCache.warehouseId': warehouseId },
    { $inc: { 'stockCache.$.quantity': delta } },
    { session: mongooseSession },
  );
  if (inc.modifiedCount === 1) return;
  await Product.updateOne(
    { _id: productId, 'stockCache.warehouseId': { $ne: warehouseId } },
    { $push: { stockCache: { warehouseId, quantity: delta } } },
    { session: mongooseSession },
  );
}

async function defaultWarehouseFor(
  clinicId: string,
): Promise<{ _id: mongoose.Types.ObjectId } | null> {
  return Warehouse.findOne({
    clinicId,
    isDefault: true,
    active: true,
  })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }>();
}

// -----------------------------------------------------------------------------
// CONSUMO — chamado ao concluir a consulta (completeConsultationAction)
// -----------------------------------------------------------------------------
export async function consumeStockForAppointment(params: {
  appointmentId: string;
  clinicId: string;
  userId: string | null;
}): Promise<void> {
  try {
    await dbConnect();

    const warehouse = await defaultWarehouseFor(params.clinicId);
    if (!warehouse) {
      // Sem armazém default ativo não há para onde dar baixa — auditar
      // para a gerência configurar, sem tocar no fluxo clínico
      await logAudit({
        userId: params.userId,
        action: 'update',
        entityType: 'Appointment',
        entityId: params.appointmentId,
        clinicId: params.clinicId,
        summary:
          'Baixa de stock IGNORADA: clínica sem armazém default ativo (Stock → Armazéns)',
      });
      return;
    }

    // Atos válidos da consulta (anulados nunca consomem)
    const procedures = await Procedure.find({
      appointmentId: params.appointmentId,
      status: { $ne: 'void' },
    })
      .select('_id treatmentTypeId nameSnapshot')
      .lean();
    if (procedures.length === 0) return;

    // Idempotência: saltar atos que já têm consumo registado
    const alreadyConsumed = new Set(
      (
        await StockMovement.distinct('procedureId', {
          procedureId: { $in: procedures.map(p => p._id) },
          type: 'consumption',
        })
      ).map(String),
    );

    // BOMs dos atos envolvidos (uma query)
    const typeIds = [
      ...new Set(procedures.map(p => String(p.treatmentTypeId))),
    ];
    const types = await TreatmentType.find({ _id: { $in: typeIds } })
      .select('_id bom')
      .lean();
    const bomByType = new Map(
      types.map(t => [String(t._id), t.bom ?? []] as const),
    );

    for (const proc of procedures) {
      if (alreadyConsumed.has(String(proc._id))) continue;
      const bom = bomByType.get(String(proc.treatmentTypeId)) ?? [];
      if (bom.length === 0) continue;

      // Custos correntes dos produtos da BOM (valorização do consumo)
      const products = await Product.find({
        _id: { $in: bom.map(b => b.productId) },
      })
        .select('_id costCents')
        .lean();
      const costById = new Map(
        products.map(p => [String(p._id), p.costCents ?? 0] as const),
      );

      // Um ato = uma transação (ledger + caches consistentes entre si;
      // atos independentes falham/committam independentemente)
      const mongooseSession = await mongoose.startSession();
      try {
        await mongooseSession.withTransaction(async () => {
          for (const item of bom) {
            if (!(item.quantity > 0)) continue;
            await StockMovement.create(
              [
                {
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  type: 'consumption',
                  quantity: item.quantity,
                  unitCostCents: costById.get(String(item.productId)) ?? 0,
                  procedureId: proc._id,
                  createdByUserId: null, // movimento automático do sistema
                  note: `Baixa automática: ${proc.nameSnapshot}`,
                },
              ],
              { session: mongooseSession },
            );
            await applyCacheDeltaUnconditional(
              item.productId,
              warehouse._id,
              -item.quantity,
              mongooseSession,
            );
          }
        });
      } finally {
        await mongooseSession.endSession();
      }
    }
  } catch (err) {
    // Best-effort: nunca propagar — o fluxo clínico já aconteceu
    console.error('[stock-consumption] consumo falhou:', err);
    await logAudit({
      userId: params.userId,
      action: 'update',
      entityType: 'Appointment',
      entityId: params.appointmentId,
      clinicId: params.clinicId,
      summary:
        'Baixa automática de stock FALHOU — reconciliar manualmente no Stock',
    });
  }
}

// -----------------------------------------------------------------------------
// ESTORNO — chamado ao anular um ato (voidProcedureAction). Devolve ao stock
// exatamente o que os movimentos de consumo daquele ato registaram.
// -----------------------------------------------------------------------------
export async function reverseStockForProcedure(params: {
  procedureId: string;
  userId: string | null;
  reason: string;
}): Promise<void> {
  try {
    await dbConnect();

    const consumed = await StockMovement.find({
      procedureId: params.procedureId,
      type: 'consumption',
    })
      .select('productId warehouseId quantity unitCostCents')
      .lean();
    if (consumed.length === 0) return; // consulta ainda não concluída → nada a devolver

    // Idempotência: se já existe estorno para este ato, não duplicar
    const alreadyReversed = await StockMovement.exists({
      procedureId: params.procedureId,
      type: 'adjustment-in',
    });
    if (alreadyReversed) return;

    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        for (const mov of consumed) {
          await StockMovement.create(
            [
              {
                productId: mov.productId,
                warehouseId: mov.warehouseId,
                type: 'adjustment-in',
                quantity: mov.quantity,
                unitCostCents: mov.unitCostCents,
                procedureId: params.procedureId,
                createdByUserId: null,
                note: `Estorno automático (ato anulado): ${params.reason}`,
              },
            ],
            { session: mongooseSession },
          );
          await applyCacheDeltaUnconditional(
            mov.productId,
            mov.warehouseId,
            mov.quantity,
            mongooseSession,
          );
        }
      });
    } finally {
      await mongooseSession.endSession();
    }
  } catch (err) {
    console.error('[stock-consumption] estorno falhou:', err);
    await logAudit({
      userId: params.userId,
      action: 'update',
      entityType: 'Procedure',
      entityId: params.procedureId,
      summary:
        'Estorno automático de stock FALHOU — reconciliar manualmente no Stock',
    });
  }
}
