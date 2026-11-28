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

import {
  creditNoteNetCents,
  creditNoteProducts,
  creditRequestFor,
  documentNumberLabel,
  invoiceProductsInOrder,
  pickMaturityDateId,
  type MoloniDoc,
} from '../../src/lib/moloni-payloads';

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

// --- 28/11: pedidos conferidos com a documentação da API ----------------------
const fatura: MoloniDoc = {
  number: 12,
  document_set: { name: 'COL' },
  document_type: { saft_code: 'FT' },
  products: [
    { document_product_id: 902, product_id: 52, name: 'Restauração', price: 60, qty: 1, order: 1, exemption_reason: 'M07', taxes: [] },
    { document_product_id: 901, product_id: 51, name: 'Consulta', price: 40, qty: 1, order: 0, exemption_reason: 'M07', taxes: [] },
    { document_product_id: 903, product_id: 53, name: 'Escova', price: 10, qty: 1, order: 2, taxes: [{ tax_id: 7, value: 23 }] },
  ],
};
const linhas = invoiceProductsInOrder(fatura);

test('número do documento: tipo + série/número, nos dois formatos da resposta', () => {
  assert.equal(documentNumberLabel(fatura), 'FT COL/12');
  assert.equal(documentNumberLabel({ document_set_name: 'A', number: '7' }), 'A/7');
  assert.equal(documentNumberLabel({}), '');
});

test('nota de crédito por linhas: related_id da linha da fatura, mesmo preço', () => {
  const p = creditNoteProducts(linhas, { kind: 'lines', lineIndexes: [1, 2] });
  assert.deepEqual(p.map(x => x.related_id), [902, 903]);
  assert.deepEqual(p.map(x => x.product_id), [52, 53]);
  assert.deepEqual(p.map(x => x.price), [60, 10]);
  assert.equal(p[0].exemption_reason, 'M07');
  assert.deepEqual(p[1].taxes, [{ tax_id: 7, value: 23, order: 0, cumulative: 0 }]);
  assert.equal('exemption_reason' in p[1], false);
  assert.deepEqual(p.map(x => x.order), [0, 1]);
});

test('nota de crédito por linhas: linha inexistente ou repetida é recusada', () => {
  assert.throws(() => creditNoteProducts(linhas, { kind: 'lines', lineIndexes: [5] }));
  assert.throws(() => creditNoteProducts(linhas, { kind: 'lines', lineIndexes: [0, 0] }));
  assert.throws(() => creditNoteProducts(linhas, { kind: 'lines', lineIndexes: [] }));
});

test('nota de crédito por valor: reparte sem passar o preço de cada linha', () => {
  const a = creditNoteProducts(linhas, { kind: 'value', cents: 1500 });
  assert.deepEqual(a.map(x => [x.related_id, x.price, x.qty]), [[901, 15, 1]]);
  const b = creditNoteProducts(linhas, { kind: 'value', cents: 5550 });
  assert.deepEqual(b.map(x => [x.related_id, x.price]), [[901, 40], [902, 15.5]]);
  assert.equal(creditNoteNetCents(b), 5550);
  const c = creditNoteProducts(linhas, { kind: 'value', cents: 6500, skipIndexes: [0] });
  assert.deepEqual(c.map(x => [x.related_id, x.price]), [[902, 60], [903, 5]]);
});

test('nota de crédito por valor: acima do que as linhas permitem é recusada', () => {
  assert.throws(() => creditNoteProducts(linhas, { kind: 'value', cents: 11001 }));
  assert.throws(() => creditNoteProducts(linhas, { kind: 'value', cents: 6000, skipIndexes: [1, 0] }));
  assert.throws(() => creditNoteProducts(linhas, { kind: 'value', cents: 0 }));
});

test('sem document_product_id na fatura não se envia nota de crédito', () => {
  assert.throws(
    () => creditNoteProducts([{ product_id: 1, name: 'x', price: 5, qty: 1 }], { kind: 'lines', lineIndexes: [0] }),
    /document_product_id/,
  );
});

test('o que creditar: linhas, valor, e anulação com e sem créditos anteriores', () => {
  assert.deepEqual(creditRequestFor({ kind: 'lines', lineIndexes: [2], totalCents: 1000 }, [], 3), { kind: 'lines', lineIndexes: [2] });
  assert.deepEqual(creditRequestFor({ kind: 'void', totalCents: 11000 }, [], 3), { kind: 'lines', lineIndexes: [0, 1, 2] });
  assert.deepEqual(creditRequestFor({ kind: 'total', totalCents: 7000 }, [{ kind: 'lines', lineIndexes: [0] }], 3), { kind: 'lines', lineIndexes: [1, 2] });
  assert.deepEqual(
    creditRequestFor({ kind: 'total', totalCents: 6500 }, [{ kind: 'lines', lineIndexes: [0] }, { kind: 'value' }], 3),
    { kind: 'value', cents: 6500, skipIndexes: [0] },
  );
  assert.deepEqual(creditRequestFor({ kind: 'value', totalCents: 500 }, [{ kind: 'lines', lineIndexes: [1] }], 3), { kind: 'value', cents: 500, skipIndexes: [1] });
});

test('prazo de vencimento do cliente: o de 0 dias, senão o primeiro', () => {
  assert.equal(pickMaturityDateId([{ maturity_date_id: 4, days: 30 }, { maturity_date_id: 9, days: '0' }]), 9);
  assert.equal(pickMaturityDateId([{ maturity_date_id: 4, days: 30 }]), 4);
  assert.equal(pickMaturityDateId([]), null);
});

console.log(`\nmoloni-fatura: ${n} testes OK`);
