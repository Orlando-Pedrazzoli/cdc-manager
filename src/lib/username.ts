// 📄 src/lib/username.ts
// =============================================================================
// CDC Manager — Login só com nome de utilizador e senha (Victor, 11/11/2026)
// -----------------------------------------------------------------------------
// "Prefiro sem e-mail, só com nome e senha, que é mais prático. Se a
// colaboradora se esquecer da senha, a gestão poderia redefini-la."
//
// As colaboradoras da receção não têm (nem precisam de) email pessoal na
// clínica. A conta passa a poder ter um NOME DE UTILIZADOR; o login aceita
// email ou nome de utilizador no mesmo campo.
//
// O modelo User continua a exigir um email único (todo o sistema assenta
// nisso). Uma conta criada só com nome de utilizador recebe um endereço
// interno no domínio reservado ".invalid" (RFC 2606 — nunca existe, nunca
// recebe correio): serve de chave, nunca é mostrado nem usado para enviar.
// Funções PURAS — testadas em scripts/tests/username.test.ts.
// =============================================================================

export const PLACEHOLDER_EMAIL_DOMAIN = 'utilizador.invalid';

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;

/** "  Ana.Silva " → "ana.silva"; tira acentos ("Conceição" → "conceicao") */
export function normalizeUsername(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** 3 a 30 caracteres: letras, números, ponto, hífen e sublinhado */
export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export function placeholderEmail(username: string): string {
  return `${username}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** O que foi escrito no campo de login: um email ou um nome de utilizador? */
export function loginIdentifier(
  input: string,
): { kind: 'email'; value: string } | { kind: 'username'; value: string } | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const email = raw.toLowerCase();
    // o endereço interno não é uma forma de entrar
    if (!/^\S+@\S+\.\S+$/.test(email) || isPlaceholderEmail(email)) return null;
    return { kind: 'email', value: email };
  }
  const username = normalizeUsername(raw);
  return isValidUsername(username) ? { kind: 'username', value: username } : null;
}

/**
 * Regra de senha das contas da equipa (a mesma da ativação por email):
 * 10+ caracteres com minúscula, maiúscula e número. Devolve a mensagem de
 * erro ou null se a senha serve.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'A senha deve ter pelo menos 10 caracteres.';
  if (password.length > 100) return 'Senha demasiado longa.';
  if (!/[a-z]/.test(password)) return 'Inclua pelo menos uma letra minúscula.';
  if (!/[A-Z]/.test(password)) return 'Inclua pelo menos uma letra maiúscula.';
  if (!/\d/.test(password)) return 'Inclua pelo menos um número.';
  return null;
}
