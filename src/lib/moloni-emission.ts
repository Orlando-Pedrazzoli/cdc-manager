// 📄 src/lib/moloni-emission.ts
// =============================================================================
// CDC Manager — Emissão interna no Moloni (Fase 7A) — NÃO é server action
// -----------------------------------------------------------------------------
// Este ficheiro NÃO tem 'use server' de propósito. Num ficheiro 'use server'
// TODA a função exportada vira um endpoint POST público, mesmo que só seja
// chamada por outro código do servidor. As funções aqui são chamadas por
// billing.ts (cobrança e anulação) e por actions/moloni.ts, sempre DEPOIS de
// a sessão/permissão ter sido validada pelo chamador — por isso vivem em
// src/lib, fora da fronteira de actions.
//
// 25/11 (Victor): sempre FATURA + RECIBO em separado, nunca fatura-recibo;
// série da CLÍNICA da cobrança (lib/moloni.documentSetFor).
// · emitInvoiceFor      — fatura (cliente por NIF, artigos por referência
//   Dentoral); grava moloniDocumentId/Number/atcud; depois os recibos
// · emitPendingReceipts — um recibo por pagamento ainda sem recibo
// · emitCreditNoteFor   — nota de crédito (total ou parcial) já registada em
//   invoice.creditNotes, associada à fatura Moloni
// · tryEmitInvoice / tryEmitReceipts — emissão automática, best-effort
// Erros do Moloni voltam como mensagem; o registo interno nunca fica
// inconsistente (a fatura mantém-se 'awaiting-emission').
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Clinic from '@/models/Clinic';
import Invoice, { type InvoiceDoc } from '@/models/Invoice';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import TreatmentType from '@/models/TreatmentType';
import {
  isMoloniEmissionReady,
  ensureCustomer,
  insertInvoice,
  insertReceipt,
  insertCreditNote,
  type EmitLine,
} from '@/lib/moloni';

export const lisbonDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

async function linesFor(inv: Pick<InvoiceDoc, 'lines'>): Promise<EmitLine[]> {
  const procs = await Procedure.find({
    _id: { $in: inv.lines.map(l => l.procedureId) },
  })
    .select('treatmentTypeId')
    .lean();
  const tts = await TreatmentType.find({
    _id: { $in: procs.map(p => p.treatmentTypeId) },
  })
    .select('dentoralCode')
    .lean();
  const codeOf = new Map(
    tts.map(t => [String(t._id), (t.dentoralCode as string | null) ?? null]),
  );
  return inv.lines.map(l => {
    const p = procs.find(x => String(x._id) === String(l.procedureId));
    const ref =
      (p && codeOf.get(String(p.treatmentTypeId))) ||
      `CDC-${String(p?.treatmentTypeId ?? l.procedureId).slice(-8)}`;
    // Atos clínicos: isentos (M07)
    return { reference: ref, name: l.description, priceCents: l.priceCents, qty: 1, vatRate: 0 };
  });
}

async function clinicSlugOf(clinicId: unknown): Promise<string> {
  const c = await Clinic.findById(clinicId).select('slug').lean();
  if (!c?.slug) throw new Error('Clínica do documento não encontrada.');
  return c.slug;
}

async function customerFor(inv: Pick<InvoiceDoc, 'patientId' | 'nifSnapshot'>): Promise<number> {
  const patient = await Patient.findById(inv.patientId)
    .select('name email phone address')
    .lean();
  if (!patient) throw new Error('Paciente não encontrado.');
  return ensureCustomer({
    name: patient.name,
    nif: inv.nifSnapshot ?? null, // o NIF DO DOCUMENTO (pode ser consumidor final)
    email: patient.email ?? null,
    phone: patient.phone ?? null,
    address: patient.address?.street ?? null,
    postalCode: patient.address?.postalCode ?? null,
    city: patient.address?.city ?? null,
  });
}

function insuranceNotes(inv: {
  insuranceSnapshot?: {
    company?: string | null;
    cardNumber?: string | null;
  } | null;
}): string | null {
  const s = inv.insuranceSnapshot;
  if (!s?.company) return null;
  return `Seguradora: ${s.company}${s.cardNumber ? ` · Cartão ${s.cardNumber}` : ''}`;
}

