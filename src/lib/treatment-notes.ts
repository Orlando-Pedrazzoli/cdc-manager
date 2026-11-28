// 📄 src/lib/treatment-notes.ts
// =============================================================================
// CDC Manager — Notas do tratamento (aba do odontograma)
// -----------------------------------------------------------------------------
// Ponto 32 (Giulia, 27/11/2026): "Às vezes os médicos combinam procedimentos
// ou querem deixar uma observação relevante sobre o tratamento, e deixam-na
// nos orçamentos. Proposta: uma área de 'orçamentos livres' (ou outro nome)
// na aba do odontograma, para estas notas."
//
// Uma lista de notas por paciente, com quem escreveu e quando. Não são
// orçamentos (não têm valores nem número) nem notas clínicas da ficha
// (essas são permanentes): servem para combinar o tratamento entre médicos e
// receção. Uma nota tratada arquiva-se — não se apaga; fica o registo.
//
// Regras puras, testadas em scripts/tests/ronda-9c-fase-b.test.ts.
// =============================================================================

export const TREATMENT_NOTE_MAX = 1000;
export const TREATMENT_NOTE_MIN = 3;

/** Texto limpo ou o erro a mostrar */
export function cleanTreatmentNote(
  raw: unknown,
): { text: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Escreva a nota.' };
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < TREATMENT_NOTE_MIN) return { error: 'Escreva a nota.' };
  if (text.length > TREATMENT_NOTE_MAX)
    return { error: `A nota tem ${text.length} caracteres; o máximo é ${TREATMENT_NOTE_MAX}.` };
  return { text };
}

const ROLE_LABEL: Record<string, string> = {
  doctor: 'Médico',
  admin: 'Gestão',
  receptionist: 'Receção',
};
/** "Dra. Ana Borges (Médico)" */
export function noteAuthorLabel(name: string | null | undefined, role: string | null | undefined) {
  const who = (name ?? '').trim() || 'Utilizador removido';
  const r = role ? ROLE_LABEL[role] : null;
  return r ? `${who} (${r})` : who;
}
