// 📄 src/actions/agenda.ts
// =============================================================================
// CDC Manager — Server Actions: apoio à agenda (leitura)
// -----------------------------------------------------------------------------
// getFreeSlotsAction: slots livres de um médico para o modal de nova
// marcação (chamado quando médico+ato+data estão escolhidos). Balcão →
// onlineRules: false (a receção não está sujeita à antecedência mínima).
// =============================================================================

'use server';

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { computeFreeSlots } from '@/lib/availability';

export async function getFreeSlotsAction(params: {
  clinicId: string;
  doctorId: string;
  treatmentTypeId: string;
  date: string; // 'YYYY-MM-DD'
}): Promise<{ start: string }[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    return [];
  }
  const ok =
    /^[0-9a-fA-F]{24}$/.test(params.clinicId) &&
    /^[0-9a-fA-F]{24}$/.test(params.doctorId) &&
    /^[0-9a-fA-F]{24}$/.test(params.treatmentTypeId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.date);
  if (!ok) return [];

  await dbConnect();
  const slots = await computeFreeSlots({
    clinicId: params.clinicId,
    doctorId: params.doctorId,
    treatmentTypeId: params.treatmentTypeId,
    dateFrom: params.date,
    dateTo: params.date,
    onlineRules: false, // balcão
  });
  return slots.map(s => ({ start: s.start }));
}
