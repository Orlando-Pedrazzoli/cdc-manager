// 📄 src/lib/occupancy.ts
// =============================================================================
// CDC Manager — Ocupação da agenda por médico (8.ª ronda/15, Victor 17/11/2026)
// -----------------------------------------------------------------------------
// "Percentagem de horas ocupadas por turno. Tempo de cadeira. Taxa de
// cancelamentos e faltas. Para quê: responder com números quando um médico
// diz que 'não tem pacientes'."
//
// Definições usadas:
//   · Turno = cada período do horário do médico nesse dia (09:00–16:00,
//     16:00–23:00, 10:00–13:00…), já com as aberturas e fechos manuais.
//   · Horas ocupadas = minutos de marcações que contam (por confirmar,
//     confirmada, chegou, em consulta, concluída) dentro do turno.
//   · Tempo de cadeira = tempo real das consultas concluídas (do início ao
//     fim registados); quando não há registo, a duração marcada.
//   · Faltas e cancelamentos = sobre todas as marcações do período, sem
//     contar as remarcadas.
// Contas puras, sem BD nem React, para serem testadas.
// =============================================================================

export interface OccRange {
  start: number; // minutos desde as 00:00
  end: number;
}

export interface OccAppointment {
  day: string; // 'YYYY-MM-DD'
  startMin: number;
  endMin: number;
  status: string;
  rescheduled: boolean;
  /** Tempo real da consulta em minutos, se foi registado */
  chairMin: number | null;
}

export interface OccShiftRow {
  /** "09:00–16:00" */
  label: string;
  days: number;
  availableMin: number;
  bookedMin: number;
  /** 0–100; null sem horas disponíveis */
  pct: number | null;
}

export interface DoctorOccupancy {
  availableMin: number;
  bookedMin: number;
  pct: number | null;
  shifts: OccShiftRow[];
  chairMin: number;
  appointments: number;
  noShows: number;
  cancellations: number;
  /** (faltas + cancelamentos) / marcações, 0–100; null sem marcações */
  lostPct: number | null;
}

/** Estados que ocupam a cadeira */
const BLOCKING = new Set(['pending', 'confirmed', 'checked-in', 'in-progress', 'completed']);

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const shiftLabel = (r: OccRange) => `${hhmm(r.start)}–${hhmm(r.end)}`;

export function overlapMin(a: OccRange, b: OccRange): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : null;

/**
 * Ocupação de um médico num período.
 * @param rangesByDay turnos do médico em cada dia do período (dias sem turno
 *   não entram)
 */
export function doctorOccupancy(
  rangesByDay: Record<string, OccRange[]>,
  appointments: OccAppointment[],
): DoctorOccupancy {
  const shifts = new Map<string, OccShiftRow>();
  const apptsByDay = new Map<string, OccAppointment[]>();
  for (const a of appointments) {
    apptsByDay.set(a.day, [...(apptsByDay.get(a.day) ?? []), a]);
  }

  let availableMin = 0;
  let bookedMin = 0;
  for (const [day, ranges] of Object.entries(rangesByDay)) {
    const blocking = (apptsByDay.get(day) ?? []).filter(a => BLOCKING.has(a.status));
    for (const r of ranges) {
      const len = r.end - r.start;
      if (len <= 0) continue;
      const label = shiftLabel(r);
      const row =
        shifts.get(label) ??
        ({ label, days: 0, availableMin: 0, bookedMin: 0, pct: null } as OccShiftRow);
      const booked = Math.min(
        len,
        blocking.reduce(
          (s, a) => s + overlapMin(r, { start: a.startMin, end: a.endMin }),
          0,
        ),
      );
      row.days += 1;
      row.availableMin += len;
      row.bookedMin += booked;
      shifts.set(label, row);
      availableMin += len;
      bookedMin += booked;
    }
  }
  for (const row of shifts.values()) row.pct = pct(row.bookedMin, row.availableMin);

  const counted = appointments.filter(a => !(a.status === 'cancelled' && a.rescheduled));
  const noShows = counted.filter(a => a.status === 'no-show').length;
  const cancellations = counted.filter(a => a.status === 'cancelled').length;
  const chairMin = appointments
    .filter(a => a.status === 'completed')
    .reduce((s, a) => s + (a.chairMin ?? Math.max(0, a.endMin - a.startMin)), 0);

  return {
    availableMin,
    bookedMin,
    pct: pct(bookedMin, availableMin),
    shifts: [...shifts.values()].sort((a, b) => a.label.localeCompare(b.label)),
    chairMin,
    appointments: counted.length,
    noShows,
    cancellations,
    lostPct: counted.length ? Math.round(((noShows + cancellations) / counted.length) * 100) : null,
  };
}

/** "37 h 30" */
export function formatHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
