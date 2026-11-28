// 📄 src/lib/citizen-card.ts
// =============================================================================
// CDC Manager — Leitura do Cartão de Cidadão na ficha nova (ponto 36)
// -----------------------------------------------------------------------------
// O browser não lê leitores de cartões. O leitor do posto (programa local,
// chamado por um endereço `cdccc://`) lê o cartão com o software oficial
// Autenticação.gov e ENVIA os dados para o CDC Manager com um código de uso
// único; o formulário vai buscá-los e preenche-se. Nada é gravado na ficha
// antes de a receção conferir e guardar.
//
// Este ficheiro é puro (com testes): contrato dos dados, limpeza e endereço
// de lançamento. A morada só vem se o titular digitar o PIN de morada.
// =============================================================================

/** O que o leitor do posto envia (tudo texto, tudo opcional) */
export interface CitizenCardRaw {
  name?: unknown; // nome completo, como no cartão
  givenName?: unknown; // em alternativa: nomes próprios…
  surname?: unknown; // …e apelidos
  birthDate?: unknown; // "DD MM AAAA", "DD/MM/AAAA" ou "AAAA-MM-DD"
  sex?: unknown; // "M" | "F"
  nationality?: unknown; // código de 3 letras ("PRT") ou texto
  nif?: unknown;
  snsNumber?: unknown;
  street?: unknown;
  postalCode?: unknown; // "1500-392" ou cp4 + cp3 juntos
  city?: unknown;
}

/** Dados prontos para o formulário da ficha */
export interface CitizenCardData {
  name: string;
  birthDate: string; // AAAA-MM-DD ou ''
  sex: 'F' | 'M' | '';
  nationality: string;
  nif: string;
  snsNumber: string;
  street: string;
  postalCode: string;
  city: string;
}

export const CARD_TICKET_TTL_SECONDS = 180;
export const CARD_PROTOCOL = 'cdccc';

const str = (v: unknown, max: number): string =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

const NATIONALITY_BY_CODE: Record<string, string> = {
  PRT: 'Portuguesa',
  BRA: 'Brasileira',
  AGO: 'Angolana',
  CPV: 'Cabo-verdiana',
  GNB: 'Guineense',
  MOZ: 'Moçambicana',
  STP: 'São-tomense',
  ESP: 'Espanhola',
  FRA: 'Francesa',
  GBR: 'Britânica',
  ITA: 'Italiana',
  DEU: 'Alemã',
  UKR: 'Ucraniana',
};

/** "30 01 1980" / "30/01/1980" / "1980-01-30" → "1980-01-30" ('' se inválida) */
export function cardDateToIso(v: unknown): string {
  const s = str(v, 20);
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const pt = /^(\d{1,2})[ /.-](\d{1,2})[ /.-](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (pt) [d, m, y] = [Number(pt[1]), Number(pt[2]), Number(pt[3])];
  else return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d ||
    y < 1900 ||
    dt.getTime() > Date.now()
  )
    return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** NIF português: 9 dígitos com dígito de controlo certo */
export function isValidNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(nif[i]) * (9 - i);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(nif[8]);
}

function postal(v: unknown): string {
  const digits = str(v, 20).replace(/\D/g, '');
  return digits.length === 7 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : '';
}

/** Limpa o que veio do leitor; campos inválidos ficam vazios (não inventa) */
export function normalizeCitizenCard(raw: CitizenCardRaw): CitizenCardData {
  const full =
    str(raw.name, 160) ||
    [str(raw.givenName, 80), str(raw.surname, 80)].filter(Boolean).join(' ');
  const sexRaw = str(raw.sex, 10).toUpperCase();
  const natRaw = str(raw.nationality, 60);
  const nif = str(raw.nif, 20).replace(/\D/g, '');
  const sns = str(raw.snsNumber, 20).replace(/\D/g, '');
  return {
    name: full.slice(0, 160),
    birthDate: cardDateToIso(raw.birthDate),
    sex: sexRaw === 'F' ? 'F' : sexRaw === 'M' ? 'M' : '',
    nationality: NATIONALITY_BY_CODE[natRaw.toUpperCase()] ?? natRaw,
    nif: isValidNif(nif) ? nif : '',
    snsNumber: /^\d{9}$/.test(sns) ? sns : '',
    street: str(raw.street, 200),
    postalCode: postal(raw.postalCode),
    city: str(raw.city, 80),
  };
}

/** Leitura sem nome nem data de nascimento não serve para nada */
export function citizenCardUsable(d: CitizenCardData): boolean {
  return d.name.length >= 3 && d.birthDate !== '';
}

/** Endereço que acorda o leitor do posto: leva o código e para onde enviar */
export function cardLaunchUrl(token: string, origin: string): string {
  const p = new URLSearchParams({ t: token, u: `${origin}/api/cartao-cidadao` });
  return `${CARD_PROTOCOL}://ler/?${p.toString()}`;
}

export const CARD_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
