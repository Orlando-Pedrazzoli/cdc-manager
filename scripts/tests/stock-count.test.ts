// 📄 scripts/tests/stock-count.test.ts
// Correr: npx tsx scripts/tests/stock-count.test.ts
// Aritmética pura do stock por local: diferença de contagem → movimento.
import assert from 'node:assert/strict';
import {
  countLineDelta,
  signedDelta,
  requisitionSchema,
  closeCountSchema,
} from '../../src/lib/validations/stock';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('falta → consumption com a quantidade gasta', () => {
  assert.deepEqual(countLineDelta(10, 7), { type: 'consumption', quantity: 3 });
});
test('sobra → adjustment-in', () => {
  assert.deepEqual(countLineDelta(10, 12), {
    type: 'adjustment-in',
    quantity: 2,
  });
});
test('igual → sem movimento', () => {
  assert.equal(countLineDelta(10, 10), null);
});
test('fracionado (ml) arredonda a 3 casas', () => {
  assert.deepEqual(countLineDelta(1.25, 0.1), {
    type: 'consumption',
    quantity: 1.15,
  });
});
test('contado 0 com esperado 0 → nada', () => {
  assert.equal(countLineDelta(0, 0), null);
});
test('esperado negativo (registo errado) e contado 0 → sobra', () => {
  assert.deepEqual(countLineDelta(-2, 0), {
    type: 'adjustment-in',
    quantity: 2,
  });
});
test('signedDelta: consumption subtrai, transfer-in soma', () => {
  assert.equal(signedDelta('consumption', 4), -4);
  assert.equal(signedDelta('transfer-in', 4), 4);
});
test('requisição exige ≥1 linha e quantidades positivas', () => {
  const id = '0123456789abcdef01234567';
  assert.equal(
    requisitionSchema.safeParse({ toWarehouseId: id, lines: [], note: '' })
      .success,
    false,
  );
  assert.equal(
    requisitionSchema.safeParse({
      toWarehouseId: id,
      lines: [{ productId: id, quantity: 0 }],
      note: '',
    }).success,
    false,
  );
  assert.equal(
    requisitionSchema.safeParse({
      toWarehouseId: id,
      lines: [{ productId: id, quantity: 2 }],
      note: null,
    }).success,
    true,
  );
});
test('fecho de contagem aceita contado 0 mas não negativo', () => {
  const id = '0123456789abcdef01234567';
  assert.equal(
    closeCountSchema.safeParse({
      countId: id,
      counted: [{ productId: id, counted: 0 }],
      note: '',
    }).success,
    true,
  );
  assert.equal(
    closeCountSchema.safeParse({
      countId: id,
      counted: [{ productId: id, counted: -1 }],
      note: '',
    }).success,
    false,
  );
});

console.log(`\n${n} testes passaram.`);
