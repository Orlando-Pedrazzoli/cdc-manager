// 📄 scripts/tests/commissions.test.ts
// =============================================================================
// CDC Manager — Testes do motor financeiro (Fase 1)
// Correr: npx tsx scripts/tests/commissions.test.ts
// Sem framework: asserts nativos, sai com código ≠ 0 se algo falhar.
// =============================================================================
import assert from 'node:assert/strict';
import {
  resolveCommission,
  computeLineFinancials,
  discountCentsOf,
  bankersRound,
} from '../../src/lib/commissions';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log('commissions — resolução da cadeia');

test('override de linha (percent) vence tudo', () => {
  const r = resolveCommission({
    overrides: [{ treatmentTypeId: 'A', mode: 'percent', rate: 0.5 }],
    categoryOverrides: [
      { category: 'PROTESE FIXA', mode: 'percent', rate: 0.3 },
    ],
    doctorRate: 0.45,
    treatmentRate: 0.35,
    clinicDefault: 0.4,
    treatmentTypeId: 'A',
    category: 'PROTESE FIXA',
  });
  assert.equal(r.source, 'treatment-override');
  assert.equal(r.rate, 0.5);
});

test('override de linha FIXO', () => {
  const r = resolveCommission({
    overrides: [{ treatmentTypeId: 'A', mode: 'fixed', fixedCents: 2500 }],
    doctorRate: 0.45,
    clinicDefault: 0.4,
    treatmentTypeId: 'A',
  });
  assert.equal(r.mode, 'fixed');
  assert.equal(r.fixedCents, 2500);
  assert.equal(r.rate, 0);
});

test('override de categoria (case-insensitive) antes da base do médico', () => {
  const r = resolveCommission({
    overrides: [],
    categoryOverrides: [
      { category: 'protese fixa', mode: 'percent', rate: 0.3 },
    ],
    doctorRate: 0.45,
    clinicDefault: 0.4,
    treatmentTypeId: 'B',
    category: 'PROTESE FIXA',
  });
  assert.equal(r.source, 'category-override');
  assert.equal(r.rate, 0.3);
});

test('base do médico > taxa do ato > default da clínica', () => {
  assert.equal(
    resolveCommission({
      overrides: [],
      doctorRate: 0.45,
      treatmentRate: 0.35,
      clinicDefault: 0.4,
      treatmentTypeId: 'X',
    }).source,
    'doctor-rate',
  );
  assert.equal(
    resolveCommission({
      overrides: [],
      doctorRate: null,
      treatmentRate: 0.35,
      clinicDefault: 0.4,
      treatmentTypeId: 'X',
    }).source,
    'treatment-rate',
  );
  assert.equal(
    resolveCommission({
      overrides: [],
      doctorRate: null,
      treatmentRate: null,
      clinicDefault: 0.4,
      treatmentTypeId: 'X',
    }).source,
    'clinic-default',
  );
});

test('override inválido (rate fora de 0..1) é ignorado', () => {
  const r = resolveCommission({
    overrides: [{ treatmentTypeId: 'A', mode: 'percent', rate: 1.5 }],
    doctorRate: 0.45,
    clinicDefault: 0.4,
    treatmentTypeId: 'A',
  });
  assert.equal(r.source, 'doctor-rate');
});

console.log('commissions — desconto');

test('desconto em %: 10% de 250,00 € = 25,00 €', () => {
  assert.equal(discountCentsOf(25000, { mode: 'percent', value: 10 }), 2500);
});
test('desconto em %: 12,5% de 45,10 € = 5,64 € (563.75 → 564 banker)', () => {
  assert.equal(discountCentsOf(4510, { mode: 'percent', value: 12.5 }), 564);
});
test('desconto em € limitado ao PVP', () => {
  assert.equal(discountCentsOf(2000, { mode: 'amount', cents: 5000 }), 2000);
});
test('sem desconto = 0', () => {
  assert.equal(discountCentsOf(2000, null), 0);
});

