// 📄 src/actions/billing.ts
// =============================================================================
// CDC Manager — Actions: cobrança no balcão (receção/admin)
// -----------------------------------------------------------------------------
// checkoutAction — regista a cobrança dos atos selecionados de um paciente:
//   · cria a Invoice em 'awaiting-emission' (pagamento recebido AGORA;
//     documento fiscal emite-se quando a conta Moloni ativar — Sprint 4
//     pluga a emissão exatamente aqui e transita para 'issued')
//   · Procedures selecionados: completed → invoiced + invoiceId (dentro de
//     transação, com guarda contra dupla cobrança concorrente)
//
// voidInvoiceAction (Fase 1, E2) — anula um documento e responde ao
// "Quer criar uma linha de balanço?" da Isabel:
//   · Sim (voidProcedures) → o erro estava nos TRATAMENTOS: cada ato passa a
//     'void' e, se o seu mês já fechou, lança-se um CommissionAdjustment
//     negativo no mês corrente (lib/commission-accounting.ts)
//   · Não → o erro estava no DOCUMENTO (NIF, meio de pagamento…): os atos
//     voltam a 'completed' sem fatura → reaparecem na fila de cobrança
//   Enquanto o Moloni não está ligado, a anulação é interna; quando ligar
//   (Fase 7) a nota de crédito Moloni pluga aqui e preenche creditNoteMoloniId.
//
// RBAC: admin sempre; receptionist só nas clínicas onde opera
// (User.clinicIds via canOperateClinic). Anulação: SÓ admin.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import {
  checkoutSchema,
  voidInvoiceSchema,
  registerPaymentSchema,
} from '@/lib/validations/billing';
import { needsAdjustmentOnVoid } from '@/lib/commission-accounting';
import { createVoidAdjustment } from '@/lib/commission-adjustments';
import { cancelRecallForProcedure } from '@/lib/recalls';
import { reverseStockForProcedure } from '@/lib/stock-consumption';
import { emitCreditNoteFor, tryEmitInvoice } from '@/lib/moloni-emission';
import Invoice from '@/models/Invoice';
import Procedure from '@/models/Procedure';
import Patient from '@/models/Patient';
import User, { canOperateClinic } from '@/models/User';

export type BillingActionState =
  | { error: string }
  | { success: true }
  | undefined;

