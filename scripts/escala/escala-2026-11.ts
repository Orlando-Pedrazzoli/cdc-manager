// 📄 scripts/escala/escala-2026-11.ts
// =============================================================================
// CDC Manager — Escala dos médicos (5.ª ronda/08, Victor, nov. 2026)
// -----------------------------------------------------------------------------
// Transcrição do quadro "HORÁRIO DOS MÉDICOS 2026" enviado pelo Victor
// (print no deck de 11/11/2026): Colombo com turnos Manhã 09h00–16h00 e
// Tarde 16h00–23h00; Buraca com um médico por dia.
//
// Só dados e funções puras — o carregamento na base é feito por
// scripts/load-escala.ts. Linhas com `confirmar` foram lidas do print mas
// têm dúvida (ver texto) e NÃO são carregadas sem --incluir-duvidas.
//
// Dias: 0 = domingo … 6 = sábado.
// =============================================================================

export type Turno = 'M' | 'T' | 'D';

export interface EscalaLinha {
  weekday: number;
  clinic: 'colombo' | 'buraca';
  turno: Turno;
  /** Hora de fim diferente da do turno (ex.: "até 20h00") */
  ate?: string;
  /** Quinzenal: data em que TRABALHA neste dia da semana */
  quinzenalDesde?: string;
  /** Dúvida por esclarecer com a clínica — não carregar sem confirmação */
  confirmar?: string;
}

export interface EscalaMedico {
  /** Nome como está no quadro */
  nome: string;
  /** Palavras que têm de existir no nome da ficha (sem acentos, maiúsculas) */
  match: string[];
  linhas: EscalaLinha[];
}

export const TURNOS: Record<Turno, { start: string; end: string }> = {
  M: { start: '09:00', end: '16:00' },
  T: { start: '16:00', end: '23:00' },
  D: { start: '09:00', end: '23:00' },
};
/** Buraca: o horário da clínica (10–13/14–20; sáb. 09:30–13:30) corta este
 *  intervalo largo — o médico do dia trabalha o dia de abertura inteiro. */
export const BURACA_DIA = { start: '08:00', end: '22:00' };

const c = (weekday: number, turno: Turno, extra: Partial<EscalaLinha> = {}): EscalaLinha => ({
  weekday,
  clinic: 'colombo',
  turno,
  ...extra,
});
const b = (weekday: number, extra: Partial<EscalaLinha> = {}): EscalaLinha => ({
  weekday,
  clinic: 'buraca',
  turno: 'D',
  ...extra,
});

const SEG = 1, TER = 2, QUA = 3, QUI = 4, SEX = 5, SAB = 6, DOM = 0;

