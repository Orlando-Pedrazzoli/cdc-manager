// 📄 src/lib/document-merge.ts
// =============================================================================
// CDC Manager — Substituição de placeholders {{...}} nos modelos (Fase 5A)
// Puro; testado em scripts/tests/document-merge.test.ts.
// =============================================================================

export type MergeValues = Record<string, string | null | undefined>;

/** Substitui {{chave}}; chaves sem valor ficam "________" para preencher */
export function mergeTemplate(body: string, values: MergeValues): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const v = values[key];
    return v == null || v === '' ? '________' : String(v);
  });
}

/** Chaves usadas por um modelo */
export function placeholdersIn(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g))
    out.add(m[1]);
  return Array.from(out);
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
export function longDatePt(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${Number(get('day'))} de ${MONTHS[Number(get('month')) - 1]} de ${get('year')}`;
}
export function shortDatePt(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}
export function timePt(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

/**
 * O título do modelo já vai no cabeçalho do PDF: se a 1.ª linha do texto for
 * esse título em maiúsculas (seguida de linha em branco), retira-se para não
 * repetir. Usado no ecrã de emissão e, nos comprovativos de presença, também
 * no servidor (o texto é refeito lá — 9.ª ronda, ponto 20).
 */
export function stripTitleLine(body: string): string {
  const lines = body.split('\n');
  const first = lines[0]?.trim() ?? '';
  return first &&
    first === first.toUpperCase() &&
    first.length < 80 &&
    lines[1]?.trim() === ''
    ? lines.slice(2).join('\n')
    : body;
}
