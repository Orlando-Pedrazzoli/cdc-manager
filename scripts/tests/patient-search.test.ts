// 📄 scripts/tests/patient-search.test.ts
// Correr: npx tsx scripts/tests/patient-search.test.ts
// -----------------------------------------------------------------------------
// Apontamento 02 (2.ª reunião): pesquisa inequívoca — o filtro único tem de
// cobrir processo, telemóvel, NIF, nº de utente, data de nascimento e nome,
// e não fazer regex de nome com termos puramente numéricos.
// -----------------------------------------------------------------------------
import assert from 'node:assert/strict';
import {
  patientSearchOr,
  toPatientSearchHit,
} from '../../src/lib/patient-search';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const keys = (or: Record<string, unknown>[]) =>
  or.map(c => Object.keys(c)[0]).sort();

test('termo curto → sem cláusulas', () => {
  assert.deepEqual(patientSearchOr('a'), []);
  assert.deepEqual(patientSearchOr('  '), []);
});

test('nome: todas as palavras, sem cláusulas numéricas', () => {
  const or = patientSearchOr('joão silva');
  assert.deepEqual(keys(or), ['$and']);
  const and = (or[0] as { $and: Record<string, unknown>[] }).$and;
  assert.equal(and.length, 2);
});

test('nº de processo (até 6 dígitos): processo, sem nome', () => {
  const or = patientSearchOr('1234');
  assert.deepEqual(keys(or), ['processNumber']);
  assert.deepEqual(or[0], { processNumber: 1234 });
});

test('9 dígitos: telemóvel + NIF + utente (sem nome, sem processo)', () => {
  const or = patientSearchOr('912345678');
  assert.deepEqual(keys(or), ['nif', 'phone', 'snsNumber']);
  assert.deepEqual(
    or.find(c => 'nif' in c),
    { nif: '912345678' },
  );
});

test('telemóvel com espaços/prefixo: contido nos dígitos', () => {
  const or = patientSearchOr('+351 912 345 678');
  const phone = or.find(c => 'phone' in c) as { phone: { $regex: string } };
  assert.equal(phone.phone.$regex, '351912345678');
});

test('data dd/mm/aaaa → intervalo do dia em UTC', () => {
  const or = patientSearchOr('10/10/1980');
  assert.deepEqual(keys(or), ['birthDate']);
  const r = (or[0] as { birthDate: { $gte: Date; $lt: Date } }).birthDate;
  assert.equal(r.$gte.toISOString(), '1980-10-10T00:00:00.000Z');
  assert.equal(r.$lt.toISOString(), '1980-10-11T00:00:00.000Z');
});

test('data aaaa-mm-dd e dd-mm-aaaa também', () => {
  assert.deepEqual(keys(patientSearchOr('1980-10-10')), ['birthDate']);
  assert.deepEqual(keys(patientSearchOr('10-10-1980')), ['birthDate']);
});

test('data inválida (31/02) não gera cláusula de nascimento', () => {
  const or = patientSearchOr('31/02/1980');
  assert.equal(
    or.some(c => 'birthDate' in c),
    false,
  );
});

test('hit: label com processo · nome · nascimento · telemóvel; sem foto', () => {
  const hit = toPatientSearchHit({
    _id: 'abc',
    processNumber: 42,
    name: 'João Silva',
    phone: '+351912345678',
    nif: '123456789',
    snsNumber: null,
    birthDate: new Date('1980-10-10T00:00:00.000Z'),
    photoPublicId: null,
  });
  assert.equal(hit.id, 'abc');
  assert.equal(hit.label, '42 · João Silva · 10/10/1980 · +351912345678');
  assert.equal(hit.birth, '10/10/1980');
  assert.equal(hit.photoUrl, null);
  assert.equal(hit.snsNumber, null);
});

console.log(`\n${n} testes OK`);
