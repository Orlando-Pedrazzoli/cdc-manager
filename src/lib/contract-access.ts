// 📄 src/lib/contract-access.ts
// =============================================================================
// CDC Manager — O médico vê contratos? (consulta à BD)
// Regra em lib/template-access.ts: vê os contratos da ficha se estiver
// autorizado em pelo menos um modelo de contrato ativo.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import DocumentTemplate from '@/models/DocumentTemplate';
import { contractAccessQuery } from '@/lib/template-access';

export async function doctorSeesContracts(
  doctorId: string | null | undefined,
): Promise<boolean> {
  if (!doctorId || !/^[0-9a-fA-F]{24}$/.test(doctorId)) return false;
  await dbConnect();
  return !!(await DocumentTemplate.exists(contractAccessQuery(doctorId)));
}
