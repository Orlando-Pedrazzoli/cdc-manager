// 📄 src/lib/agenda-colors.ts
// =============================================================================
// CDC Manager — Cores da marcação por ESTADO (7.ª ronda/A2 e A3)
// -----------------------------------------------------------------------------
// Victor (12/11/2026): "Diferenciar as marcações por cores, de acordo com o
// estado. Atualmente são todas iguais. Cores seguindo a lógica de semáforo:
// Cancelada — vermelho · Por confirmar — amarelo · Confirmada — verde ·
// Falta — laranja · Concluído — azul".
//
// O que o Victor não definiu, decidido aqui:
//   · Chegou (sala de espera) — roxo
//   · Em consulta — turquesa
//   · Consulta terminada mas ainda POR FECHAR na receção — cinzento. Só fica
//     azul ("Concluído") depois do "Tudo OK" (A3), para a receção ver de
//     relance o que falta fechar.
// A cor do médico continua na barra lateral esquerda do cartão e no
// cabeçalho da coluna.
//
// Funções puras, sem BD nem React, para serem testadas.
// =============================================================================

export type AgendaColorKey =
  | 'pending'
  | 'confirmed'
  | 'checked-in'
  | 'in-progress'
  | 'awaiting-close'
  | 'closed'
  | 'cancelled'
  | 'no-show';

export interface AgendaColor {
  key: AgendaColorKey;
  /** Rótulo da legenda e do cartão */
  label: string;
  /** Fundo do cartão */
  bg: string;
  /** Contorno do cartão e cor da pastilha da legenda */
  border: string;
  /** Texto forte sobre o fundo */
  fg: string;
}

export const AGENDA_COLORS: Record<AgendaColorKey, AgendaColor> = {
  pending: { key: 'pending', label: 'Por confirmar', bg: '#FFF1B8', border: '#D4A300', fg: '#6B5200' },
  confirmed: { key: 'confirmed', label: 'Confirmada', bg: '#D9F2E1', border: '#1F9D55', fg: '#125C32' },
  'checked-in': { key: 'checked-in', label: 'Chegou', bg: '#E9DDFB', border: '#7A3FD0', fg: '#47217F' },
  'in-progress': { key: 'in-progress', label: 'Em consulta', bg: '#D3F1F1', border: '#0E8C8C', fg: '#075353' },
  'awaiting-close': { key: 'awaiting-close', label: 'Por fechar', bg: '#E6EAF2', border: '#7B859C', fg: '#3A4257' },
  closed: { key: 'closed', label: 'Concluído', bg: '#D6E4FF', border: '#2F5BD3', fg: '#1B3A8F' },
  cancelled: { key: 'cancelled', label: 'Cancelada', bg: '#FBD9D5', border: '#D92D20', fg: '#8A1C13' },
  'no-show': { key: 'no-show', label: 'Falta', bg: '#FFE0BF', border: '#E0720B', fg: '#8A4300' },
};

/** Ordem da legenda: o percurso normal da marcação, depois as exceções */
export const AGENDA_LEGEND: AgendaColorKey[] = [
  'pending',
  'confirmed',
  'checked-in',
  'in-progress',
  'awaiting-close',
  'closed',
  'no-show',
  'cancelled',
];

/**
 * Cor do cartão para um estado da marcação. `closed` = a receção já deu o
 * "Tudo OK" (Appointment.closedAt preenchido). Estado desconhecido cai em
 * "Por confirmar", para nunca ficar sem cor.
 */
export function agendaColor(status: string, closed = false): AgendaColor {
  if (status === 'completed') {
    return closed ? AGENDA_COLORS.closed : AGENDA_COLORS['awaiting-close'];
  }
  if (status in AGENDA_COLORS) {
    return AGENDA_COLORS[status as AgendaColorKey];
  }
  return AGENDA_COLORS.pending;
}

/** Rótulo do estado para o cartão e o painel ("Concluída · por fechar") */
export function agendaStatusLabel(status: string, closed = false): string {
  return agendaColor(status, closed).label;
}
