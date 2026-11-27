// 📄 scripts/tests/moloni-fatura.test.ts
// =============================================================================
// Moloni (25/11, Victor e Isabel): série por clínica, fatura + recibo,
// impostos dos produtos, anulação só no próprio dia, notas de crédito
// totais e parciais, dívida = total − créditos − pagamentos.
// Correr: npx tsx scripts/tests/moloni-fatura.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  canVoidOnDay,
  creditableCents,
  creditedCents,
  invoiceDueCents,
  lisbonDay,
  validatePartialCredit,
} from '../../src/lib/credit-notes';
import {
  documentSetFor,
  paymentMethodId,
  taxIdFor,
} from '../../src/lib/moloni';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

// --- Configuração ------------------------------------------------------------
test('série por clínica (MOLONI_DOCUMENT_SETS) com recurso à série única', () => {
  process.env.MOLONI_DOCUMENT_SETS = '{"colombo": 111, "buraca": "222"}';
  process.env.MOLONI_DOCUMENT_SET_ID = '';
  assert.equal(documentSetFor('colombo'), 111);
  assert.equal(documentSetFor('buraca'), 222);
  assert.equal(documentSetFor('outra'), null);
  process.env.MOLONI_DOCUMENT_SET_ID = '999';
  assert.equal(documentSetFor('outra'), 999);
  process.env.MOLONI_DOCUMENT_SETS = 'não é json';
  assert.equal(documentSetFor('colombo'), 999);
});

test('meios de pagamento e impostos lidos de JSON; valores inválidos ignorados', () => {
  process.env.MOLONI_PAYMENT_METHODS = '{"cash":1,"card":"2","mbway":0,"transfer":-3}';
  assert.equal(paymentMethodId('cash'), 1);
  assert.equal(paymentMethodId('card'), 2);
  assert.equal(paymentMethodId('mbway'), null);
  assert.equal(paymentMethodId('transfer'), null);
  process.env.MOLONI_TAX_IDS = '{"23": 4567}';
  assert.equal(taxIdFor(23), 4567);
  assert.equal(taxIdFor(6), null);
});

// --- Anulação só no próprio dia (dia de Lisboa) ------------------------------
test('anular: mesmo dia de Lisboa sim, dia seguinte não', () => {
  const issued = new Date('2026-11-25T09:00:00Z');
  assert.equal(canVoidOnDay(issued, new Date('2026-11-25T23:30:00Z')), true);
  assert.equal(canVoidOnDay(issued, new Date('2026-11-26T00:10:00Z')), false);
  // verão (UTC+1): 23:30 UTC já é o dia seguinte em Lisboa
  const summer = new Date('2026-07-10T10:00:00Z');
  assert.equal(lisbonDay(new Date('2026-07-10T23:30:00Z')), '2026-07-11');
  assert.equal(canVoidOnDay(summer, new Date('2026-07-10T23:30:00Z')), false);
});

// --- Dívida e créditos --------------------------------------------------------
test('dívida = total − créditos − pagamentos (nunca negativa)', () => {
  const inv = { totalCents: 10000, paidCents: 3000, status: 'pending', creditNotes: [{ totalCents: 1500 }] };
  assert.equal(creditedCents(inv), 1500);
  assert.equal(creditableCents(inv), 8500);
  assert.equal(invoiceDueCents(inv), 5500);
  assert.equal(invoiceDueCents({ ...inv, paidCents: 9000 }), 0);
  // antigos sem paidCents → pagos; anulada → 0
  assert.equal(invoiceDueCents({ totalCents: 5000 }), 0);
  assert.equal(invoiceDueCents({ totalCents: 5000, paidCents: 0, status: 'voided' }), 0);
});

// --- Nota de crédito parcial ------------------------------------------------------
const inv3 = {
  totalCents: 18000,
  status: 'issued',
  lines: [{ priceCents: 5000 }, { priceCents: 8000 }, { priceCents: 5000 }],
  creditNotes: [] as { totalCents: number }[],
};

test('parcial por linhas: soma das linhas escolhidas', () => {
  const r = validatePartialCredit(inv3, { kind: 'lines', lineIndexes: [0, 2, 2], creditedLineIndexes: [] });
  assert.deepEqual(r, { totalCents: 10000 });
});

test('parcial por linhas: linha inválida ou já creditada é recusada', () => {
  assert.match(
    (validatePartialCredit(inv3, { kind: 'lines', lineIndexes: [5], creditedLineIndexes: [] }) as { error: string }).error,
    /Linha inválida/,
  );
  assert.match(
    (validatePartialCredit(inv3, { kind: 'lines', lineIndexes: [1], creditedLineIndexes: [1] }) as { error: string }).error,
    /já foi creditada/,
  );
});

test('parcial que cobre tudo → pede nota de crédito total', () => {
  const r = validatePartialCredit(inv3, { kind: 'lines', lineIndexes: [0, 1, 2], creditedLineIndexes: [] });
  assert.match((r as { error: string }).error, /nota de crédito total/);
});

test('parcial por valor: desconto esquecido, sem exceder o que falta', () => {
  assert.deepEqual(validatePartialCredit(inv3, { kind: 'value', valueCents: 1800 }), { totalCents: 1800 });
  const withCredit = { ...inv3, creditNotes: [{ totalCents: 17000 }] };
  assert.match(
    (validatePartialCredit(withCredit, { kind: 'value', valueCents: 1500 }) as { error: string }).error,
    /excede/,
  );
  assert.match(
    (validatePartialCredit(inv3, { kind: 'value', valueCents: 0 }) as { error: string }).error,
    /Indique o valor/,
  );
  assert.match(
    (validatePartialCredit({ ...inv3, status: 'voided' }, { kind: 'value', valueCents: 100 }) as { error: string }).error,
    /anulado/,
  );
});

console.log(`\nmoloni-fatura: ${n} testes OK`);
