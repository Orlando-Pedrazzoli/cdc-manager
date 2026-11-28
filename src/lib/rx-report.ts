// 📄 src/lib/rx-report.ts
// =============================================================================
// CDC Manager — Relatório da radiografia (ponto 31 da Giulia, 27/11/2026)
// -----------------------------------------------------------------------------
// "A descrição do ato é «realização e interpretação de radiografia». Se
// cobramos a interpretação, devia existir registo dela." O médico que pediu
// a radiografia escreve o que foi detetado; fica no pedido e sai em PDF para
// os documentos do paciente. Funções puras (com testes); a emissão vive em
// lib/rx-report-issue.ts.
// =============================================================================

export const RX_REPORT_MIN = 5;
export const RX_REPORT_MAX = 2000;

/** Normaliza o texto escrito pelo médico (quebras de linha, espaços) */
export function cleanRxReportText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Erro de validação do texto, ou null */
export function rxReportTextError(text: string): string | null {
  if (text.length < RX_REPORT_MIN) return 'Escreva o que foi detetado na radiografia.';
  if (text.length > RX_REPORT_MAX)
    return `O relatório tem de ter no máximo ${RX_REPORT_MAX} caracteres.`;
  return null;
}

/** Porque é que este pedido não pode (ainda) ter relatório, ou null */
export function rxReportBlock(req: {
  status: string;
  hasReport: boolean;
}): string | null {
  if (req.status === 'cancelled') return 'Pedido cancelado — não tem relatório.';
  if (req.hasReport) return 'Esta radiografia já tem relatório.';
  if (req.status !== 'done')
    return 'O relatório escreve-se depois de a radiografia estar concluída.';
  return null;
}

export function rxReportTitle(modalityLabel: string, teeth: string[]): string {
  return `Relatório de radiografia — ${modalityLabel}${
    teeth.length ? ` (dentes ${teeth.join(', ')})` : ''
  }`;
}

/** Corpo do PDF: identificação do exame + o que foi detetado */
export function rxReportBody(p: {
  patientName: string;
  processNumber?: number | null;
  modalityLabel: string;
  teeth: string[];
  examDateLabel: string;
  requestNotes?: string | null;
  findings: string;
}): string {
  const id = [
    'IDENTIFICAÇÃO',
    `Paciente: ${p.patientName}${p.processNumber ? ` (processo n.º ${p.processNumber})` : ''}`,
    `Exame: ${p.modalityLabel}${p.teeth.length ? ` — dentes ${p.teeth.join(', ')}` : ''}`,
    `Data do exame: ${p.examDateLabel}`,
  ];
  const notes = (p.requestNotes ?? '').trim();
  if (notes) id.push(`Motivo do pedido: ${notes}`);
  return `${id.join('\n')}\n\nINTERPRETAÇÃO\n\n${p.findings}`;
}
