// 📄 src/actions/moloni.ts
// =============================================================================
// CDC Manager — Server Actions: Moloni (Fase 7A)
// · testMoloniConnectionAction — admin: autentica e devolve empresas, séries,
//   categorias, unidades, meios de pagamento e isenções (para preencher as
//   variáveis de ambiente)
// · emitInvoiceAction — admin/receção: emite uma fatura 'awaiting-emission'
//   como fatura-recibo no Moloni
// · moloniPdfLinkAction — staff: link do PDF certificado
//
// SÓ actions com sessão validada vivem aqui. A lógica de emissão (fatura,
// nota de crédito, emissão automática) está em src/lib/moloni-emission.ts —
// num ficheiro 'use server' toda a função exportada é um endpoint público,
// e essas funções são chamadas internamente por billing.ts sem sessão.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import {
  isMoloniConfigured,
  isMoloniEmissionReady,
  discover,
  documentPdfLink,
} from '@/lib/moloni';
import { emitInvoiceReceiptFor } from '@/lib/moloni-emission';

const OID = /^[0-9a-fA-F]{24}$/;

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

    const r = await emitInvoiceReceiptFor(invoiceId, {
      auditUserId: session.user.id,
      automatic: false,
    });

    revalidatePath(`/admin/faturacao/${invoiceId}`);
    revalidatePath('/admin/faturacao');
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
