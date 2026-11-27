// 📄 src/app/admin/orcamentos/[id]/pdf/route.ts
// =============================================================================
// CDC Manager — Orçamento em PDF A4 para entregar ao paciente (27/11/2026)
// GET — gestão e receção. Ver lib/budget-pdf-data.ts.
// =============================================================================

import { getVerifiedSession } from '@/lib/get-verified-session';
import { budgetPdfResponse } from '@/lib/budget-pdf-data';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVerifiedSession(['admin', 'receptionist']);
  if (!session?.user?.id)
    return new Response('Sem permissões.', { status: 401 });
  const { id } = await params;
  return budgetPdfResponse({ planId: id, userId: session.user.id });
}