console.log('commissions — linha completa (cenário de aceitação da Fase 1)');

test('Coroa PVP 250 €, desconto 10 %, custo 120 €, médico 40 % → 42,00 €', () => {
  const f = computeLineFinancials({
    listPriceCents: 25000,
    discount: { mode: 'percent', value: 10 },
    costCents: 12000,
    commission: {
      mode: 'percent',
      rate: 0.4,
      fixedCents: null,
      source: 'doctor-rate',
    },
  });
  assert.equal(f.discountCents, 2500);
  assert.equal(f.priceCents, 22500); // cobrado ao paciente
  assert.equal(f.commissionBaseCents, 10500); // 225 − 120
  assert.equal(f.commissionCents, 4200);
});

test('Sutura PVP 5 €, custo 0,80 €, sem desconto, 40 % → 1,68 €', () => {
  const f = computeLineFinancials({
    listPriceCents: 500,
    discount: null,
    costCents: 80,
    commission: {
      mode: 'percent',
      rate: 0.4,
      fixedCents: null,
      source: 'clinic-default',
    },
  });
  assert.equal(f.priceCents, 500);
  assert.equal(f.commissionBaseCents, 420);
  assert.equal(f.commissionCents, 168);
});

test('desconto 20 € em valor', () => {
  const f = computeLineFinancials({
    listPriceCents: 25000,
    discount: { mode: 'amount', cents: 2000 },
    costCents: 0,
    commission: {
      mode: 'percent',
      rate: 0.4,
      fixedCents: null,
      source: 'doctor-rate',
    },
  });
  assert.equal(f.priceCents, 23000);
  assert.equal(f.discountMode, 'amount');
  assert.equal(f.discountPct, null);
  assert.equal(f.commissionCents, 9200);
});

test('base nunca negativa: cortesia total com custo → comissão % = 0', () => {
  const f = computeLineFinancials({
    listPriceCents: 5000,
    discount: { mode: 'percent', value: 100 },
    costCents: 1000,
    commission: {
      mode: 'percent',
      rate: 0.4,
      fixedCents: null,
      source: 'doctor-rate',
    },
  });
  assert.equal(f.priceCents, 0);
  assert.equal(f.commissionBaseCents, 0);
  assert.equal(f.commissionCents, 0);
});

test('valor FIXO aplica-se independentemente da margem', () => {
  const f = computeLineFinancials({
    listPriceCents: 5000,
    discount: { mode: 'percent', value: 100 },
    costCents: 1000,
    commission: {
      mode: 'fixed',
      rate: 0,
      fixedCents: 1500,
      source: 'treatment-override',
    },
  });
  assert.equal(f.commissionCents, 1500);
  assert.equal(f.commissionMode, 'fixed');
});

test('registo antigo (sem desconto/custo) = fórmula anterior', () => {
  const f = computeLineFinancials({
    listPriceCents: 4510,
    discount: null,
    costCents: 0,
    commission: {
      mode: 'percent',
      rate: 0.4,
      fixedCents: null,
      source: 'clinic-default',
    },
  });
  assert.equal(f.priceCents, 4510);
  assert.equal(f.commissionCents, 1804);
});

test("banker's rounding mantém-se", () => {
  assert.equal(bankersRound(12.5), 12);
  assert.equal(bankersRound(13.5), 14);
  assert.equal(bankersRound(12.4), 12);
  assert.equal(bankersRound(12.6), 13);
});

test('rejeita cêntimos não inteiros', () => {
  assert.throws(() =>
    computeLineFinancials({
      listPriceCents: 10.5,
      discount: null,
      costCents: 0,
      commission: {
        mode: 'percent',
        rate: 0.4,
        fixedCents: null,
        source: 'clinic-default',
      },
    }),
  );
});

console.log(`\n${passed} testes passaram.`);
