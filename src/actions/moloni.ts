// 📄 src/actions/moloni.ts
// =============================================================================
// CDC Manager — Server Actions: Moloni (Fase 7A)
// · testMoloniConnectionAction — admin: autentica e devolve empresas, séries,
//   categorias, unidades, meios de pagamento e isenções (para preencher as
//   variáveis de ambiente)
// · emitInvoiceAction — admin/receção: emite no Moloni a FATURA de um documento
//   ainda por emitir e os recibos dos pagamentos; se a fatura já lá estiver,
//   emite só os recibos em falta (25/11: fatura + recibo, nunca FR)
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
import User, { canOperateClinic } from '@/models/User';
import {
  hasMoloniCredentials,
  isMoloniEmissionReady,
  discover,
  documentPdfLink,
} from '@/lib/moloni';
import { emitInvoiceFor, emitPendingReceipts } from '@/lib/moloni-emission';

const OID = /^[0-9a-fA-F]{24}$/;

export async function testMoloniConnectionAction(): Promise<{
  error?: string;
  data?: Awaited<ReturnType<typeof discover>>;
  ready?: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin')
    return { error: 'Sem permissões.' };
  await dbConnect();
  const admin = await User.findById(session.user.id).select('role status').lean();
  if (!admin || admin.status !== 'active' || admin.role !== 'admin') {
    return { error: 'Conta inativa ou permissões alteradas.' };
  }
  // Sem MOLONI_COMPANY_ID o teste autentica e lista só as empresas
  if (!hasMoloniCredentials())
    return {
      error:
        'Variáveis MOLONI_* em falta (client id/secret, username, password).',
    };
  try {
    return { data: await discover(), ready: isMoloniEmissionReady() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}

export async function emitInvoiceAction(
  invoiceId: string,
): Promise<{ error?: string; number?: string; warning?: string }> {
  try {
    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    )
      return { error: 'Sem permissões.' };
    if (!OID.test(invoiceId)) return { error: 'Documento inválido.' };

    await dbConnect();
    const user = await User.findById(session.user.id)
      .select('role status clinicIds')
      .lean();
    const invoice = await Invoice.findById(invoiceId)
      .select('clinicId moloniDocumentId moloniDocumentNumber')
      .lean();
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== session.user.role ||
      !invoice ||
      !canOperateClinic(user, String(invoice.clinicId))
    ) {
      return { error: 'Sem permissões para esta clínica.' };
    }

    // Fatura já no Moloni → só os recibos que faltem
    if (invoice.moloniDocumentId) {
      if (!isMoloniEmissionReady())
        return { error: 'Moloni não está totalmente configurado.' };
      const rc = await emitPendingReceipts(invoiceId);
      revalidatePath(`/admin/faturacao/${invoiceId}`);
      if (rc.errors.length) return { error: rc.errors[0] };
      return {
        number: rc.issued.join(', ') || (invoice.moloniDocumentNumber ?? ''),
      };
    }

    const r = await emitInvoiceFor(invoiceId, {
      auditUserId: session.user.id,
      automatic: false,
    });

    revalidatePath(`/admin/faturacao/${invoiceId}`);
    revalidatePath('/admin/faturacao');
    return {
      number: r.number,
      ...(r.receiptErrors.length
        ? { warning: `Fatura emitida, mas o recibo falhou: ${r.receiptErrors[0]}` }
        : {}),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}

export async function moloniPdfLinkAction(
  invoiceId: string,
): Promise<{ error?: string; url?: string }> {
  try {
    const session = await auth();
    if (
      !session?.user?.id ||
      !['admin', 'receptionist'].includes(session.user.role ?? '')
    )
      return { error: 'Sem permissões.' };
    if (!OID.test(invoiceId)) return { error: 'Documento inválido.' };
    await dbConnect();
    const [user, inv] = await Promise.all([
      User.findById(session.user.id).select('role status clinicIds').lean(),
      Invoice.findById(invoiceId).select('clinicId moloniDocumentId').lean(),
    ]);
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== session.user.role ||
      !inv ||
      !canOperateClinic(user, String(inv.clinicId))
    ) {
      return { error: 'Documento não encontrado.' };
    }
    if (!inv.moloniDocumentId) return { error: 'Sem documento Moloni.' };
    const url = await documentPdfLink(inv.moloniDocumentId);
    return url ? { url } : { error: 'Moloni não devolveu o PDF.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro Moloni.' };
  }
}
