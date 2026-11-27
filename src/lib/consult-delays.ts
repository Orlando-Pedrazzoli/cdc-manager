// 📄 src/lib/consult-delays.ts
// =============================================================================
// CDC Manager — Atrasos das consultas: contas puras
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta A3): "[A barra] termina no horário previsto do
// agendamento. A partir daí começa a contar tempo de atraso. Assim consigo
// medir quanto tempo de atraso o médico teve. A leitura deve permitir filtrar
// por dia/semana/mês e detalhar por paciente ou tratamento."
//
// Ficam medidas as duas coisas, para servir qualquer leitura:
//   · ATRASO (o que o Victor descreve) = minutos para lá do FIM MARCADO até a
//     consulta ser concluída;
//   · INÍCIO TARDIO = minutos entre a hora marcada e o médico chamar o
//     paciente (informativo: pode ser o paciente que chegou tarde).
// Só entram consultas concluídas, com início e fim reais registados.
// Sem BD nem React, para ser testada.
// =============================================================================

export interface ConsultTimes {
  startMs: number; // hora marcada
  endMs: number; // fim marcado
  startedMs: number | null; // médico chamou o paciente
  completedMs: number | null; // consulta concluída
  /** receção marcou "Chegou" (para saber se o início tardio foi do paciente) */
  checkedInMs?: number | null;
}

export interface ConsultDelay {
  /** minutos para lá do fim marcado (0 = acabou a horas) */
  overrunMin: number;
  /** minutos entre a hora marcada e o início real (0 = começou a horas) */
  lateStartMin: number;
  /** minutos que o PACIENTE chegou depois da hora marcada (0 = a horas) */
  patientLateMin: number;
  /** duração real, em minutos */
  actualMin: number;
  /** duração marcada, em minutos */
  plannedMin: number;
}

const toMin = (ms: number) => Math.max(0, Math.round(ms / 60_000));

/** null quando a consulta não tem início e fim reais */
export function consultDelay(t: ConsultTimes): ConsultDelay | null {
  if (t.startedMs == null || t.completedMs == null) return null;
  if (t.completedMs < t.startedMs) return null;
  return {
    overrunMin: toMin(t.completedMs - t.endMs),
    lateStartMin: toMin(t.startedMs - t.startMs),
    patientLateMin: t.checkedInMs == null ? 0 : toMin(t.checkedInMs - t.startMs),
    actualMin: toMin(t.completedMs - t.startedMs),
    plannedMin: toMin(t.endMs - t.startMs),
  };
}

export interface DelaySummary {
  key: string;
  consults: number;
  /** consultas que passaram do fim marcado */
  delayed: number;
  /** soma dos minutos de atraso */
  overrunMin: number;
  /** média por consulta atrasada; null se nenhuma se atrasou */
  avgOverrunMin: number | null;
  /** maior atraso do grupo */
  maxOverrunMin: number;
  /** soma dos minutos de início tardio */
  lateStartMin: number;
  // Victor, 27/11 (A3): "os dois, contados em separado" — o atraso para
  // começar tem as suas próprias contas, como o tempo excedido
  /** consultas que começaram depois da hora marcada */
  lateStarts: number;
  /** média por consulta que começou tarde; null se nenhuma */
  avgLateStartMin: number | null;
  /** maior atraso para começar do grupo */
  maxLateStartMin: number;
  /** % das consultas que acabaram depois da hora */
  delayedPct: number | null;
}

/** Resumo por grupo (médico, tratamento, paciente…), do maior atraso ao menor */
export function summarizeDelays(
  rows: { key: string; delay: ConsultDelay }[],
): DelaySummary[] {
  const map = new Map<string, DelaySummary>();
  for (const r of rows) {
    let s = map.get(r.key);
    if (!s) {
      s = {
        key: r.key,
        consults: 0,
        delayed: 0,
        overrunMin: 0,
        avgOverrunMin: null,
        maxOverrunMin: 0,
        lateStartMin: 0,
        lateStarts: 0,
        avgLateStartMin: null,
        maxLateStartMin: 0,
        delayedPct: null,
      };
      map.set(r.key, s);
    }
    s.consults += 1;
    s.lateStartMin += r.delay.lateStartMin;
    if (r.delay.lateStartMin > 0) {
      s.lateStarts += 1;
      s.maxLateStartMin = Math.max(s.maxLateStartMin, r.delay.lateStartMin);
    }
    if (r.delay.overrunMin > 0) {
      s.delayed += 1;
      s.overrunMin += r.delay.overrunMin;
      s.maxOverrunMin = Math.max(s.maxOverrunMin, r.delay.overrunMin);
    }
  }
  for (const s of map.values()) {
    s.avgOverrunMin = s.delayed > 0 ? Math.round(s.overrunMin / s.delayed) : null;
    s.avgLateStartMin =
      s.lateStarts > 0 ? Math.round(s.lateStartMin / s.lateStarts) : null;
    s.delayedPct = s.consults > 0 ? Math.round((s.delayed / s.consults) * 100) : null;
  }
  return [...map.values()].sort(
    (a, b) => b.overrunMin - a.overrunMin || b.consults - a.consults,
  );
}

/** "1 h 05 min" / "12 min" */
export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export type DelayPeriod = 'dia' | 'semana' | 'mes';

/**
 * Limites [de, até[ do período que contém `day` ("YYYY-MM-DD", dia civil de
 * Lisboa), como datas civis. A semana vai de segunda a domingo.
 */
export function delayPeriodRange(
  day: string,
  period: DelayPeriod,
): { from: string; to: string } {
  const [y, m, d] = day.split('-').map(Number);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const at = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd));
  if (period === 'dia') return { from: day, to: iso(at(y, m, d + 1)) };
  if (period === 'mes') return { from: iso(at(y, m, 1)), to: iso(at(y, m + 1, 1)) };
  const dow = (at(y, m, d).getUTCDay() + 6) % 7; // 0 = segunda
  return { from: iso(at(y, m, d - dow)), to: iso(at(y, m, d - dow + 7)) };
}

/** Desloca o dia de referência um período para trás ou para a frente */
export function shiftDelayPeriod(day: string, period: DelayPeriod, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt =
    period === 'mes'
      ? new Date(Date.UTC(y, m - 1 + delta, 1))
      : new Date(Date.UTC(y, m - 1, d + delta * (period === 'semana' ? 7 : 1)));
  return dt.toISOString().slice(0, 10);
}
