// 📄 scripts/tests/greeting.test.ts
// Correr: npx tsx scripts/tests/greeting.test.ts
import assert from 'node:assert/strict';
import {
  buildGreeting,
  greetingName,
  greetingPeriod,
  lisbonHour,
} from '../../src/lib/greeting';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};
const at = (iso: string) => new Date(iso);

test('inverno (UTC+0): limites dos três períodos', () => {
  assert.equal(greetingPeriod(at('2026-11-24T04:59:00Z')), 'night');
  assert.equal(greetingPeriod(at('2026-11-24T05:00:00Z')), 'morning');
  assert.equal(greetingPeriod(at('2026-11-24T11:59:00Z')), 'morning');
  assert.equal(greetingPeriod(at('2026-11-24T12:00:00Z')), 'afternoon');
  assert.equal(greetingPeriod(at('2026-11-24T19:59:00Z')), 'afternoon');
  assert.equal(greetingPeriod(at('2026-11-24T20:00:00Z')), 'night');
  assert.equal(greetingPeriod(at('2026-11-24T23:30:00Z')), 'night');
});

test('verão (UTC+1): usa a hora de Lisboa, não a UTC', () => {
  // 11:00 UTC = 12:00 em Lisboa → já é tarde
  assert.equal(lisbonHour(at('2026-07-15T11:00:00Z')), 12);
  assert.equal(greetingPeriod(at('2026-07-15T11:00:00Z')), 'afternoon');
  // 19:00 UTC = 20:00 em Lisboa → noite
  assert.equal(greetingPeriod(at('2026-07-15T19:00:00Z')), 'night');
  // 23:30 UTC = 00:30 em Lisboa (meia-noite não dá "24")
  assert.equal(lisbonHour(at('2026-07-15T23:30:00Z')), 0);
});

test('nome: mantém o título da ficha + primeiro nome', () => {
  assert.equal(greetingName('Dra. Marta Fonseca'), 'Dra. Marta');
  assert.equal(greetingName('Dr. Rui Tavares'), 'Dr. Rui');
  assert.equal(greetingName('Dr Rui Tavares'), 'Dr Rui');
  assert.equal(greetingName('Dr.ª Sofia Lima'), 'Dr.ª Sofia');
  assert.equal(greetingName('Prof. Miguel Antunes'), 'Prof. Miguel');
});

test('nome: sem título fica o primeiro nome; não inventa Dr./Dra.', () => {
  assert.equal(greetingName('Victor Ruiz'), 'Victor');
  assert.equal(greetingName('  Isabel   Santos '), 'Isabel');
  assert.equal(greetingName('Drago Silva'), 'Drago');
  assert.equal(greetingName('Dra.'), 'Dra.');
  assert.equal(greetingName(''), '');
  assert.equal(greetingName(null), '');
});

test('saudação completa', () => {
  assert.equal(
    buildGreeting('Dra. Marta Fonseca', at('2026-11-24T09:15:00Z')),
    'Bom dia, Dra. Marta',
  );
  assert.equal(
    buildGreeting('Victor Ruiz', at('2026-11-24T13:17:00Z')),
    'Boa tarde, Victor',
  );
  assert.equal(
    buildGreeting('Dr. Rui Tavares', at('2026-11-24T21:00:00Z')),
    'Boa noite, Dr. Rui',
  );
  assert.equal(buildGreeting('', at('2026-11-24T21:00:00Z')), 'Boa noite');
});

console.log(`\ngreeting: ${n} testes OK`);
