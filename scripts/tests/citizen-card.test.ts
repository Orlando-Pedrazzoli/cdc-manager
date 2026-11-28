// 📄 scripts/tests/citizen-card.test.ts
// =============================================================================
// Ponto 36: leitura do Cartão de Cidadão — limpeza dos dados e endereço do
// leitor. Correr: npx tsx scripts/tests/citizen-card.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  cardDateToIso,
  cardLaunchUrl,
  CARD_TOKEN_REGEX,
  citizenCardUsable,
  isValidNif,
  normalizeCitizenCard,
} from '../../src/lib/citizen-card';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

test('data do cartão nos três formatos; inválida ou futura fica vazia', () => {
  assert.equal(cardDateToIso('30 01 1980'), '1980-01-30');
  assert.equal(cardDateToIso('5/3/2001'), '2001-03-05');
  assert.equal(cardDateToIso('1980-01-30'), '1980-01-30');
  assert.equal(cardDateToIso('31 02 1980'), '');
  assert.equal(cardDateToIso('01 01 2999'), '');
  assert.equal(cardDateToIso('01 01 1850'), '');
  assert.equal(cardDateToIso(null), '');
});

test('NIF: dígito de controlo', () => {
  assert.equal(isValidNif('505887533'), true); // NIPC da clínica
  assert.equal(isValidNif('999999990'), true);
  assert.equal(isValidNif('123456788'), false);
  assert.equal(isValidNif('12345'), false);
});

test('normalização: nome, sexo, nacionalidade por código, números e morada', () => {
  const d = normalizeCitizenCard({
    givenName: '  MARIA   JOSÉ ',
    surname: 'SILVA SANTOS',
    birthDate: '30 01 1980',
    sex: 'f',
    nationality: 'prt',
    nif: '505 887 533',
    snsNumber: '123456789',
    street: 'Rua  de Exemplo, 10',
    postalCode: '1500392',
    city: 'Lisboa',
  });
  assert.deepEqual(d, {
    name: 'MARIA JOSÉ SILVA SANTOS',
    birthDate: '1980-01-30',
    sex: 'F',
    nationality: 'Portuguesa',
    nif: '505887533',
    snsNumber: '123456789',
    street: 'Rua de Exemplo, 10',
    postalCode: '1500-392',
    city: 'Lisboa',
  });
  assert.equal(citizenCardUsable(d), true);
});

test('campos inválidos ficam vazios — nunca se inventa', () => {
  const d = normalizeCitizenCard({
    name: 'João Teste',
    birthDate: 'ontem',
    sex: 'X',
    nationality: 'XKX',
    nif: '123456788',
    snsNumber: '12',
    postalCode: '1500',
    street: { a: 1 },
  });
  assert.equal(d.birthDate, '');
  assert.equal(d.sex, '');
  assert.equal(d.nationality, 'XKX'); // código desconhecido: fica o texto
  assert.equal(d.nif, '');
  assert.equal(d.snsNumber, '');
  assert.equal(d.postalCode, '');
  assert.equal(d.street, '');
  assert.equal(citizenCardUsable(d), false); // sem data de nascimento
  assert.equal(citizenCardUsable(normalizeCitizenCard({})), false);
});

test('endereço do leitor leva o código e o destino; formato do código', () => {
  const token = 'A'.repeat(43);
  const url = cardLaunchUrl(token, 'https://www.cdcclinicas.com');
  assert.equal(
    url,
    `cdccc://ler/?t=${token}&u=https%3A%2F%2Fwww.cdcclinicas.com%2Fapi%2Fcartao-cidadao`,
  );
  assert.equal(CARD_TOKEN_REGEX.test(token), true);
  assert.equal(CARD_TOKEN_REGEX.test('curto'), false);
  assert.equal(CARD_TOKEN_REGEX.test(`${'A'.repeat(42)}/`), false);
});

console.log(`\ncitizen-card: ${n} testes OK`);
