// 📄 src/lib/patient-alerts.ts
// =============================================================================
// CDC Manager — Avisos do paciente (7.ª ronda/B5)
// -----------------------------------------------------------------------------
// Victor (13/11/2026): "Colocar ao tentar fazer a marcação, e ao abrir o
// odontograma, um pop-up com observações importantes sobre o paciente, por
// exemplo: 'Atenção paciente tem X valor para ser faturado' / 'falta de X
// vezes no período de X tempo' / 'encaminhar para o Dr. Y para avaliação'.
// Que todos possam editar e colocar estas observações."
//
// Dois tipos de aviso:
//   · automáticos — calculados do que o sistema já guarda (bloqueio, valores
//     por faturar e em dívida, faltas nos últimos 12 meses);
//   · a observação escrita pela equipa (Patient.notes, o mesmo "alerta
//     administrativo" da ficha e da ficha rápida).
// Função pura, para ser testada sem base de dados.
// =============================================================================

export const ALERT_ATTENDANCE_MONTHS = 12;
export const ALERT_NOTE_MAX = 2000;

export type PatientAlertLevel = 'danger' | 'warning' | 'info';

export interface PatientAlert {
  kind: 'blocked' | 'note' | 'unbilled' | 'due' | 'attendance';
  level: PatientAlertLevel;
  text: string;
}

export interface PatientAlertInput {
  blockReason?: string | null;
  note?: string | null;
  /** Atos realizados ainda sem fatura */
  unbilledCents?: number;
  unbilledCount?: number;
  /** Faturas emitidas com valor por pagar */
  dueCents?: number;
  /** Nos últimos ALERT_ATTENDANCE_MONTHS meses */
  noShows?: number;
  lateCancels?: number;
}

const eur = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );

export function buildPatientAlerts(input: PatientAlertInput): PatientAlert[] {
  const out: PatientAlert[] = [];
  const block = (input.blockReason ?? '').trim();
  if (block) {
    out.push({
      kind: 'blocked',
      level: 'danger',
      text: `Paciente bloqueado para marcações pela gestão: ${block}`,
    });
  }
  const note = (input.note ?? '').trim();
  if (note) out.push({ kind: 'note', level: 'warning', text: note });

  const unbilled = input.unbilledCents ?? 0;
  if (unbilled > 0) {
    const n = input.unbilledCount ?? 0;
    out.push({
      kind: 'unbilled',
      level: 'warning',
      text: `Tem ${eur(unbilled)} por faturar${n > 0 ? ` (${n} ato${n === 1 ? '' : 's'} realizado${n === 1 ? '' : 's'})` : ''}.`,
    });
  }
  const due = input.dueCents ?? 0;
  if (due > 0) {
    out.push({
      kind: 'due',
      level: 'warning',
      text: `Tem ${eur(due)} em dívida de faturas já emitidas.`,
    });
  }
  const noShows = input.noShows ?? 0;
  const late = input.lateCancels ?? 0;
  if (noShows > 0 || late > 0) {
    const parts: string[] = [];
    if (noShows > 0) parts.push(`faltou ${noShows} vez${noShows === 1 ? '' : 'es'} sem avisar`);
    if (late > 0) parts.push(`cancelou ${late} vez${late === 1 ? '' : 'es'} com menos de 24 h`);
    out.push({
      kind: 'attendance',
      level: noShows >= 2 ? 'warning' : 'info',
      text: `Nos últimos ${ALERT_ATTENDANCE_MONTHS} meses ${parts.join(' e ')}.`,
    });
  }
  return out;
}