/**
 * Emite a FATURA no Moloni para uma fatura interna e, a seguir, os recibos
 * dos pagamentos já registados. Pré-condições verificadas AQUI (idempotente):
 * não anulada, ainda sem documento Moloni. Pode emitir-se uma fatura ainda
 * por pagar (status 'pending') — a dívida fica no Moloni e cada pagamento
 * gera o seu recibo. Lança Error com mensagem legível quando não pode emitir.
 */
export async function emitInvoiceFor(
  invoiceId: string,
  opts: { auditUserId: string; automatic: boolean },
): Promise<{ number: string; receipts: number; receiptErrors: string[] }> {
  if (!isMoloniEmissionReady())
    throw new Error(
      'Moloni não está totalmente configurado (séries/categoria/unidade/meios de pagamento).',
    );
  await dbConnect();
  const inv = await Invoice.findById(invoiceId);
  if (!inv) throw new Error('Documento não encontrado.');
  if (inv.status === 'voided') throw new Error('Documento anulado.');
  if (inv.moloniDocumentId) throw new Error('Já emitido no Moloni.');

  const clinicSlug = await clinicSlugOf(inv.clinicId);
  const customerId = await customerFor(inv);
  const r = await insertInvoice({
    clinicSlug,
    customerId,
    date: lisbonDate(inv.createdAt),
    lines: await linesFor(inv),
    notes: insuranceNotes(inv),
  });

  inv.set('moloniDocumentId', r.documentId);
  inv.set('moloniDocumentNumber', r.number);
  inv.set('moloniDocumentSetId', r.setId);
  inv.set('atcud', r.atcud);
  if (inv.status === 'awaiting-emission') inv.set('status', 'issued');
  await inv.save();

  await logAudit({
    userId: opts.auditUserId,
    action: 'invoice-issue',
    entityType: 'Invoice',
    entityId: invoiceId,
    patientId: String(inv.patientId),
    clinicId: String(inv.clinicId),
    summary: opts.automatic
      ? `Fatura emitida automaticamente no Moloni: ${r.number}`
      : `Fatura emitida no Moloni: ${r.number}`,
  });

  const rc = await emitPendingReceipts(invoiceId);
  return { number: r.number, receipts: rc.issued.length, receiptErrors: rc.errors };
}

/**
 * Um RECIBO por pagamento registado que ainda não o tenha. Só depois de a
 * fatura existir no Moloni. Cada recibo é independente: um erro não impede
 * os outros (fica para a próxima tentativa). Nunca lança.
 */
