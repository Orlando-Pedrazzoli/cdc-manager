// 📄 scripts/tests/price-update.test.ts
// Correr: npx tsx scripts/tests/price-update.test.ts
import assert from 'node:assert/strict';
import { applyPriceRule, describeRule } from '../../src/lib/price-update';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('tabela toda +2,7%: 45,00 € → 46,22 € (46,215 → banker 46,22)', () => {
  assert.equal(
    applyPriceRule(4500, { mode: 'percent', value: 2.7, rounding: 'cent' }),
    4622,
  );
});
test('tabela toda +7 €: 45,00 € → 52,00 €', () => {
  assert.equal(
    applyPriceRule(4500, { mode: 'amount', value: 700, rounding: 'cent' }),
    5200,
  );
});
test('categoria Estética +30%: 250 € → 325 €', () => {
  assert.equal(
    applyPriceRule(25000, { mode: 'percent', value: 30, rounding: 'cent' }),
    32500,
  );
});
test('linha 1.ª consulta +3%: 35 € → 36,05 €; +3 €: 38 €', () => {
  assert.equal(
    applyPriceRule(3500, { mode: 'percent', value: 3, rounding: 'cent' }),
    3605,
  );
  assert.equal(
    applyPriceRule(3500, { mode: 'amount', value: 300, rounding: 'cent' }),
    3800,
  );
});
test('arredondar ao euro: 36,05 → 36,00; aos 0,50: 36,05 → 36,00; 36,30 → 36,50', () => {
  assert.equal(
    applyPriceRule(3500, { mode: 'percent', value: 3, rounding: 'euro' }),
    3600,
  );
  assert.equal(
    applyPriceRule(3500, { mode: 'percent', value: 3, rounding: 'half-euro' }),
    3600,
  );
  assert.equal(
    applyPriceRule(3630, { mode: 'amount', value: 0, rounding: 'half-euro' }),
    3650,
  );
});
test('descida −10% e nunca negativo', () => {
  assert.equal(
    applyPriceRule(5000, { mode: 'percent', value: -10, rounding: 'cent' }),
    4500,
  );
  assert.equal(
    applyPriceRule(500, { mode: 'amount', value: -900, rounding: 'cent' }),
    0,
  );
});
test('descrição legível', () => {
  assert.equal(
    describeRule({ mode: 'percent', value: 2.7, rounding: 'cent' }),
    '+2,7%',
  );
  // Intl usa espaço inseparável antes do €
  assert.equal(
    describeRule({ mode: 'amount', value: -300, rounding: 'euro' }).replace(
      /\u00a0/g,
      ' ',
    ),
    '−3,00 €, arredondado ao euro',
  );
});
console.log(`\n${n} testes passaram.`);
