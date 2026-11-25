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
//   25/11 (Isabel): ANULAR só no próprio dia da emissão; depois, só NOTA DE
//   CRÉDITO (mode 'credit-total' — mesmo fluxo, qualquer dia). Ambos ficam em
//   invoice.creditNotes e, se a fatura estiver no Moloni, emitem lá a NC.
//
// partialCreditNoteAction (25/11, Isabel) — nota de crédito PARCIAL: só
//   algumas linhas (com a mesma pergunta da linha de balanço para esses
//   atos) ou só um valor (ex.: desconto esquecido). A fatura continua válida.
//
// RBAC: admin sempre; receptionist só nas clínicas onde opera
// (User.clinicIds via canOperateClinic). Anulação e notas de crédito: SÓ admin.
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
  partialCreditNoteSchema,
} from '@/lib/validations/billing';
import {
  canVoidOnDay,
  creditableCents,
  invoiceDueCents,
  validatePartialCredit,
} from '@/lib/credit-notes';
import { needsAdjustmentOnVoid } from '@/lib/commission-accounting';
import { createVoidAdjustment } from '@/lib/commission-adjustments';
import { cancelRecallForProcedure } from '@/lib/recalls';
import { reverseStockForProcedure } from '@/lib/stock-consumption';
import {
  emitCreditNoteFor,
  tryEmitInvoice,
  tryEmitReceipts,
} from '@/lib/moloni-emission';
import { FINAL_CONSUMER_ADDRESS_THRESHOLD_CENTS } from '@/lib/validations/patient';
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
      .select('role status clinicIds')
      .lean();
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== session.user.role ||
      !canOperateClinic(user, data.clinicId)
    ) {
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
      .select('insurance address')
      .lean();

    // 6.ª ronda/07 (Victor, nov. 2026): fatura sem NIF sai como Consumidor
    // final; a partir de 1.000 € a lei exige nome e morada reais do
    // adquirente — sem morada na ficha, a cobrança não avança.
    if (
      !data.nif &&
      totalCents >= FINAL_CONSUMER_ADDRESS_THRESHOLD_CENTS &&
      !(
        patientForInvoice?.address?.street &&
        patientForInvoice.address.postalCode &&
        patientForInvoice.address.city
      )
    ) {
      return {
        error:
          'Fatura de 1.000 € ou mais sem NIF: a lei exige o nome e a morada do paciente. Preencha a morada completa na ficha (ou indique o NIF) e volte a cobrar.',
      };
    }
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
    // Emissão automática no Moloni: FATURA + RECIBO do que foi pago agora
    // (25/11). Também quando o pagamento é parcial ou nada foi pago — a
    // dívida fica na fatura e cada pagamento posterior gera o seu recibo.
    // Falha não afeta a cobrança registada.
    if (invoiceId) await tryEmitInvoice(String(invoiceId));
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

    // Revalidar a conta na BD: uma sessão JWT antiga não deve manter
    // permissões de uma conta desativada ou cujo perfil foi alterado.
    const admin = await User.findById(session.user.id)
      .select('role status')
      .lean();
    if (!admin || admin.status !== 'active' || admin.role !== 'admin') {
      return { error: 'Apenas a administração ativa pode anular documentos.' };
    }

    const invoice = await Invoice.findById(data.invoiceId);
    if (!invoice) return { error: 'Documento não encontrado.' };
    if (invoice.status === 'voided') {
      return { error: 'Este documento já está anulado.' };
    }

    const now = new Date();
    // 25/11 (Isabel): anular só no próprio dia; depois, nota de crédito
    if (data.mode === 'void' && !canVoidOnDay(invoice.createdAt, now)) {
      return {
        error:
          'Só é possível anular no próprio dia da emissão. Depois disso, use a nota de crédito.',
      };
    }
    const creditCents = creditableCents(invoice);
    if (creditCents <= 0) {
      return { error: 'Este documento já foi todo creditado.' };
    }

    const procedureIds = invoice.lines.map(l => l.procedureId);
    const procedures = await Procedure.find({
      _id: { $in: procedureIds },
      invoiceId: invoice._id,
    });

    let adjustments = 0;
    const creditNoteId = new mongoose.Types.ObjectId();

    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        invoice.set('status', 'voided');
        invoice.set('voidedAt', now);
        invoice.set('voidedByUserId', session.user.id);
        invoice.set('voidReason', data.reason);
        invoice.creditNotes = [
          ...(invoice.creditNotes ?? []),
          {
            _id: creditNoteId,
            kind: data.mode === 'void' ? 'void' : 'total',
            totalCents: creditCents,
            reason: data.reason,
            createdAt: now,
            createdByUserId: new mongoose.Types.ObjectId(session.user.id),
          },
        ] as typeof invoice.creditNotes;
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

    // Nota de crédito no Moloni se a fatura já lá estava emitida
    // (best-effort — o registo interno já está anulado; o erro fica gravado
    // na própria nota de crédito para se repetir depois)
    let creditNote: string | null = null;
    if (invoice.moloniDocumentId) {
      const cn = await emitCreditNoteFor(
        String(invoice._id),
        String(creditNoteId),
      );
      if (cn.error) console.error('[moloni] nota de crédito:', cn.error);
      creditNote = cn.number ?? null;
    }
    const label = data.mode === 'void' ? 'Fatura anulada' : 'Nota de crédito total';

    await logAudit({
      userId: session.user.id,
      action: 'invoice-void',
      entityType: 'Invoice',
      entityId: String(invoice._id),
      patientId: String(invoice.patientId),
      clinicId: String(invoice.clinicId),
      summary: data.voidProcedures
        ? `${label} com linha de balanço: ${procedures.length} ato(s) anulado(s), ${adjustments} estorno(s) de comissão — ${data.reason}${creditNote ? ` · NC Moloni ${creditNote}` : ''}`
        : `${label} (documento): ${procedures.length} ato(s) devolvido(s) à cobrança — ${data.reason}${creditNote ? ` · NC Moloni ${creditNote}` : ''}`,
    });

    revalidatePath(`/admin/faturacao/${data.invoiceId}`);
    revalidatePath('/admin/faturacao');
    revalidatePath('/admin/cobranca');
    revalidatePath('/admin/relatorios');
    revalidatePath('/admin/dashboard');
    revalidatePath(`/admin/pacientes/${String(invoice.patientId)}`);
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

    // A autorização depende da clínica da fatura, não apenas do role
    // guardado no JWT. Revalidar também o estado atual da conta.
    const user = await User.findById(session.user.id)
      .select('role status clinicIds')
      .lean();
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== session.user.role ||
      !canOperateClinic(user, String(invoice.clinicId))
    ) {
      return { error: 'Sem permissões para esta clínica.' };
    }

    if (invoice.status === 'voided') return { error: 'Documento anulado.' };
    const paid = invoice.paidCents ?? invoice.totalCents;
    // Dívida = total − notas de crédito parciais − pagamentos
    const due = invoiceDueCents(invoice);
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
    const newDue = invoiceDueCents(invoice);
    if (newDue <= 0 && invoice.status === 'pending') {
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
      summary: `Pagamento registado: ${(data.amountEuros / 100).toFixed(2)} € (${data.paymentMethod}) — saldo ${(newDue / 100).toFixed(2)} €`,
    });
    // 25/11: recibo Moloni deste pagamento (se a fatura já lá está)
    await tryEmitReceipts(String(invoice._id));
    revalidatePath(`/admin/faturacao/${data.invoiceId}`);
    revalidatePath('/admin/faturacao');
    revalidatePath(`/admin/pacientes/${String(invoice.patientId)}`);
    revalidatePath('/admin/listagens/saldos');
    return { success: true, dueCents: newDue };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// -----------------------------------------------------------------------------
