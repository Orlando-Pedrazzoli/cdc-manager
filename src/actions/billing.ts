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
// RBAC: admin sempre; receptionist só nas clínicas onde opera
// (User.clinicIds via canOperateClinic).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { checkoutSchema } from '@/lib/validations/billing';
import Invoice from '@/models/Invoice';
import Procedure from '@/models/Procedure';
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

    const mongooseSession = await mongoose.startSession();
    let invoiceId: mongoose.Types.ObjectId | null = null;
    try {
      await mongooseSession.withTransaction(async () => {
        const [invoice] = await Invoice.create(
          [
            {
              clinicId: data.clinicId,
              patientId: data.patientId,
              status: 'awaiting-emission',
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
              paidAt: now,
              nifSnapshot: data.nif,
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
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
