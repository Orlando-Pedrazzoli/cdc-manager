// 📄 scripts/tests/ronda-9b-fase2.test.ts
// =============================================================================
// 9.ª ronda (b), fase 2 — respostas do Victor de 25/11
//   A1: desconto na faturação · A3: atrasos das consultas ·
//   A11: três indicadores dos orçamentos · C4: aviso de sobreposição ·
//   F3: ecrãs em maiúsculas
// Correr: npx tsx scripts/tests/ronda-9b-fase2.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  allocateCheckoutDiscount,
  applyBillingDiscount,
  checkoutDiscountTotal,
  parseDiscountField,
} from '../../src/lib/checkout-discount';
import { budgetIndicatorsByDoctor, budgetTicketStats } from '../../src/lib/budgets';
import { intervalsOverlap, overlapWarningText } from '../../src/lib/appointment-overlap';
import {
  consultDelay,
  delayPeriodRange,
  minutesLabel,
  shiftDelayPeriod,
  summarizeDelays,
} from '../../src/lib/consult-delays';
import { UPPERCASE_DISPLAY_CSS } from '../../src/lib/uppercase-display';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

test('desconto: leitura do campo (% e €)', () => {
  assert.equal(parseDiscountField('percent', ''), null);
  assert.equal(parseDiscountField('amount', '0'), null);
  assert.deepEqual(parseDiscountField('percent', '10'), { mode: 'percent', value: 10 });
  assert.deepEqual(parseDiscountField('percent', '12,5%'), { mode: 'percent', value: 12.5 });
  assert.deepEqual(parseDiscountField('amount', '25,50'), { mode: 'amount', cents: 2550 });
  assert.deepEqual(parseDiscountField('amount', '25.5 €'), { mode: 'amount', cents: 2550 });
  assert.equal(parseDiscountField('percent', '101'), 'invalid');
  assert.equal(parseDiscountField('amount', '-5'), 'invalid');
  assert.equal(parseDiscountField('amount', 'abc'), 'invalid');
});

test('desconto em %: a mesma percentagem em cada ato', () => {
  const lines = [
    { id: 'a', priceCents: 6000 },
    { id: 'b', priceCents: 3550 },
  ];
  const d = { mode: 'percent', value: 10 } as const;
  const alloc = allocateCheckoutDiscount(lines, d);
  assert.equal(alloc.get('a'), 600);
  assert.equal(alloc.get('b'), 355);
  assert.equal(checkoutDiscountTotal(lines, d), 955);
  assert.equal(sum(alloc), 955);
});

test('desconto em €: repartido pelos atos, soma exata ao cêntimo', () => {
  const lines = [
    { id: 'a', priceCents: 3333 },
    { id: 'b', priceCents: 3333 },
    { id: 'c', priceCents: 3334 },
  ];
  const alloc = allocateCheckoutDiscount(lines, { mode: 'amount', cents: 1000 });
  assert.equal(sum(alloc), 1000);
  for (const l of lines) assert.ok((alloc.get(l.id) ?? 0) <= l.priceCents);
  // um só ato leva o desconto todo
  assert.equal(
    allocateCheckoutDiscount([{ id: 'x', priceCents: 5000 }], { mode: 'amount', cents: 1250 }).get('x'),
    1250,
  );
  // pedido maior do que o total fica limitado ao total
  assert.equal(checkoutDiscountTotal(lines, { mode: 'amount', cents: 999_999 }), 10_000);
  // sem desconto: tudo a zero
  assert.equal(sum(allocateCheckoutDiscount(lines, null)), 0);
});