// NOTA DE CRÉDITO PARCIAL (25/11, Isabel) — só admin. Linhas ou só um valor.
// A fatura mantém-se válida; o crédito abate à dívida e fica na ficha.
// -----------------------------------------------------------------------------
export type PartialCreditNoteState =
  | { error: string }
  | { success: true; totalCents: number; moloniNumber: string | null; moloniError: string | null }
  | undefined;

export async function partialCreditNoteAction(
  _prev: PartialCreditNoteState,
  formData: FormData,
): Promise<PartialCreditNoteState> {
  try {
    const parsed = partialCreditNoteSchema.safeParse({
      invoiceId: formData.get('invoiceId'),
      kind: formData.get('kind'),
      reason: formData.get('reason'),
      lineIndexes: formData.get('lineIndexes'),
      valueCents: formData.get('valueEuros'),
      description: formData.get('description'),
      voidProcedures: formData.get('voidProcedures'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin') {
      return { error: 'Apenas a administração pode emitir notas de crédito.' };
    }
    await dbConnect();
    const admin = await User.findById(session.user.id)
      .select('role status')
      .lean();
    if (!admin || admin.status !== 'active' || admin.role !== 'admin') {
      return { error: 'Apenas a administração ativa pode emitir notas de crédito.' };
    }

    const invoice = await Invoice.findById(data.invoiceId);
    if (!invoice) return { error: 'Documento não encontrado.' };

    const creditedLineIndexes = (invoice.creditNotes ?? []).flatMap(
      c => c.lineIndexes ?? [],
    );
    const check = validatePartialCredit(
      {
        totalCents: invoice.totalCents,
        status: invoice.status,
        creditNotes: invoice.creditNotes ?? [],
        lines: invoice.lines,
      },
      data.kind === 'lines'
        ? { kind: 'lines', lineIndexes: data.lineIndexes, creditedLineIndexes }
        : { kind: 'value', valueCents: data.valueCents },
    );
    if ('error' in check) return { error: check.error };

    const now = new Date();
    const creditNoteId = new mongoose.Types.ObjectId();
    const lineIndexes =
      data.kind === 'lines' ? [...new Set(data.lineIndexes)].sort((a, b) => a - b) : [];
    const procIds =
      data.kind === 'lines'
        ? lineIndexes.map(i => invoice.lines[i].procedureId)
        : [];
    const procedures = procIds.length
      ? await Procedure.find({ _id: { $in: procIds }, invoiceId: invoice._id })
      : [];

    const mongooseSession = await mongoose.startSession();
    try {
      await mongooseSession.withTransaction(async () => {
        invoice.creditNotes = [
          ...(invoice.creditNotes ?? []),
          {
            _id: creditNoteId,
            kind: data.kind,
            totalCents: check.totalCents,
            reason: data.reason,
            lineIndexes: data.kind === 'lines' ? lineIndexes : undefined,
            description:
              data.kind === 'value' ? data.description || 'Acerto de valor' : null,
            createdAt: now,
            createdByUserId: new mongoose.Types.ObjectId(session.user.id),
          },
        ] as typeof invoice.creditNotes;
        // Saldo: se o crédito liquida o que faltava pagar, deixa de estar pendente
        if (invoice.status === 'pending' && invoiceDueCents(invoice) <= 0) {
          invoice.set(
            'status',
            invoice.moloniDocumentId ? 'issued' : 'awaiting-emission',
          );
        }
        await invoice.save({ session: mongooseSession });

        if (data.kind === 'lines') {
          if (data.voidProcedures) {
            for (const proc of procedures) {
              if (proc.status === 'void') continue;
              proc.set('status', 'void');
              proc.set('voidedAt', now);
              proc.set('voidedByUserId', session.user.id);
              proc.set('voidReason', `Nota de crédito: ${data.reason}`);
              await proc.save({ session: mongooseSession });
            }
          } else {
            await Procedure.updateMany(
              { _id: { $in: procedures.map(p => p._id) }, status: 'invoiced' },
              { $set: { status: 'completed', invoiceId: null } },
              { session: mongooseSession },
            );
          }
        }
      });
    } finally {
      await mongooseSession.endSession();
    }

    let adjustments = 0;
    if (data.kind === 'lines' && data.voidProcedures) {
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

    let moloniNumber: string | null = null;
    let moloniError: string | null = null;
    if (invoice.moloniDocumentId) {
      const cn = await emitCreditNoteFor(String(invoice._id), String(creditNoteId));
      moloniNumber = cn.number ?? null;
      moloniError = cn.error ?? null;
      if (cn.error) console.error('[moloni] nota de crédito parcial:', cn.error);
    }

    const euros = (check.totalCents / 100).toFixed(2);
    await logAudit({
      userId: session.user.id,
      action: 'invoice-void',
      entityType: 'Invoice',
      entityId: String(invoice._id),
      patientId: String(invoice.patientId),
      clinicId: String(invoice.clinicId),
      summary:
        data.kind === 'lines'
          ? `Nota de crédito parcial de ${euros} € — linha(s) ${lineIndexes.map(i => i + 1).join(', ')}${data.voidProcedures ? ` (${procedures.length} ato(s) anulado(s), ${adjustments} estorno(s))` : ' (atos devolvidos à cobrança)'} — ${data.reason}${moloniNumber ? ` · NC Moloni ${moloniNumber}` : ''}`
          : `Nota de crédito parcial de ${euros} € (${data.description || 'acerto de valor'}) — ${data.reason}${moloniNumber ? ` · NC Moloni ${moloniNumber}` : ''}`,
    });

    revalidatePath(`/admin/faturacao/${data.invoiceId}`);
    revalidatePath('/admin/faturacao');
    revalidatePath('/admin/cobranca');
    revalidatePath('/admin/relatorios');
    revalidatePath('/admin/dashboard');
    revalidatePath(`/admin/pacientes/${String(invoice.patientId)}`);
    revalidatePath('/admin/listagens/saldos');
    return { success: true, totalCents: check.totalCents, moloniNumber, moloniError };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

