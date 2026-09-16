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
// · emitInvoiceReceiptFor — fatura-recibo (cliente por NIF, artigos por
//   referência Dentoral); grava moloniDocumentId/Number/atcud e 'issued'
// · emitCreditNoteFor     — nota de crédito associada ao documento Moloni
// · tryEmitInvoice        — emissão automática pós-cobrança, best-effort
// Erros do Moloni voltam como mensagem; o registo interno nunca fica
// inconsistente (a fatura mantém-se 'awaiting-emission').
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import TreatmentType from '@/models/TreatmentType';
import {
  isMoloniEmissionReady,
  ensureCustomer,
  insertInvoiceReceipt,
  insertCreditNote,
} from '@/lib/moloni';

export const lisbonDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

async function linesFor(invoiceId: string) {
  const inv = await Invoice.findById(invoiceId);
  if (!inv) throw new Error('Documento não encontrado.');
  const procs = await Procedure.find({
    _id: { $in: inv.lines.map(l => l.procedureId) },
  })
    .select('treatmentTypeId nameSnapshot priceCents')
    .lean();
  const tts = await TreatmentType.find({
    _id: { $in: procs.map(p => p.treatmentTypeId) },
  })
    .select('dentoralCode')
    .lean();
  const codeOf = new Map(
    tts.map(t => [String(t._id), (t.dentoralCode as string | null) ?? null]),
  );
  const lines = inv.lines.map(l => {
    const p = procs.find(x => String(x._id) === String(l.procedureId));
    const ref =
      (p && codeOf.get(String(p.treatmentTypeId))) ||
      `CDC-${String(p?.treatmentTypeId ?? l.procedureId).slice(-8)}`;
    return {
      reference: ref,
      name: l.description,
      priceCents: l.priceCents,
      qty: 1,
    };
  });
  return { inv, lines };
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
 * Emite a fatura-recibo no Moloni para uma fatura interna.
 * Pré-condições verificadas AQUI (idempotente): não anulada, ainda sem
 * documento Moloni. `auditUserId` é quem fica no trilho de auditoria.
 * Lança Error com mensagem legível quando não pode emitir.
 */
export async function emitInvoiceReceiptFor(
  invoiceId: string,
  opts: { auditUserId: string; automatic: boolean },
): Promise<{ number: string }> {
  if (!isMoloniEmissionReady())
    throw new Error(
      'Moloni não está totalmente configurado (séries/categoria/unidade/meios de pagamento).',
    );
  await dbConnect();
  const { inv, lines } = await linesFor(invoiceId);
  if (inv.status === 'voided') throw new Error('Documento anulado.');
  if (inv.moloniDocumentId) throw new Error('Já emitido no Moloni.');

  const patient = await Patient.findById(inv.patientId)
    .select('name nif email phone address')
    .lean();
  if (!patient) throw new Error('Paciente não encontrado.');

  const customerId = await ensureCustomer({
    name: patient.name,
    nif: inv.nifSnapshot ?? null, // o NIF DO DOCUMENTO (pode ser consumidor final)
    email: patient.email ?? null,
    phone: patient.phone ?? null,
    address: patient.address?.street ?? null,
    postalCode: patient.address?.postalCode ?? null,
    city: patient.address?.city ?? null,
  });

  const payments = (inv.payments ?? []).map(p => ({
    method: p.method,
    valueCents: p.amountCents,
    date: lisbonDate(p.paidAt),
  }));
  // Faturas anteriores à Fase 5C (sem array payments) — um único pagamento
  if (payments.length === 0 && inv.paidAt)
    payments.push({
      method: inv.paymentMethod,
      valueCents: inv.totalCents,
      date: lisbonDate(inv.paidAt),
    });

  const r = await insertInvoiceReceipt({
    customerId,
    date: lisbonDate(inv.paidAt ?? inv.createdAt),
    lines,
    payments,
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
      ? `Emitida automaticamente no Moloni: ${r.number}`
      : `Emitida no Moloni: ${r.number}`,
  });

  return { number: r.number };
}

/**
 * Nota de crédito no Moloni para uma fatura já lá emitida. Chamada pela
 * anulação (billing.voidInvoiceAction) depois de o admin ser validado.
 * Idempotente: sem documento Moloni ou já com NC → não faz nada.
 */
export async function emitCreditNoteFor(
  invoiceId: string,
  reason: string,
): Promise<{ error?: string; number?: string }> {
  try {
    if (!isMoloniEmissionReady()) return {};
    await dbConnect();
    const { inv, lines } = await linesFor(invoiceId);
    if (!inv.moloniDocumentId || inv.creditNoteMoloniId) return {};
    const patient = await Patient.findById(inv.patientId).select('name').lean();
    const customerId = await ensureCustomer({
      name: patient?.name ?? 'Paciente',
      nif: inv.nifSnapshot ?? null,
    });
    const r = await insertCreditNote({
      customerId,
      date: lisbonDate(new Date()),
      associatedDocumentId: inv.moloniDocumentId,
      totalCents: inv.totalCents,
      lines,
      notes: reason,
    });
    inv.set('creditNoteMoloniId', r.documentId);
    await inv.save();
    return { number: r.number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}

/**
 * Emissão automática pós-cobrança (best-effort). O utilizador já foi
 * validado pela cobrança; o trilho de auditoria fica em nome de quem emitiu
 * a fatura interna. Silenciosa: se o Moloni não estiver pronto, a fatura
 * fica 'awaiting-emission' e emite-se depois pelo botão.
 */
export async function tryEmitInvoice(invoiceId: string): Promise<void> {
  if (!isMoloniEmissionReady()) return;
  try {
    await dbConnect();
    const inv = await Invoice.findById(invoiceId)
      .select('status moloniDocumentId issuedByUserId')
      .lean();
    if (!inv || inv.moloniDocumentId || inv.status !== 'awaiting-emission')
      return;
    await emitInvoiceReceiptFor(invoiceId, {
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