export const ESCALA: EscalaMedico[] = [
  { nome: 'Dr. Éder', match: ['EDER'], linhas: [c(TER, 'T'), c(QUA, 'M'), c(QUI, 'M')] },
  { nome: 'Dr. Júlio', match: ['JULIO'], linhas: [b(SEG), b(SAB), c(DOM, 'D')] },
  {
    nome: 'Dr. Marcelo Natali',
    match: ['MARCELO', 'NATALI'],
    linhas: [c(SEG, 'M'), b(TER), c(QUA, 'T'), b(QUI), c(SEX, 'T')],
  },
  {
    nome: 'Dr. Marques',
    match: ['MARCELO', 'MARQUES'],
    linhas: [c(SEG, 'T'), c(TER, 'M'), c(QUI, 'D'), c(SEX, 'M')],
  },
  { nome: 'Dr. Orlando', match: ['ORLANDO'], linhas: [c(SEG, 'T'), c(TER, 'M'), c(QUI, 'M')] },
  {
    nome: 'Dra. Ana Paula',
    match: ['ANA', 'PAULA'],
    linhas: [c(SEG, 'T'), c(TER, 'T'), c(QUA, 'T'), b(SEX), c(SAB, 'D')],
  },
  { nome: 'Dra. Camila', match: ['CAMILA'], linhas: [c(TER, 'D'), c(QUI, 'D'), c(SEX, 'M')] },
  { nome: 'Dra. Carolina Chaves', match: ['CAROLINA', 'CHAVES'], linhas: [c(QUA, 'M')] },
  { nome: 'Dra. Christina', match: ['CHRISTINA'], linhas: [c(TER, 'M'), c(SEX, 'T')] },
  { nome: 'Dra. Fernanda', match: ['FERNANDA'], linhas: [c(QUI, 'T')] },
  {
    nome: 'Dra. Flávia',
    match: ['FLAVIA'],
    linhas: [
      c(SEG, 'T'),
      c(TER, 'M'),
      c(QUA, 'T'),
      // Folgas ao sábado: 14/11, 28/11, 12/12, 26/12 → trabalha a 21/11
      c(SAB, 'D', { quinzenalDesde: '2026-11-21' }),
      // "Folgas (sáb. e dom.)" → trabalha a 22/11
      c(DOM, 'D', { quinzenalDesde: '2026-11-22' }),
    ],
  },
  {
    nome: 'Dra. Geane',
    match: ['GEANE'],
    linhas: [
      c(TER, 'T'),
      c(QUA, 'T'),
      c(SEX, 'M'),
      // Folgas ao domingo à tarde: 08/11, 22/11, 06/12, 20/12 → trabalha a 15/11
      c(DOM, 'T', { quinzenalDesde: '2026-11-15' }),
    ],
  },
  { nome: 'Dra. Jerusa', match: ['JERUSA'], linhas: [c(SEG, 'T'), c(DOM, 'M')] },
  {
    nome: 'Dra. Jéssica',
    match: ['JESSICA'],
    // Sexta: manhã no gabinete 3 e tarde no 4 "até 20h00"
    linhas: [c(QUA, 'M'), c(SEX, 'D', { ate: '20:00' })],
  },
  { nome: 'Dra. Lidiany', match: ['LIDIANY'], linhas: [c(SAB, 'D')] },
  { nome: 'Dra. Margarida', match: ['MARGARIDA'], linhas: [c(SEG, 'M'), c(QUA, 'M'), c(DOM, 'M')] },
  {
    nome: 'Dra. Natália',
    match: ['NATALI'], // "Natália" / "Nataliia" — distinguida do Dr. Marcelo Natali abaixo
    linhas: [c(TER, 'T'), c(QUI, 'T'), c(SEX, 'T'), c(SAB, 'T')],
  },
  { nome: 'Dra. Patrícia', match: ['PATRICIA'], linhas: [c(SEG, 'M'), c(QUA, 'M'), c(QUI, 'M')] },
  {
    nome: 'Dra. Veridiana',
    match: ['VERIDIANA'],
    linhas: [c(SEG, 'M'), c(SEX, 'M'), c(SAB, 'M'), c(DOM, 'M')],
  },
  { nome: 'Dra. Diana Fernandes', match: ['DIANA'], linhas: [c(QUA, 'T'), c(SAB, 'T')] },
  {
    nome: 'Dra. Natacha',
    match: ['NATACHA'],
    linhas: [
      c(QUI, 'T'),
      c(SAB, 'T', {
        quinzenalDesde: '2026-11-14',
        confirmar:
          '"Dra. Flávia / Natacha (quinzenal)": assumido que a Dra. Natacha faz a tarde nos fins de semana de folga da Dra. Flávia',
      }),
      c(DOM, 'T', {
        quinzenalDesde: '2026-11-15',
        confirmar:
          '"Dra. Flávia / Natacha (quinzenal)": assumido que a Dra. Natacha faz a tarde nos fins de semana de folga da Dra. Flávia',
      }),
    ],
  },
  {
    nome: 'Dra. Lays Negrissoli',
    match: ['LAYS'],
    linhas: [
      c(SEX, 'T'),
      c(SAB, 'M'),
      b(QUA, {
        confirmar:
          'a nota diz "Quarta: Dra. Lays Negrissoli (Buraca) a partir de 21/10", mas o quadro da Buraca mostra a quarta por preencher',
      }),
    ],
  },
];

// -----------------------------------------------------------------------------
// Funções puras
// -----------------------------------------------------------------------------
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fichas que correspondem a uma linha da escala. Uma palavra corresponde se
 * for uma palavra do nome ou o início de uma (NATALI ↔ NATALIA/NATALIIA).
 * Regra especial: "Dra. Natália" não pode apanhar o Dr. MARCELO … NATALI.
 */
export function matchDoctors<T extends { name: string }>(
  medico: EscalaMedico,
  doctors: T[],
): T[] {
  return doctors.filter(d => {
    const words = normalizeName(d.name).split(' ');
    const has = (token: string) => words.some(w => w === token || w.startsWith(token));
    if (!medico.match.every(has)) return false;
    if (medico.nome === 'Dra. Natália' && words.includes('MARCELO')) return false;
    return true;
  });
}

export interface WeeklyEntry {
  weekday: number;
  ranges: { start: string; end: string }[];
  biweeklyAnchor: string | null;
}

/** Semana-tipo por clínica a partir das linhas da escala */
export function buildSchedules(
  medico: EscalaMedico,
  incluirDuvidas: boolean,
): Record<'colombo' | 'buraca', WeeklyEntry[]> {
  const out: Record<'colombo' | 'buraca', WeeklyEntry[]> = { colombo: [], buraca: [] };
  for (const l of medico.linhas) {
    if (l.confirmar && !incluirDuvidas) continue;
    const base = l.clinic === 'buraca' ? BURACA_DIA : TURNOS[l.turno];
    out[l.clinic].push({
      weekday: l.weekday,
      ranges: [{ start: base.start, end: l.ate ?? base.end }],
      biweeklyAnchor: l.quinzenalDesde ?? null,
    });
  }
  for (const k of ['colombo', 'buraca'] as const) {
    out[k].sort((x, y) => x.weekday - y.weekday);
  }
  return out;
}
