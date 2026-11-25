// 📄 src/lib/doctor-title.ts
// =============================================================================
// CDC Manager — Título dos médicos ("Dr." / "Dra."): regras puras
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta F3): "Sim, padroniza todos com Dr./Dra."
// Os nomes vieram do Dentoral com formas diferentes ("Dra Ana", "DR. Rui",
// "Drª Marta", ou sem título). Aqui decide-se o nome padronizado; quem grava
// é scripts/padronizar-titulos-medicos.ts (simulação por omissão).
// O sexo não está na ficha: para quem não tem título usa-se o primeiro nome,
// e só quando não há dúvida. Os restantes ficam por decidir à mão.
// Sem BD nem React, para ser testada (scripts/tests/ronda-9b.test.ts).
// =============================================================================

export type DoctorTitle = 'Dr.' | 'Dra.';

const MALE_TITLE = /^(dr|doutor)\.?$/i;
const FEMALE_TITLE = /^(dra|dr\.?ª|doutora)\.?$/i;

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

// Primeiros nomes que a terminação não resolve
const FEMALE_NAMES = new Set([
  'geane', 'lays', 'lais', 'thais', 'tais', 'lidiany', 'beatriz', 'raquel',
  'ines', 'isabel', 'alice', 'simone', 'michele', 'michelle', 'viviane',
  'liliane', 'rosane', 'daniele', 'danielle', 'gisele', 'giselle', 'irene',
  'carmen', 'ester', 'esther', 'ruth', 'miriam', 'jaqueline', 'jacqueline',
  'caroline', 'aline', 'eliane', 'cristiane', 'juliane', 'luciane', 'mariane',
  'tatiane', 'adriane', 'lidiane', 'rosangela', 'suely', 'sueli', 'kelly',
  'nathaly', 'natalie', 'solange', 'ivone', 'ivete', 'margarete', 'elisabete',
  'elizabeth', 'isis', 'iris', 'lourdes', 'mercedes', 'dolores', 'leonor',
  'mabel', 'raissa', 'yasmin', 'jasmim', 'karen', 'karin', 'ingrid', 'astrid',
]);
const MALE_NAMES = new Set([
  'eder', 'victor', 'vitor', 'joao', 'jose', 'luis', 'miguel', 'rafael',
  'gabriel', 'daniel', 'samuel', 'manuel', 'david', 'andre', 'filipe',
  'felipe', 'henrique', 'jorge', 'guilherme', 'alexandre', 'vicente',
  'duarte', 'jaime', 'rui', 'nuno', 'tomas', 'lucas', 'mateus', 'matheus',
  'marcos', 'carlos', 'thales', 'jonas', 'elias', 'artur', 'arthur', 'igor',
  'edgar', 'cesar', 'oscar', 'wagner', 'walter', 'kleber', 'cleber', 'wesley',
  'william', 'wellington', 'anderson', 'edson', 'nelson', 'wilson', 'robson',
  'jefferson', 'emerson', 'gerson', 'jackson', 'alisson', 'alan', 'ivan',
  'juan', 'christian', 'cristian', 'renan', 'natan', 'jonathan', 'ruben',
  'simao', 'sebastiao', 'luca', 'josue', 'abel', 'ismael', 'joel', 'raul',
  'saul', 'paul', 'jean', 'pierre', 'denis', 'dinis', 'luiz', 'diniz',
  'martim', 'joaquim', 'valentim', 'benjamim', 'xavier', 'javier', 'heitor',
  'vitorino', 'cristovao', 'estevao', 'adao', 'damiao', 'julian', 'adrian',
]);

/** Título a propor a partir do primeiro nome; null = não há certeza */
export function guessDoctorTitle(firstName: string): DoctorTitle | null {
  const f = plain(firstName).replace(/[^a-z]/g, '');
  if (f.length < 2) return null;
  if (MALE_NAMES.has(f)) return 'Dr.';
  if (FEMALE_NAMES.has(f)) return 'Dra.';
  if (f.endsWith('a')) return 'Dra.';
  if (f.endsWith('o')) return 'Dr.';
  return null;
}

export interface DoctorTitleResult {
  /** Nome padronizado; igual ao original quando nada muda */
  name: string;
  /** 'ok' já estava certo · 'normalized' só a forma/posição do título mudou ·
   *  'added' título acrescentado pelo primeiro nome · 'unknown' por decidir */
  outcome: 'ok' | 'normalized' | 'added' | 'unknown';
}

function titleOf(word: string): DoctorTitle | null {
  if (FEMALE_TITLE.test(word)) return 'Dra.';
  if (MALE_TITLE.test(word)) return 'Dr.';
  return null;
}

/**
 * "Dra Ana Borges" → "Dra. Ana Borges"; "Rui Costa" → "Dr. Rui Costa".
 * O Dentoral grava o título NO FIM ("ANA PAULA BORGES DRA.", "DIANA
 * FERNANDES DRª"): passa para a frente, uma só vez.
 * Fica por decidir (não se altera):
 *   · uma só palavra ("Portugal", "BACKOFFICE") ou nome com parênteses
 *     ("Médico não identificado (Dentoral)") — não é um nome de médico;
 *   · título escrito que contradiz o primeiro nome ("JANAÍNA … DR.");
 *   · sem título escrito e primeiro nome sem certeza.
 * `forced` vem da linha de comandos, para os casos por decidir.
 */
export function standardDoctorName(
  rawName: string,
  forced?: DoctorTitle | null,
): DoctorTitleResult {
  const original = rawName.trim().replace(/\s+/g, ' ');
  const unknown: DoctorTitleResult = { name: rawName, outcome: 'unknown' };
  if (/[()]/.test(original)) return unknown;

  // títulos escritos, no início e/ou no fim
  const parts = original.split(' ').filter(Boolean);
  const written: DoctorTitle[] = [];
  while (parts.length > 0) {
    const t = titleOf(parts[0]);
    if (!t) break;
    written.push(t);
    parts.shift();
  }
  while (parts.length > 0) {
    const t = titleOf(parts[parts.length - 1]);
    if (!t) break;
    written.push(t);
    parts.pop();
  }
  if (parts.length === 0) return unknown;
  const bare = parts.join(' ');
  const hadTitle = written.length > 0;
  // "Doutor Teste" tem título e uma palavra: aceita-se; "Portugal" não
  if (!hadTitle && parts.length < 2 && !forced) return unknown;

  let title: DoctorTitle | null = forced ?? null;
  if (!title) {
    const guess = parts.length >= 1 ? guessDoctorTitle(parts[0]) : null;
    if (hadTitle) {
      // títulos escritos que não concordam entre si, ou com o primeiro nome
      if (written.some(t => t !== written[0])) return unknown;
      if (guess && guess !== written[0]) return unknown;
      title = written[0];
    } else {
      title = guess;
    }
  }
  if (!title) return unknown;

  const name = `${title} ${bare}`;
  if (name === rawName) return { name, outcome: 'ok' };
  return { name, outcome: hadTitle ? 'normalized' : 'added' };
}
