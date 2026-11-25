// 📄 src/lib/template-labels.ts
// =============================================================================
// CDC Manager — "N.º de processo" → "N.º do paciente" no texto dos modelos
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta B1): "Podemos mudar a designação 'N.º de
// processo' para 'N.º do paciente'?" Os ecrãs mudaram no código; os modelos
// de documentos estão gravados na base e precisam de
// scripts/renomear-numero-paciente-modelos.ts. Regra pura, para ser testada.
// =============================================================================

const RULES: [RegExp, string][] = [
  // "Processo n.º {{paciente.processo}}" / "Processo nº: {{…}}"
  [
    /processo\s+n\.?\s?[ºo°]\.?\s*:?\s*(\{\{\s*paciente\.processo\s*\}\})/gi,
    'N.º do paciente: $1',
  ],
  // "N.º de processo", "Nº do processo", "Número de processo", "N.º processo"
  [
    /\b(?:n\.?\s?[ºo°]\.?|n[úu]mero)\s+(?:d[eo]\s+)?processo\b/gi,
    'N.º do paciente',
  ],
  // "N.º de paciente" (orientações pós-procedimento) → a mesma designação
  [/\bn\.?\s?[ºo°]\.?\s+de\s+paciente\b/gi, 'N.º do paciente'],
];

/** Texto do modelo com a designação nova; igual ao original se nada muda */
export function renamePatientNumberLabel(text: string): string {
  return RULES.reduce((acc, [re, to]) => acc.replace(re, to), text);
}
