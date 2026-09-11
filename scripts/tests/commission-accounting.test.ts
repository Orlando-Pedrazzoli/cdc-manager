// 📄 scripts/tests/commission-accounting.test.ts
// Correr: npx tsx scripts/tests/commission-accounting.test.ts
import assert from 'node:assert/strict';
import {
  needsAdjustmentOnVoid,
  lisbonMonthOf,
  monthBoundsUtc,
  producedProceduresMatch,
} from '../../src/lib/commission-accounting';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('mês civil de Lisboa (DST): 2026-03-31 23:30 UTC é já abril em Lisboa', () => {
  assert.equal(lisbonMonthOf(new Date('2026-03-31T23:30:00Z')), '2026-04');
});
test('mês civil de Lisboa (inverno): 2026-01-31 23:30 UTC é janeiro', () => {
  assert.equal(lisbonMonthOf(new Date('2026-01-31T23:30:00Z')), '2026-01');
});
test('anular no próprio mês → sem estorno', () => {
  assert.equal(
    needsAdjustmentOnVoid(
      new Date('2026-09-03T10:00:00Z'),
      new Date('2026-09-11T09:00:00Z'),
    ),
    false,
  );
});
test('anular em mês posterior → estorno', () => {
  assert.equal(
    needsAdjustmentOnVoid(
      new Date('2026-08-28T10:00:00Z'),
      new Date('2026-09-11T09:00:00Z'),
    ),
    true,
  );
});
test('ato sem executedAt (planeado) → sem estorno', () => {
  assert.equal(needsAdjustmentOnVoid(null), false);
});
test('limites do mês em UTC (setembro 2026, UTC+1 em Lisboa)', () => {
  const [s, e] = monthBoundsUtc('2026-09');
  assert.equal(s.toISOString(), '2026-08-31T23:00:00.000Z');
  assert.equal(e.toISOString(), '2026-09-30T23:00:00.000Z');
});
test('$match inclui void anulado depois do fecho', () => {
  const [s, e] = monthBoundsUtc('2026-08');
  const m = producedProceduresMatch(s, e, { doctorId: 'D' }) as {
    $or: unknown[];
    doctorId: string;
  };
  assert.equal(m.doctorId, 'D');
  assert.equal(m.$or.length, 2);
});
console.log(`\n${n} testes passaram.`);