export async function emitPendingReceipts(
  invoiceId: string,
): Promise<{ issued: string[]; errors: string[] }> {
  const issued: string[] = [];
  const errors: string[] = [];
  try {
    if (!isMoloniEmissionReady()) return { issued, errors };
    await dbConnect();
    const inv = await Invoice.findById(invoiceId);
    if (!inv?.moloniDocumentId || inv.status === 'voided')
      return { issued, errors };
    const done = new Set(
      (inv.moloniReceipts ?? []).map(r => String(r.paymentId)),
    );
    const todo = (inv.payments ?? []).filter(p => !done.has(String(p._id)));
    // Documentos anteriores à Fase 5C (sem payments) não geram recibo aqui
    if (todo.length === 0) return { issued, errors };

    const clinicSlug = await clinicSlugOf(inv.clinicId);
    const customerId = await customerFor(inv);
    for (const p of todo) {
      try {
        const rc = await insertReceipt({
          clinicSlug,
          customerId,
          date: lisbonDate(p.paidAt),
          invoiceDocumentId: inv.moloniDocumentId,
          method: p.method,
          valueCents: p.amountCents,
          notes: p.note ?? null,
        });
        inv.moloniReceipts = [
          ...(inv.moloniReceipts ?? []),
          {
            paymentId: p._id,
            documentId: rc.documentId,
            number: rc.number,
            createdAt: new Date(),
          },
        ] as typeof inv.moloniReceipts;
        await inv.save();
        issued.push(rc.number);
        await logAudit({
          userId: String(p.receivedByUserId),
          action: 'invoice-issue',
          entityType: 'Invoice',
          entityId: invoiceId,
          patientId: String(inv.patientId),
          clinicId: String(inv.clinicId),
          summary: `Recibo emitido no Moloni: ${rc.number} (${(p.amountCents / 100).toFixed(2)} € — fatura ${inv.moloniDocumentNumber ?? ''})`,
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Erro Moloni.');
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Erro Moloni.');
  }
  if (errors.length) console.error('[moloni] recibos:', errors.join(' | '));
  return { issued, errors };
}

/**
 * Nota de crédito no Moloni para uma entrada de `invoice.creditNotes` já
 * gravada (anulação, total ou parcial). Sem fatura Moloni, ou já emitida →
 * não faz nada. Erros ficam gravados na própria entrada (moloniError) e
 * voltam na resposta; o registo interno nunca se perde.
 */
export async function emitCreditNoteFor(
  invoiceId: string,
  creditNoteId: string,
): Promise<{ error?: string; number?: string }> {
  try {
    if (!isMoloniEmissionReady()) return {};
    await dbConnect();
    const inv = await Invoice.findById(invoiceId);
    if (!inv?.moloniDocumentId) return {};
    const cn = (inv.creditNotes ?? []).find(c => String(c._id) === creditNoteId);
    if (!cn || cn.moloniDocumentId) return {};

    const all = await linesFor(inv);
    let lines: EmitLine[];
    if (cn.kind === 'lines') {
      lines = (cn.lineIndexes ?? []).map(i => all[i]).filter(Boolean);
    } else if (cn.kind === 'value') {
      lines = [creditValueLine(cn.description ?? 'Acerto de valor', cn.totalCents)];
    } else {
      // 'void' / 'total': o que falta creditar. Sem créditos anteriores →
      // todas as linhas; com créditos por linhas → as linhas que faltam;
      // com créditos por valor → uma linha com o restante.
      const before = (inv.creditNotes ?? []).filter(
        c => String(c._id) !== creditNoteId,
      );
      if (before.length === 0) lines = all;
      else if (before.every(c => c.kind === 'lines')) {
        const used = new Set(before.flatMap(c => c.lineIndexes ?? []));
        lines = all.filter((_, i) => !used.has(i));
      } else lines = [creditValueLine('Crédito do valor restante', cn.totalCents)];
    }
    if (lines.length === 0) throw new Error('Nota de crédito sem linhas.');

    const r = await insertCreditNote({
      clinicSlug: await clinicSlugOf(inv.clinicId),
      customerId: await customerFor(inv),
      date: lisbonDate(new Date()),
      associatedDocumentId: inv.moloniDocumentId,
      totalCents: cn.totalCents,
      lines,
      notes: cn.reason,
    });
    cn.set('moloniDocumentId', r.documentId);
    cn.set('moloniDocumentNumber', r.number);
    cn.set('moloniError', null);
    // compatibilidade: o 1.º campo de NC continua a apontar para a anulação
    if ((cn.kind === 'void' || cn.kind === 'total') && !inv.creditNoteMoloniId)
      inv.set('creditNoteMoloniId', r.documentId);
    await inv.save();
    return { number: r.number };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro Moloni.';
    try {
      await Invoice.updateOne(
        { _id: invoiceId, 'creditNotes._id': creditNoteId },
        { $set: { 'creditNotes.$.moloniError': msg.slice(0, 300) } },
      );
    } catch {
      /* best-effort */
    }
    return { error: msg };
  }
}

/** Linha de crédito "só um valor" (ex.: desconto esquecido) — isenta */
function creditValueLine(name: string, cents: number): EmitLine {
  return { reference: 'CDC-CREDITO', name, priceCents: cents, qty: 1, vatRate: 0 };
}

/**
 * Emissão automática pós-cobrança (best-effort). O utilizador já foi
 * validado pela cobrança; o trilho de auditoria fica em nome de quem emitiu
 * a fatura interna. Silenciosa: se o Moloni não estiver pronto, a fatura
 * fica por emitir e emite-se depois pelo botão.
 */
export async function tryEmitInvoice(invoiceId: string): Promise<void> {
  if (!isMoloniEmissionReady()) return;
  try {
    await dbConnect();
    const inv = await Invoice.findById(invoiceId)
      .select('status moloniDocumentId issuedByUserId')
      .lean();
    if (!inv || inv.moloniDocumentId || inv.status === 'voided') return;
    await emitInvoiceFor(invoiceId, {
      auditUserId: String(inv.issuedByUserId),
      automatic: true,
    });
  } catch (e) {
    console.error(
      '[moloni] emissão automática:',
      e instanceof Error ? e.message : e,
    );
  }
}

/** Depois de registar um pagamento: o recibo (se a fatura já está no Moloni) */
export async function tryEmitReceipts(invoiceId: string): Promise<void> {
  if (!isMoloniEmissionReady()) return;
  await emitPendingReceipts(invoiceId);
}
