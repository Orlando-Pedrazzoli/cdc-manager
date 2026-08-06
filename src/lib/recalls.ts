// 📄 src/lib/recalls.ts
// =============================================================================
// CDC Manager — Recalls: geração e cancelamento de ciclos (server-side)
// -----------------------------------------------------------------------------
// Chamado nos DOIS pontos onde um ato fica 'completed':
//   · actions/procedures.ts → addProcedureAction (registo direto na consulta)
//   · actions/plans.ts → executePlanItemAction (execução de item de plano)
//
// REGRAS:
//   · Só atos cujo TreatmentType tem recallIntervalMonths geram ciclo.
//   · dueAt = executedAt + N meses (com clamp de fim de mês: 31 jan + 1 mês
//     → 28/29 fev, nunca 2/3 mar).
//   · UM ciclo aberto por paciente×ato: ciclos abertos anteriores
//     (scheduled/due/contacted) do mesmo par são marcados 'dismissed' —
//     o ato mais recente reinicia a contagem (fez higiene hoje → o próximo
//     convite conta a partir de hoje, não do ciclo antigo).
//   · Recall.clinicId = clínica do ato ORIGINAL (regra multi-clínica).
//   · BEST-EFFORT: nunca lança — falhar a criação do recall não pode
//     reverter nem sujar o registo do ato (mesmo contrato do email Resend).
//
// NOTA: este ficheiro importa models — NÃO importar em componentes 'use
// client' (regra async_hooks). addMonthsClamped é pura e testável.
// =============================================================================

import Recall from '@/models/Recall';
import TreatmentType from '@/models/TreatmentType';
import Patient from '@/models/Patient';

// -----------------------------------------------------------------------------
// Pura: soma meses com clamp ao último dia do mês de destino (UTC)
// -----------------------------------------------------------------------------
export function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const target = m + months;
  // Dia 0 do mês seguinte ao alvo = último dia do mês alvo
  const lastDayOfTarget = new Date(Date.UTC(y, target + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      target,
      Math.min(d, lastDayOfTarget),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

// -----------------------------------------------------------------------------
// Gerar ciclo na conclusão de um ato (best-effort, nunca lança)
// -----------------------------------------------------------------------------
export async function spawnRecallForProcedure(params: {
  procedureId: string;
  clinicId: string;
  patientId: string;
  doctorId: string | null;
  treatmentTypeId: string;
  executedAt: Date;
}): Promise<{ created: boolean }> {
  try {
    const treatment = await TreatmentType.findById(params.treatmentTypeId)
      .select('recallIntervalMonths')
      .lean();
    const months = treatment?.recallIntervalMonths ?? null;
    if (!months) return { created: false }; // ato sem ciclo de recall

    // Nunca convidar falecidos nem fichas não-ativas (anonimizadas/inativas)
    const patient = await Patient.findById(params.patientId)
      .select('deceasedAt status')
      .lean();
    if (!patient || patient.deceasedAt || patient.status !== 'active') {
      return { created: false };
    }

    // O ato mais recente substitui ciclos abertos do mesmo paciente×ato
    await Recall.updateMany(
      {
        patientId: params.patientId,
        treatmentTypeId: params.treatmentTypeId,
        status: { $in: ['scheduled', 'due', 'contacted'] },
      },
      { status: 'dismissed' },
    );

    await Recall.create({
      clinicId: params.clinicId,
      patientId: params.patientId,
      treatmentTypeId: params.treatmentTypeId,
      sourceProcedureId: params.procedureId,
      doctorId: params.doctorId,
      dueAt: addMonthsClamped(params.executedAt, months),
      status: 'scheduled',
    });
    return { created: true };
  } catch (err) {
    // Best-effort: o ato já está registado; recall falhado só se loga
    console.error('[recalls] spawnRecallForProcedure:', err);
    return { created: false };
  }
}

// -----------------------------------------------------------------------------
// Cancelar ciclo quando o ato de origem é anulado (best-effort)
// -----------------------------------------------------------------------------
export async function cancelRecallForProcedure(
  procedureId: string,
): Promise<void> {
  try {
    await Recall.updateMany(
      {
        sourceProcedureId: procedureId,
        status: { $in: ['scheduled', 'due', 'contacted'] },
      },
      { status: 'dismissed' },
    );
  } catch (err) {
    console.error('[recalls] cancelRecallForProcedure:', err);
  }
}
