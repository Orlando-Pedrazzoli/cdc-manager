// 📄 src/actions/moloni.ts
// =============================================================================
// CDC Manager — Server Actions: Moloni (Fase 7A)
// · testMoloniConnectionAction — admin: autentica e devolve empresas, séries,
//   categorias, unidades, meios de pagamento e isenções (para preencher as
//   variáveis de ambiente)
// · emitInvoiceAction — emite uma fatura 'awaiting-emission' como
//   fatura-recibo no Moloni (cliente por NIF, artigos por referência); grava
//   moloniDocumentId/Number/atcud e passa a 'issued'
// · emitCreditNoteForInvoice — usada pela anulação (billing.voidInvoiceAction)
//   quando a fatura já tinha documento Moloni
// · moloniPdfLinkAction — link do PDF certificado
// Tudo best-effort: erros do Moloni voltam como mensagem, nunca deixam o
// registo interno inconsistente.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import TreatmentType from '@/models/TreatmentType';
import {
  isMoloniConfigured,
  isMoloniEmissionReady,
  discover,
  ensureCustomer,
  insertInvoiceReceipt,
  insertCreditNote,
  documentPdfLink,
} from '@/lib/moloni';

const OID = /^[0-9a-fA-F]{24}$/;
const lisbonDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

export async function testMoloniConnectionAction(): Promise<{
  error?: string;
  data?: Awaited<ReturnType<typeof discover>>;
  ready?: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin')
    return { error: 'Sem permissões.' };
  if (!isMoloniConfigured())
    return {
      error:
        'Variáveis MOLONI_* em falta (client id/secret, username, password, company id).',
    };
  try {
    return { data: await discover(), ready: isMoloniEmissionReady() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}

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

export async function emitInvoiceAction(
  invoiceId: string,
): Promise<{ error?: string; number?: string }> {
  try {
    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    )
      return { error: 'Sem permissões.' };
    if (!OID.test(invoiceId)) return { error: 'Documento inválido.' };
    if (!isMoloniEmissionReady())
      return {
        error:
          'Moloni não está totalmente configurado (séries/categoria/unidade/meios de pagamento).',
      };
    await dbConnect();
    const { inv, lines } = await linesFor(invoiceId);
    if (inv.status === 'voided') return { error: 'Documento anulado.' };
    if (inv.moloniDocumentId) return { error: 'Já emitido no Moloni.' };
    const patient = await Patient.findById(inv.patientId)
      .select('name nif email phone address')
      .lean();
    if (!patient) return { error: 'Paciente não encontrado.' };
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
    if (payments.length === 0 && inv.paidAt)
      payments.push({
        method: inv.paymentMethod,
        valueCents: inv.totalCents,
        date: lisbonDate(inv.paidAt),
      });
    const notes = inv.insuranceSnapshot?.company
      ? `Seguradora: ${inv.insuranceSnapshot.company}${inv.insuranceSnapshot.cardNumber ? ` · Cartão ${inv.insuranceSnapshot.cardNumber}` : ''}`
      : null;
    const r = await insertInvoiceReceipt({
      customerId,
      date: lisbonDate(inv.paidAt ?? inv.createdAt),
      lines,
      payments,
      notes,
    });
    inv.set('moloniDocumentId', r.documentId);
    inv.set('moloniDocumentNumber', r.number);
    inv.set('moloniDocumentSetId', r.setId);
    inv.set('atcud', r.atcud);
    if (inv.status === 'awaiting-emission') inv.set('status', 'issued');
    await inv.save();
    await logAudit({
      userId: session.user.id,
      action: 'invoice-issue',
      entityType: 'Invoice',
      entityId: invoiceId,
      patientId: String(inv.patientId),
      clinicId: String(inv.clinicId),
      summary: `Emitida no Moloni: ${r.number}`,
    });
    revalidatePath(`/admin/faturacao/${invoiceId}`);
    revalidatePath('/admin/faturacao');
    return { number: r.number };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}

/** Chamada pela anulação interna — não é action pública */
export async function emitCreditNoteForInvoice(
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

export async function moloniPdfLinkAction(
  invoiceId: string,
): Promise<{ error?: string; url?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role === 'patient')
      return { error: 'Sem permissões.' };
    if (!OID.test(invoiceId)) return { error: 'Documento inválido.' };
    await dbConnect();
    const inv = await Invoice.findById(invoiceId)
      .select('moloniDocumentId')
      .lean();
    if (!inv?.moloniDocumentId) return { error: 'Sem documento Moloni.' };
    const url = await documentPdfLink(inv.moloniDocumentId);
    return url ? { url } : { error: 'Moloni não devolveu o PDF.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}

/**
 * Emissão automática pós-cobrança (best-effort, sem sessão — o utilizador já
 * foi validado pela cobrança). Silenciosa: se o Moloni não estiver pronto,
 * a fatura fica 'awaiting-emission' e emite-se depois pelo botão.
 */
export async function tryEmitInvoice(invoiceId: string): Promise<void> {
  if (!isMoloniEmissionReady()) return;
  try {
    await dbConnect();
    const { inv, lines } = await linesFor(invoiceId);
    if (inv.moloniDocumentId || inv.status !== 'awaiting-emission') return;
    const patient = await Patient.findById(inv.patientId)
      .select('name nif email phone address')
      .lean();
    if (!patient) return;
    const customerId = await ensureCustomer({
      name: patient.name,
      nif: inv.nifSnapshot ?? null,
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
    const notes = inv.insuranceSnapshot?.company
      ? `Seguradora: ${inv.insuranceSnapshot.company}${inv.insuranceSnapshot.cardNumber ? ` · Cartão ${inv.insuranceSnapshot.cardNumber}` : ''}`
      : null;
    const r = await insertInvoiceReceipt({
      customerId,
      date: lisbonDate(inv.paidAt ?? inv.createdAt),
      lines,
      payments,
      notes,
    });
    inv.set('moloniDocumentId', r.documentId);
    inv.set('moloniDocumentNumber', r.number);
    inv.set('moloniDocumentSetId', r.setId);
    inv.set('atcud', r.atcud);
    inv.set('status', 'issued');
    await inv.save();
    await logAudit({
      userId: String(inv.issuedByUserId),
      action: 'invoice-issue',
      entityType: 'Invoice',
      entityId: invoiceId,
      patientId: String(inv.patientId),
      clinicId: String(inv.clinicId),
      summary: `Emitida automaticamente no Moloni: ${r.number}`,
    });
  } catch (e) {
    console.error(
      '[moloni] emissão automática:',
      e instanceof Error ? e.message : e,
    );
  }
}
