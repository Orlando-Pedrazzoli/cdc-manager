// 📄 src/lib/certificate-times.ts
// =============================================================================
// CDC Manager — Horas dos comprovativos de presença: regra pura
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (respostas A4 e A5 aos "Ajustes de 17 e 18/11"):
//   A4 — "entrada = hora em que a receção marca 'Chegou'; saída = hora em que
//        a faturação é fechada com 'Tudo OK'. Assim fica registado o tempo
//        real que o paciente esteve na clínica."
//   A5 — "se não houver entrada e saída registadas, o sistema não deixa
//        emitir. Nesses casos fazemos manualmente."
// Sem BD nem React, para ser testada (scripts/tests/ronda-9b.test.ts).
// =============================================================================

export interface CertificateAppointment {
  startAt?: Date | null;
  endAt?: Date | null;
  /** Receção marcou "Chegou" */
  checkedInAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  /** Receção fechou o atendimento com "Tudo OK" */
  closedAt?: Date | null;
}

export interface CertificateTimes {
  /** Hora de entrada a imprimir (null = sem consulta) */
  entry: Date | null;
  /** Hora de saída a imprimir (null = sem consulta) */
  exit: Date | null;
  /** true = as duas horas vêm do registo ("Chegou" e "Tudo OK") */
  recorded: boolean;
  /** Porque não pode ser emitido um comprovativo (null = pode) */
  blockReason: string | null;
}

export const CERTIFICATE_MANUAL_HINT =
  'Nestes casos o comprovativo faz-se à mão.';

/**
 * Horas de um comprovativo de presença. `entry`/`exit` têm sempre um valor
 * quando há consulta (os modelos que não são comprovativos continuam a poder
 * usar {{consulta.inicio}} e {{consulta.fim}}); `recorded` e `blockReason`
 * dizem se um COMPROVATIVO pode sair.
 */
export function certificateTimes(
  appt: CertificateAppointment | null | undefined,
): CertificateTimes {
  if (!appt) {
    return {
      entry: null,
      exit: null,
      recorded: false,
      blockReason: 'Escolha a consulta a que o comprovativo se refere.',
    };
  }
  const entry = appt.checkedInAt ?? appt.startedAt ?? appt.startAt ?? null;
  const exit = appt.closedAt ?? appt.completedAt ?? appt.endAt ?? null;

  let blockReason: string | null = null;
  if (!appt.checkedInAt && !appt.closedAt) {
    blockReason = `Esta consulta não tem a entrada ("Chegou") nem a saída ("Tudo OK") registadas no sistema. ${CERTIFICATE_MANUAL_HINT}`;
  } else if (!appt.checkedInAt) {
    blockReason = `Esta consulta não tem a entrada registada: a receção não marcou "Chegou". ${CERTIFICATE_MANUAL_HINT}`;
  } else if (!appt.closedAt) {
    blockReason =
      'Esta consulta ainda não tem a saída registada: o comprovativo só pode ser emitido depois de a receção fechar o atendimento com "Tudo OK".';
  } else if (appt.closedAt.getTime() <= appt.checkedInAt.getTime()) {
    blockReason = `As horas registadas nesta consulta não são coerentes (saída antes da entrada). ${CERTIFICATE_MANUAL_HINT}`;
  }
  return { entry, exit, recorded: blockReason === null, blockReason };
}