test('desconto: valores do ato depois de aplicado', () => {
  const line = {
    listPriceCents: 10_000,
    discountCents: 0,
    priceCents: 10_000,
    costCents: 2000,
    commissionMode: 'percent' as const,
    commissionRate: 0.4,
    commissionCents: 3200,
  };
  const r = applyBillingDiscount(line, 1000, { percent: 10, recomputeCommission: true });
  assert.equal(r.priceCents, 9000);
  assert.equal(r.discountCents, 1000);
  assert.equal(r.discountMode, 'percent');
  assert.equal(r.discountPct, 10);
  assert.equal(r.listPriceCents, 10_000);
  assert.equal(r.commissionBaseCents, 7000);
  assert.equal(r.commissionCents, 2800);
  // mês do ato já fechado: a comissão não é mexida
  const closed = applyBillingDiscount(line, 1000, { percent: 10, recomputeCommission: false });
  assert.equal(closed.priceCents, 9000);
  assert.equal(closed.commissionCents, 3200);
  // comissão de valor fixo não depende do preço
  const fixed = applyBillingDiscount(
    { ...line, commissionMode: 'fixed', commissionCents: 1500 },
    1000,
    { percent: null, recomputeCommission: true },
  );
  assert.equal(fixed.commissionCents, 1500);
  // ato que já tinha desconto: soma, e deixa de ser descrito por uma %
  const twice = applyBillingDiscount(
    { ...line, discountCents: 500, priceCents: 9500 },
    950,
    { percent: 10, recomputeCommission: true },
  );
  assert.equal(twice.discountCents, 1450);
  assert.equal(twice.priceCents, 8550);
  assert.equal(twice.discountMode, 'amount');
  assert.equal(twice.discountPct, null);
  assert.equal(twice.listPriceCents, 10_000);
  // registo antigo sem PVP guardado: PVP = preço + desconto
  const legacy = applyBillingDiscount(
    { priceCents: 4000, commissionRate: 0.5, commissionCents: 2000 },
    400,
    { percent: null, recomputeCommission: true },
  );
  assert.equal(legacy.listPriceCents, 4000);
  assert.equal(legacy.priceCents, 3600);
});

test('orçamentos: os três indicadores do Victor', () => {
  const plans = [
    { valueCents: 100_000, accepted: true, doneCents: 100_000 }, // feito por inteiro
    { valueCents: 200_000, accepted: true, doneCents: 50_000 }, // feito em parte
    { valueCents: 100_000, accepted: false, doneCents: 0 }, // sem tratamento
    { valueCents: 0, accepted: false, doneCents: 0 },
  ];
  const s = budgetTicketStats(plans);
  // taxa de conversão: 2 de 4 orçamentos com tratamento feito
  assert.equal(s.conversionN, 50);
  // conversão financeira: 1500 € feitos de 4000 € apresentados
  assert.equal(s.conversionCents, 38);
  // ticket médio: 1500 € ÷ 2 orçamentos convertidos
  assert.equal(s.avgDoneCents, 75_000);
  assert.equal(budgetTicketStats([]).conversionN, null);
});

test('orçamentos: indicadores por médico', () => {
  const rows = budgetIndicatorsByDoctor([
    { doctorId: 'a', valueCents: 100_000, accepted: true, doneCents: 100_000 },
    { doctorId: 'a', valueCents: 100_000, accepted: false, doneCents: 0 },
    { doctorId: 'b', valueCents: 300_000, accepted: true, doneCents: 30_000 },
  ]);
  assert.deepEqual(
    rows.map(r => [r.doctorId, r.presentedN, r.startedN, r.conversionN, r.conversionCents, r.avgDoneCents]),
    [
      ['b', 1, 1, 100, 10, 30_000],
      ['a', 2, 1, 50, 50, 100_000],
    ],
  );
});

test('sobreposição: intervalos e texto do aviso', () => {
  const t = (h: number, m = 0) => Date.UTC(2026, 10, 25, h, m);
  assert.equal(intervalsOverlap(t(10), t(10, 30), t(10, 15), t(10, 45)), true);
  // encostadas não se sobrepõem
  assert.equal(intervalsOverlap(t(10), t(10, 30), t(10, 30), t(11)), false);
  assert.equal(intervalsOverlap(t(10), t(10, 30), t(9), t(10)), false);
  assert.equal(overlapWarningText('Dra. ANA', []), '');
  const one = overlapWarningText('Dra. ANA', [
    { startLabel: '15:00', endLabel: '15:30', patientName: 'Maria Silva' },
  ]);
  assert.ok(one.includes('Dra. ANA já tem marcação neste horário: 15:00–15:30 (Maria Silva)'));
  const many = overlapWarningText(
    'Dr. RUI',
    [1, 2, 3, 4].map(i => ({ startLabel: `1${i}:00`, endLabel: `1${i}:30`, patientName: null })),
  );
  assert.ok(many.includes('marcações'));
  assert.ok(many.includes('e mais 1'));
});

