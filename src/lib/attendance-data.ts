// 📄 src/lib/attendance-data.ts
// =============================================================================
// CDC Manager — Faltas dos pacientes de um dia, para o aviso no balcão
// -----------------------------------------------------------------------------
// 8.ª ronda/11 (Victor, 17/11/2026): "esse aviso vai funcionar melhor direto
// no balcão […] a pessoa recebendo essa mensagem vai gerar muita confusão e
// desconforto; ali no balcão, as receps conseguem explicar e conduzir o
// paciente". Não se envia nada ao paciente: a receção vê o aviso quando abre
// a marcação na agenda.
//
// Uma só leitura para todos os pacientes do dia. Mesma janela e mesmas contas
// da ficha rápida (lib/attendance.ts, ALERT_ATTENDANCE_MONTHS).
// =============================================================================

import Appointment from '@/models/Appointment';
import { attendanceWarning, summarizeAttendance } from '@/lib/attendance';
import type { AttendanceInput } from '@/lib/attendance';
import { ALERT_ATTENDANCE_MONTHS } from '@/lib/patient-alerts';

export interface CounterNotice {
  /** "2 faltas sem aviso · 1 cancelamento com menos de 24 h" */
  text: string;
  /** Data da última falta, dd/mm/aaaa (null = só cancelamentos) */
  lastNoShowLabel: string | null;
}

const dateFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

/** Agrupa as marcações por paciente e devolve só quem tem algo a assinalar */
export function counterNoticesFrom(
  rows: (AttendanceInput & { patientId: string })[],
): Map<string, CounterNotice> {
  const byPatient = new Map<string, AttendanceInput[]>();
  for (const r of rows) {
    const list = byPatient.get(r.patientId);
    if (list) list.push(r);
    else byPatient.set(r.patientId, [r]);
  }
  const out = new Map<string, CounterNotice>();
  for (const [patientId, list] of byPatient) {
    const summary = summarizeAttendance(list);
    const text = attendanceWarning(summary);
    if (!text) continue;
    out.set(patientId, {
      text,
      lastNoShowLabel: summary.lastNoShowAt
        ? dateFmt.format(summary.lastNoShowAt)
        : null,
    });
  }
  return out;
}

/** Nunca falha: sem dados, a agenda abre sem o aviso */
export async function loadCounterNotices(
  patientIds: unknown[],
): Promise<Map<string, CounterNotice>> {
  const ids = Array.from(new Set(patientIds.filter(Boolean).map(String)));
  if (ids.length === 0) return new Map();
  const since = new Date();
  since.setMonth(since.getMonth() - ALERT_ATTENDANCE_MONTHS);
  try {
    const appts = await Appointment.find({
      patientId: { $in: ids },
      startAt: { $gte: since },
      status: { $in: ['no-show', 'cancelled'] },
    })
      .select('patientId status startAt cancelledAt cancelledBy rescheduledToId')
      .lean();
    return counterNoticesFrom(
      appts.map(a => ({
        patientId: String(a.patientId),
        status: a.status as string,
        startAt: a.startAt as Date,
        cancelledAt: (a.cancelledAt as Date | null) ?? null,
        cancelledBy: (a.cancelledBy as string | null) ?? null,
        rescheduledToId: a.rescheduledToId,
      })),
    );
  } catch {
    return new Map();
  }
}
