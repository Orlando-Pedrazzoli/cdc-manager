// 📄 scripts/tests/username.test.ts
// Correr: npx tsx scripts/tests/username.test.ts
import assert from 'node:assert/strict';
import {
  isPlaceholderEmail,
  isValidUsername,
  loginIdentifier,
  normalizeUsername,
  passwordProblem,
  placeholderEmail,
} from '../../src/lib/username';
import { consultProgress } from '../../src/components/agenda/ConsultProgress';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('nome de utilizador: normaliza maiúsculas, espaços e acentos', () => {
  assert.equal(normalizeUsername('  Ana.Silva '), 'ana.silva');
  assert.equal(normalizeUsername('Conceição'), 'conceicao');
});

test('nome de utilizador: 3 a 30 caracteres, sem espaços nem símbolos', () => {
  for (const ok of ['ana', 'ana.silva', 'rececao-2', 'maria_j', 'a1b']) assert.equal(isValidUsername(ok), true, ok);
  for (const bad of ['an', 'ana silva', '.ana', 'ana.', 'ana@x', 'a'.repeat(31), '']) assert.equal(isValidUsername(bad), false, bad);
});

test('login: o mesmo campo aceita email ou nome de utilizador', () => {
  assert.deepEqual(loginIdentifier(' Victor@Clinica.PT '), { kind: 'email', value: 'victor@clinica.pt' });
  assert.deepEqual(loginIdentifier('Ana.Silva'), { kind: 'username', value: 'ana.silva' });
  assert.equal(loginIdentifier(''), null);
  assert.equal(loginIdentifier('ana silva'), null);
  assert.equal(loginIdentifier('ana@'), null);
});

test('endereço interno: identifica-se e não serve para entrar', () => {
  const e = placeholderEmail('ana.silva');
  assert.equal(e, 'ana.silva@utilizador.invalid');
  assert.equal(isPlaceholderEmail(e), true);
  assert.equal(isPlaceholderEmail('ana@clinica.pt'), false);
  assert.equal(isPlaceholderEmail(null), false);
  assert.equal(loginIdentifier(e), null);
});

test('senha: 10+ caracteres com minúscula, maiúscula e número', () => {
  assert.equal(passwordProblem('Clinica2026x'), null);
  assert.ok(passwordProblem('Curta1a'));
  assert.ok(passwordProblem('semmaiuscula123'));
  assert.ok(passwordProblem('SEMMINUSCULA123'));
  assert.ok(passwordProblem('SemNumeroNenhum'));
});

test('barra de tempo: enche com o tempo, avisa no fim e passa a esgotado', () => {
  const start = Date.UTC(2026, 10, 12, 10, 0);
  const end = Date.UTC(2026, 10, 12, 10, 30);
  const at = (min: number) => consultProgress(start, end, start + min * 60_000);
  assert.deepEqual(at(0), { ratio: 0, leftMin: 30, state: 'ok' });
  assert.equal(at(15).ratio, 0.5);
  assert.equal(at(15).state, 'ok');
  assert.equal(at(26).state, 'ending'); // últimos 5 min
  assert.equal(at(26).leftMin, 4);
  assert.deepEqual(at(30), { ratio: 1, leftMin: 0, state: 'over' });
  assert.equal(at(40).leftMin, -10);
  assert.equal(at(-5).ratio, 0); // ainda não começou
  // consulta curta: o aviso é aos últimos 20%
  const short = consultProgress(start, start + 10 * 60_000, start + 8.5 * 60_000);
  assert.equal(short.state, 'ending');
});

console.log(`\n${n} testes OK`);
