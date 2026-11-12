// 📄 src/lib/attendance.ts
// =============================================================================
// CDC Manager — Faltas e cancelamentos por paciente (Victor, áudio de 12/11/2026)
// -----------------------------------------------------------------------------
// "Ter um rasto de quantas pessoas faltaram, ou daquela pessoa individualmente:
// quantas vezes ela já faltou sem nos avisar. […] Para o ano que vem vou adotar
// uma taxa para remarcação de consulta quando ela não é justificada com pelo
// menos 24 horas de antecedência. […] Ter um controle, quando a gente for
// remarcar esse paciente, se ele é faltoso ou não."
//
// Duas contas, só com dados que o sistema já guarda:
//   · FALTA — marcação em estado 'no-show' (não apareceu, não avisou)
//   · CANCELAMENTO EM CIMA DA HORA — cancelada PELO PACIENTE com menos de
//     24 h de antecedência (cancelledAt vs startAt). Remarcações e
//     cancelamentos da clínica não contam.
// A taxa de 2027 ainda não existe; estas contas são a base dela.
// Funções PURAS — testadas em scripts/tests/attendance.test.ts.
// =============================================================================

export const LATE_CANCEL_HOURS = 24;

export interface AttendanceInput {
  status: string;
  startAt: Date;
  cancelledAt?: Date | null;
  cancelledBy?: string | null;
  rescheduledToId?: unknown;
}

export interface AttendanceSummary {
  /** Faltas sem aviso */
  noShows: number;
  /** Cancelamentos do paciente com menos de 24 h */
  lateCancels: number;
  /** Consultas realizadas */
  completed: number;
  /** Data da falta mais recente */
  lastNoShowAt: Date | null;
}

/** Cancelada pelo paciente com menos de 24 h de antecedência? */
export function isLateCancellation(a: AttendanceInput): boolean {
  if (a.status !== 'cancelled' || a.cancelledBy !== 'patient') return false;
  if (a.rescheduledToId) return false; // remarcou — não é desistência
  if (!a.cancelledAt) return false;
  const noticeMs = a.startAt.getTime() - a.cancelledAt.getTime();
  return noticeMs < LATE_CANCEL_HOURS * 3_600_000;
}

export function summarizeAttendance(appts: AttendanceInput[]): AttendanceSummary {
  const out: AttendanceSummary = {
    noShows: 0,
    lateCancels: 0,
    completed: 0,
    lastNoShowAt: null,
  };
  for (const a of appts) {
    if (a.status === 'no-show') {
      out.noShows++;
      if (!out.lastNoShowAt || a.startAt > out.lastNoShowAt) {
        out.lastNoShowAt = a.startAt;
      }
    } else if (a.status === 'completed') {
      out.completed++;
    } else if (isLateCancellation(a)) {
      out.lateCancels++;
    }
  }
  return out;
}

/** Texto curto para a receção; null = nada a assinalar */
export function attendanceWarning(s: AttendanceSummary): string | null {
  const parts: string[] = [];
  if (s.noShows > 0) {
    parts.push(`${s.noShows} falta${s.noShows === 1 ? '' : 's'} sem aviso`);
  }
  if (s.lateCancels > 0) {
    parts.push(
      `${s.lateCancels} cancelamento${s.lateCancels === 1 ? '' : 's'} com menos de ${LATE_CANCEL_HOURS} h`,
    );
  }
  return parts.length ? parts.join(' · ') : null;
}

// -----------------------------------------------------------------------------
// Cancelada à vista na grelha?
// -----------------------------------------------------------------------------
// Regra do Victor: a cancelada "fica lá, ocupando aquele horário, e só sai
// dali quando se vai marcar outra pessoa". Fica à vista enquanto:
//   · não foi retirada à mão (removedFromGridAt), e
//   · não foi remarcada (o paciente já está noutro horário), e
//   · nenhuma marcação ativa do mesmo médico ocupa esse tempo (assim as
//     canceladas antigas, cujo horário já foi reaproveitado, não reaparecem).
// -----------------------------------------------------------------------------
export interface GridCancelInput {
  id: string;
  doctorId: string | null;
  startMs: number;
  endMs: number;
  status: string;
  removedFromGrid: boolean;
  rescheduled: boolean;
}

export function cancelledVisibleIds(appts: GridCancelInput[]): Set<string> {
  const live = appts.filter(
    a => a.status !== 'cancelled' && a.status !== 'no-show',
  );
  const out = new Set<string>();
  for (const a of appts) {
    if (a.status !== 'cancelled' || a.removedFromGrid || a.rescheduled) continue;
    const taken = live.some(
      l =>
        l.doctorId === a.doctorId &&
        l.startMs < a.endMs &&
        l.endMs > a.startMs,
    );
    if (!taken) out.add(a.id);
  }
  return out;
}