test('atrasos: tempo para lá do fim marcado e início tardio', () => {
  const t = (h: number, m = 0) => Date.UTC(2026, 10, 25, h, m);
  // marcada 10:00–10:30; chamado às 10:10; concluída às 10:48
  const d = consultDelay({
    startMs: t(10),
    endMs: t(10, 30),
    startedMs: t(10, 10),
    completedMs: t(10, 48),
    checkedInMs: t(9, 55),
  });
  assert.deepEqual(d, {
    overrunMin: 18,
    lateStartMin: 10,
    patientLateMin: 0,
    actualMin: 38,
    plannedMin: 30,
  });
  // acabou antes da hora: sem atraso
  assert.equal(
    consultDelay({ startMs: t(10), endMs: t(10, 30), startedMs: t(10), completedMs: t(10, 20) })?.overrunMin,
    0,
  );
  // paciente chegou 15 min tarde
  assert.equal(
    consultDelay({
      startMs: t(10),
      endMs: t(10, 30),
      startedMs: t(10, 16),
      completedMs: t(10, 40),
      checkedInMs: t(10, 15),
    })?.patientLateMin,
    15,
  );
  // sem início ou fim reais não entra nas contas
  assert.equal(consultDelay({ startMs: t(10), endMs: t(10, 30), startedMs: null, completedMs: t(11) }), null);
  assert.equal(consultDelay({ startMs: t(10), endMs: t(10, 30), startedMs: t(10), completedMs: null }), null);
});

test('atrasos: resumo por médico', () => {
  const mk = (overrunMin: number, lateStartMin = 0) => ({
    overrunMin,
    lateStartMin,
    patientLateMin: 0,
    actualMin: 30 + overrunMin,
    plannedMin: 30,
  });
  const rows = summarizeDelays([
    { key: 'a', delay: mk(10, 5) },
    { key: 'a', delay: mk(0) },
    { key: 'a', delay: mk(20) },
    { key: 'b', delay: mk(0) },
  ]);
  assert.deepEqual(rows[0], {
    key: 'a',
    consults: 3,
    delayed: 2,
    overrunMin: 30,
    avgOverrunMin: 15,
    maxOverrunMin: 20,
    lateStartMin: 5,
    delayedPct: 67,
  });
  assert.equal(rows[1].key, 'b');
  assert.equal(rows[1].avgOverrunMin, null);
  assert.equal(minutesLabel(12), '12 min');
  assert.equal(minutesLabel(65), '1 h 05 min');
});

test('atrasos: dia, semana (seg–dom) e mês', () => {
  // 25/11/2026 é uma quarta-feira
  assert.deepEqual(delayPeriodRange('2026-11-25', 'dia'), { from: '2026-11-25', to: '2026-11-26' });
  assert.deepEqual(delayPeriodRange('2026-11-25', 'semana'), { from: '2026-11-23', to: '2026-11-30' });
  assert.deepEqual(delayPeriodRange('2026-11-29', 'semana'), { from: '2026-11-23', to: '2026-11-30' });
  assert.deepEqual(delayPeriodRange('2026-11-25', 'mes'), { from: '2026-11-01', to: '2026-12-01' });
  assert.deepEqual(delayPeriodRange('2026-12-31', 'mes'), { from: '2026-12-01', to: '2027-01-01' });
  assert.equal(shiftDelayPeriod('2026-11-25', 'dia', -1), '2026-11-24');
  assert.equal(shiftDelayPeriod('2026-11-25', 'semana', 1), '2026-12-02');
  assert.equal(shiftDelayPeriod('2026-01-31', 'mes', 1), '2026-02-01');
  assert.equal(shiftDelayPeriod('2026-01-15', 'mes', -1), '2025-12-01');
});

test('maiúsculas: credenciais e textos longos ficam de fora', () => {
  assert.ok(UPPERCASE_DISPLAY_CSS.includes('body { text-transform: uppercase; }'));
  for (const sel of [
    'textarea',
    "input[type='email']",
    "input[type='password']",
    "input[name*='user' i]",
    '[data-keep-case]',
  ]) {
    assert.ok(UPPERCASE_DISPLAY_CSS.includes(sel), sel);
  }
});

console.log(`\n${n} testes OK`);