export async function checkoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
    const parsed = checkoutSchema.safeParse({
      clinicId: formData.get('clinicId'),
      patientId: formData.get('patientId'),
      procedureIds: formData.get('procedureIds'),
      paymentMethod: formData.get('paymentMethod'),
      nif: formData.get('nif'),
      paidNowCents: formData.get('paidNowEuros'), // euros no form → cêntimos no schema
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    ) {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();

    // Receção: só nas clínicas onde opera
    const user = await User.findById(session.user.id)
      .select('role clinicIds')
      .lean();
    if (!user || !canOperateClinic(user, data.clinicId)) {
      return { error: 'Sem permissões nesta clínica.' };
    }

    // Atos elegíveis: do paciente, da clínica, executados e ainda sem fatura
    const procedures = await Procedure.find({
      _id: { $in: data.procedureIds },
      patientId: data.patientId,
      clinicId: data.clinicId,
      status: 'completed',
      invoiceId: null,
    }).lean();

    if (procedures.length !== data.procedureIds.length) {
      return {
        error:
          'Alguns atos já foram cobrados ou não são elegíveis — atualize a página.',
      };
    }

    const totalCents = procedures.reduce((s, p) => s + p.priceCents, 0);
    const now = new Date();

    // Fase 5C: pagamento parcial ("em 2x") — o que fica por pagar regista-se
    // depois na fatura (Registar pagamento). 0 = nada pago agora (pendente).
    const paidNow = data.paidNowCents ?? totalCents;
    if (paidNow > totalCents) {
      return { error: 'O valor pago não pode exceder o total.' };
    }
    const isPartial = paidNow < totalCents;

    // E12: seguradora + nº de cartão da ficha → cabeçalho do documento
    const patientForInvoice = await Patient.findById(data.patientId)
      .select('insurance')
      .lean();
    const insuranceSnapshot = {
      company: patientForInvoice?.insurance?.company ?? null,
      cardNumber: patientForInvoice?.insurance?.cardNumber ?? null,
    };

    const mongooseSession = await mongoose.startSession();
    let invoiceId: mongoose.Types.ObjectId | null = null;
    try {
      await mongooseSession.withTransaction(async () => {
        const [invoice] = await Invoice.create(
          [
            {
              clinicId: data.clinicId,
              patientId: data.patientId,
              status: isPartial ? 'pending' : 'awaiting-emission',
              lines: procedures.map(p => ({
                procedureId: p._id,
                description:
                  p.nameSnapshot +
                  (p.toothNumbers?.length
                    ? ` (dentes ${p.toothNumbers.join(', ')})`
                    : ''),
                priceCents: p.priceCents,
              })),
              totalCents,
              paymentMethod: data.paymentMethod,
              paidAt: paidNow > 0 ? now : null,
              payments:
                paidNow > 0
                  ? [
                      {
                        amountCents: paidNow,
                        method: data.paymentMethod,
                        paidAt: now,
                        receivedByUserId: session.user.id,
                        note: isPartial
                          ? 'Pagamento parcial na cobrança'
                          : null,
                      },
                    ]
                  : [],
              paidCents: paidNow,
              nifSnapshot: data.nif,
              insuranceSnapshot,
              issuedByUserId: session.user.id,
            },
          ],
          { session: mongooseSession },
        );
        invoiceId = invoice._id;

        // Guarda contra corrida: só transiciona quem AINDA está elegível
        const res = await Procedure.updateMany(
          {
            _id: { $in: procedures.map(p => p._id) },
            status: 'completed',
            invoiceId: null,
          },
          { $set: { status: 'invoiced', invoiceId: invoice._id } },
          { session: mongooseSession },
        );
        if (res.modifiedCount !== procedures.length) {
          throw new Error(
            'Cobrança concorrente detetada — nenhum valor foi registado. Atualize a página.',
          );
        }
      });
    } finally {
      await mongooseSession.endSession();
    }

    await logAudit({
      userId: session.user.id,
      action: 'create',
      entityType: 'Invoice',
      entityId: String(invoiceId),
      patientId: data.patientId,
      clinicId: data.clinicId,
      summary: `Cobrança registada: ${(totalCents / 100).toFixed(2)} € (${procedures.length} ato${procedures.length === 1 ? '' : 's'}, ${data.paymentMethod}) — documento fiscal aguarda Moloni`,
    });

    revalidatePath('/admin/cobranca');
    // Fase 7A: emissão automática no Moloni (só se totalmente pago e o
    // Moloni estiver configurado; falha não afeta a cobrança registada)
    if (!isPartial && invoiceId) await tryEmitInvoice(String(invoiceId));
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// -----------------------------------------------------------------------------
// ANULAR FATURA — never delete; admin only
// -----------------------------------------------------------------------------
export type VoidInvoiceState =
  | { error: string }
  | { success: true; voidedProcedures: number; adjustments: number }
  | undefined;

export async function voidInvoiceAction(
  _prev: VoidInvoiceState,
  formData: FormData,
): Promise<VoidInvoiceState> {
  try {
    const parsed = voidInvoiceSchema.safeParse({
      invoiceId: formData.get('invoiceId'),
      reason: formData.get('reason'),
      voidProcedures: formData.get('voidProcedures'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return { error: 'Apenas a administração pode anular documentos.' };
    }
    await dbConnect();

    const invoice = await Invoice.findById(data.invoiceId);
    if (!invoice) return { error: 'Documento não encontrado.' };
    if (invoice.status === 'voided') {
      return { error: 'Este documento já está anulado.' };
    }

    const procedureIds = invoice.lines.map(l => l.procedureId);
    const procedures = await Procedure.find({
      _id: { $in: procedureIds },
      invoiceId: invoice._id,
    });

    const now = new Date();
    let adjustments = 0;

    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        invoice.set('status', 'voided');
        invoice.set('voidedAt', now);
        invoice.set('voidReason', data.reason);
        await invoice.save({ session: mongooseSession });

        if (data.voidProcedures) {
          // "Sim": linha de balanço — atos anulados
          for (const proc of procedures) {
            if (proc.status === 'void') continue;
            proc.set('status', 'void');
            proc.set('voidedAt', now);
            proc.set('voidedByUserId', session.user.id);
            proc.set('voidReason', `Nota de crédito: ${data.reason}`);
            await proc.save({ session: mongooseSession });
          }
        } else {
          // "Não": documento errado, tratamentos certos — voltam à cobrança
          await Procedure.updateMany(
            { _id: { $in: procedures.map(p => p._id) }, status: 'invoiced' },
            { $set: { status: 'completed', invoiceId: null } },
            { session: mongooseSession },
          );
        }
      });
    } finally {
      await mongooseSession.endSession();
    }

    // Efeitos secundários best-effort (fora da transação, idempotentes)
    if (data.voidProcedures) {
      for (const proc of procedures) {
        if (needsAdjustmentOnVoid(proc.executedAt, now)) {
          await createVoidAdjustment({
            proc,
            reason: 'invoice-void',
            invoiceId: String(invoice._id),
            effectiveAt: now,
            userId: session.user.id,
            note: data.reason,
          });
          adjustments++;
        }
        await cancelRecallForProcedure(String(proc._id));
        await reverseStockForProcedure({
          procedureId: String(proc._id),
          userId: session.user.id,
          reason: `Nota de crédito: ${data.reason}`,
        });
      }
    }

    // Fase 7A: nota de crédito no Moloni se a fatura já lá estava emitida
    // (best-effort — o registo interno já está anulado)
    let creditNote: string | null = null;
    if (invoice.moloniDocumentId) {
      const cn = await emitCreditNoteFor(String(invoice._id), data.reason);
      if (cn.error) console.error('[moloni] nota de crédito:', cn.error);
      creditNote = cn.number ?? null;
    }

    await logAudit({
      userId: session.user.id,
      action: 'invoice-void',
      entityType: 'Invoice',
      entityId: String(invoice._id),
      patientId: String(invoice.patientId),
      clinicId: String(invoice.clinicId),
      summary: data.voidProcedures
        ? `Fatura anulada com linha de balanço: ${procedures.length} ato(s) anulado(s), ${adjustments} estorno(s) de comissão — ${data.reason}${creditNote ? ` · NC Moloni ${creditNote}` : ''}`
        : `Fatura anulada (documento): ${procedures.length} ato(s) devolvido(s) à cobrança — ${data.reason}${creditNote ? ` · NC Moloni ${creditNote}` : ''}`,
    });

    revalidatePath(`/admin/faturacao/${data.invoiceId}`);
    revalidatePath('/admin/faturacao');
    revalidatePath('/admin/cobranca');
    revalidatePath('/admin/relatorios');
    revalidatePath('/admin/dashboard');
    return {
      success: true,
      voidedProcedures: data.voidProcedures ? procedures.length : 0,
      adjustments,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// -----------------------------------------------------------------------------
// REGISTAR PAGAMENTO numa fatura com saldo (Fase 5C) — cada pagamento é um
// recibo. Quando o saldo chega a 0, a fatura passa de 'pending' a
// 'awaiting-emission' (ou mantém 'issued' se já emitida no Moloni).
// -----------------------------------------------------------------------------
export type RegisterPaymentState =
  | { error: string }
  | { success: true; dueCents: number }
  | undefined;

export async function registerPaymentAction(
  _prev: RegisterPaymentState,
  formData: FormData,
): Promise<RegisterPaymentState> {
  try {
    const parsed = registerPaymentSchema.safeParse({
      invoiceId: formData.get('invoiceId'),
      amountEuros: formData.get('amountEuros'),
      paymentMethod: formData.get('paymentMethod'),
      note: formData.get('note'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;
    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    ) {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();
    const invoice = await Invoice.findById(data.invoiceId);
    if (!invoice) return { error: 'Documento não encontrado.' };
    if (invoice.status === 'voided') return { error: 'Documento anulado.' };
    const paid = invoice.paidCents ?? invoice.totalCents;
    const due = invoice.totalCents - paid;
    if (due <= 0) return { error: 'Este documento já está totalmente pago.' };
    if (data.amountEuros > due) {
      return {
        error: `O valor excede o saldo em dívida (${(due / 100).toFixed(2)} €).`,
      };
    }
    const now = new Date();
    invoice.payments = [
      ...(invoice.payments ?? []),
      {
        amountCents: data.amountEuros,
        method: data.paymentMethod,
        paidAt: now,
        receivedByUserId: new mongoose.Types.ObjectId(session.user.id),
        note: data.note,
      },
    ] as typeof invoice.payments;
    const newPaid = paid + data.amountEuros;
    invoice.set('paidCents', newPaid);
    if (!invoice.paidAt) invoice.set('paidAt', now);
    if (newPaid >= invoice.totalCents && invoice.status === 'pending') {
      invoice.set(
        'status',
        invoice.moloniDocumentId ? 'issued' : 'awaiting-emission',
      );
    }
    await invoice.save();
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Invoice',
      entityId: String(invoice._id),
      patientId: String(invoice.patientId),
      clinicId: String(invoice.clinicId),
      summary: `Pagamento registado: ${(data.amountEuros / 100).toFixed(2)} € (${data.paymentMethod}) — saldo ${((invoice.totalCents - newPaid) / 100).toFixed(2)} €`,
    });
    revalidatePath(`/admin/faturacao/${data.invoiceId}`);
    revalidatePath('/admin/faturacao');
    revalidatePath(`/admin/pacientes/${String(invoice.patientId)}`);
    revalidatePath('/admin/listagens/saldos');
    return { success: true, dueCents: invoice.totalCents - newPaid };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
