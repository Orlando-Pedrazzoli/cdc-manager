// 📄 scripts/tests/ronda-9c-fase-b.test.ts
// =============================================================================
// 9.ª ronda (c), fase B — pontos da Giulia (28/11/2026)
//   · 23: pagamento em vários meios + diário de caixa por pagamento
//   · 35: "Há próxima consulta?"
//   · 32: notas do tratamento
//   · 26: grelha da vista mensal
//   · 34: rascunho da autorização de menor desacompanhado
// Correr: npx tsx scripts/tests/ronda-9c-fase-b.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  cashEntries,
  isPaymentMethod,
  parseEurosField,
  paymentMethodsLabel,
  splitCheckoutPayments,
} from '../../src/lib/checkout-payments';
import { checkoutSchema } from '../../src/lib/validations/billing';
import {
  FOLLOW_UP_REASONS,
  followUpLabel,
  parseFollowUp,
} from '../../src/lib/follow-up';
import { cleanTreatmentNote, noteAuthorLabel, TREATMENT_NOTE_MAX } from '../../src/lib/treatment-notes';
import {
  isMonthKey,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  shortPatientName,
} from '../../src/lib/month-grid';
import { MODELOS_CLINICA, MODELOS_RASCUNHO } from '../../src/lib/data/modelos-clinica';
import { PLACEHOLDERS } from '../../src/lib/data/document-templates';
import { placeholdersIn } from '../../src/lib/document-merge';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}
const A = 'a'.repeat(24);

console.log('9.ª ronda (c) — fase B');

// --- Ponto 23 ------------------------------------------------------------------
test('valores em euros: vírgula, ponto, vazio e inválido', () => {
  assert.equal(parseEurosField('12,50'), 1250);
  assert.equal(parseEurosField(' 30 '), 3000);
  assert.equal(parseEurosField('10.5 €'), 1050);
  assert.equal(parseEurosField(''), null);
  assert.equal(parseEurosField(null), null);
  assert.ok(Number.isNaN(parseEurosField('abc')));
});

test('um só meio: um pagamento com o valor todo; nada pago = nenhum pagamento', () => {
  assert.deepEqual(
    splitCheckoutPayments({ paidNowCents: 4000, method: 'card', secondMethod: null, secondCents: null }),
    { parts: [{ amountCents: 4000, method: 'card' }] },
  );
  assert.deepEqual(
    splitCheckoutPayments({ paidNowCents: 0, method: 'cash', secondMethod: null, secondCents: null }),
    { parts: [] },
  );
});

test('exemplo da Giulia: 10 € em numerário e 30 € em multibanco', () => {
  const r = splitCheckoutPayments({ paidNowCents: 4000, method: 'card', secondMethod: 'cash', secondCents: 1000 });
  assert.deepEqual(r, {
    parts: [
      { amountCents: 3000, method: 'card' },
      { amountCents: 1000, method: 'cash' },
    ],
  });
  if ('parts' in r) assert.equal(r.parts.reduce((s, p) => s + p.amountCents, 0), 4000);
});

test('dois meios: recusa o que não fecha', () => {
  const bad = (i: Parameters<typeof splitCheckoutPayments>[0]) => {
    const r = splitCheckoutPayments(i);
    assert.ok('error' in r, JSON.stringify(i));
  };
  bad({ paidNowCents: 4000, method: 'card', secondMethod: 'card', secondCents: 1000 }); // mesmo meio
  bad({ paidNowCents: 4000, method: 'card', secondMethod: 'cash', secondCents: 4000 }); // nada no 1.º
  bad({ paidNowCents: 4000, method: 'card', secondMethod: 'cash', secondCents: 5000 }); // mais do que o pago
  bad({ paidNowCents: 4000, method: 'card', secondMethod: 'cash', secondCents: null }); // sem valor
  bad({ paidNowCents: 4000, method: 'card', secondMethod: 'cash', secondCents: 0 });
  bad({ paidNowCents: 4000, method: 'card', secondMethod: null, secondCents: 1000 }); // valor sem meio
  bad({ paidNowCents: 4000, method: 'card', secondMethod: 'cash', secondCents: NaN });
  bad({ paidNowCents: 0, method: 'card', secondMethod: 'cash', secondCents: 100 }); // nada pago agora
});

test('pagamento parcial em dois meios: divide só o que é pago agora', () => {
  // total 100 €, paga agora 60 €: 20 € MB WAY + 40 € numerário
  assert.deepEqual(
    splitCheckoutPayments({ paidNowCents: 6000, method: 'cash', secondMethod: 'mbway', secondCents: 2000 }),
    { parts: [{ amountCents: 4000, method: 'cash' }, { amountCents: 2000, method: 'mbway' }] },
  );
});

test('formulário da cobrança: segundo meio opcional', () => {
  const base = { clinicId: A, patientId: A, procedureIds: JSON.stringify([A]), paymentMethod: 'card', nif: '', paidNowCents: '' };
  const one = checkoutSchema.safeParse({ ...base, secondMethod: '', secondCents: '' });
  assert.ok(one.success);
  if (one.success) {
    assert.equal(one.data.secondMethod, null);
    assert.equal(one.data.secondCents, null);
  }
  const two = checkoutSchema.safeParse({ ...base, secondMethod: 'cash', secondCents: '10,00' });
  assert.ok(two.success);
  if (two.success) {
    assert.equal(two.data.secondMethod, 'cash');
    assert.equal(two.data.secondCents, 1000);
  }
  // formulário antigo, sem os campos novos, continua a passar
  assert.ok(checkoutSchema.safeParse(base).success);
  assert.equal(checkoutSchema.safeParse({ ...base, secondMethod: 'cheque' }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, secondMethod: 'cash', secondCents: 'x' }).success, false);
});

test('rótulo dos meios de um documento', () => {
  assert.equal(paymentMethodsLabel({ paymentMethod: 'cash' }), 'Numerário');
  assert.equal(
    paymentMethodsLabel({ paymentMethod: 'card', payments: [{ method: 'card' }, { method: 'cash' }, { method: 'card' }] }),
    'Multibanco / cartão + Numerário',
  );
  assert.equal(paymentMethodsLabel({ paymentMethod: 'card', payments: [] }), 'Multibanco / cartão');
  assert.equal(paymentMethodsLabel({}), '—');
  assert.equal(isPaymentMethod('mbway'), true);
  assert.equal(isPaymentMethod('cheque'), false);
});

test('diário de caixa: uma entrada por pagamento, no seu dia e no seu meio', () => {
  const d1 = new Date('2026-11-27T10:00:00Z');
  const d2 = new Date('2026-11-28T15:00:00Z');
  // 100 €: 60 € no dia 27 (40 numerário + 20 MB WAY) e 40 € no dia 28 por transferência
  const entries = cashEntries({
    paidAt: d1,
    paymentMethod: 'cash',
    totalCents: 10000,
    payments: [
      { paidAt: d1, method: 'cash', amountCents: 4000 },
      { paidAt: d1, method: 'mbway', amountCents: 2000 },
      { paidAt: d2, method: 'transfer', amountCents: 4000 },
    ],
  });
  assert.equal(entries.length, 3);
  assert.equal(entries.reduce((s, e) => s + e.amountCents, 0), 10000);
  assert.deepEqual(entries.filter(e => e.paidAt === d1).map(e => e.method), ['cash', 'mbway']);
  // documento ainda sem pagamentos: nada entra na caixa
  assert.deepEqual(cashEntries({ paidAt: null, paymentMethod: 'card', totalCents: 5000, payments: [] }), []);
  // documento antigo (sem a lista de pagamentos): conta pelo total, como sempre
  assert.deepEqual(cashEntries({ paidAt: d1, paymentMethod: 'card', totalCents: 5000 }), [
    { paidAt: d1, method: 'card', amountCents: 5000 },
  ]);
});

// --- Ponto 35 ------------------------------------------------------------------
test('próxima consulta: a pergunta é obrigatória', () => {
  assert.ok('error' in parseFollowUp({ answer: '', reason: '', minutes: '', note: '' }));
  assert.ok('error' in parseFollowUp({ answer: 'talvez', reason: '', minutes: '', note: '' }));
  assert.deepEqual(parseFollowUp({ answer: 'nao', reason: 'tempo', minutes: '60', note: 'x' }), {
    followUp: { needed: false, reason: null, minutes: null, note: null },
  });
});

test('próxima consulta: com "sim", o motivo e o que ele exige', () => {
  const p = (reason: string, minutes = '', note = '') => parseFollowUp({ answer: 'sim', reason, minutes, note });
  assert.ok('error' in p(''));
  assert.ok('error' in p('inventado'));
  assert.deepEqual(p('continuar'), { followUp: { needed: true, reason: 'continuar', minutes: null, note: null } });
  assert.ok('error' in p('tempo')); // falta a duração
  assert.deepEqual(p('tempo', '90'), { followUp: { needed: true, reason: 'tempo', minutes: 90, note: null } });
  assert.ok('error' in p('especialidade')); // falta para onde
  assert.deepEqual(p('especialidade', '', ' Endodontia '), {
    followUp: { needed: true, reason: 'especialidade', minutes: null, note: 'Endodontia' },
  });
  assert.ok('error' in p('outro'));
  assert.ok('error' in p('controlo', '3')); // menos de 5 min
  assert.ok('error' in p('controlo', '1000'));
  assert.ok('error' in p('controlo', '12.5'));
  assert.equal(FOLLOW_UP_REASONS.length, 5);
});

test('próxima consulta: o que a receção lê', () => {
  assert.equal(followUpLabel(null), null); // consultas anteriores: sem resposta
  assert.equal(followUpLabel({}), null);
  assert.equal(followUpLabel({ needed: false }), 'Sem próxima consulta');
  assert.equal(
    followUpLabel({ needed: true, reason: 'especialidade', minutes: 60, note: 'Endodontia' }),
    'Marcar: Encaminhar para outra especialidade · 60 min · Endodontia',
  );
  assert.equal(followUpLabel({ needed: true, reason: 'continuar' }), 'Marcar: Continuar o tratamento');
});

// --- Ponto 32 ------------------------------------------------------------------
test('notas do tratamento: texto limpo e limites', () => {
  assert.deepEqual(cleanTreatmentNote('  coroa do 36 \r\n\r\n\r\n\r\ndepois da endo  '), { text: 'coroa do 36\n\ndepois da endo' });
  assert.ok('error' in cleanTreatmentNote('  '));
  assert.ok('error' in cleanTreatmentNote('ab'));
  assert.ok('error' in cleanTreatmentNote(null));
  assert.ok('error' in cleanTreatmentNote('x'.repeat(TREATMENT_NOTE_MAX + 1)));
  assert.ok('text' in cleanTreatmentNote('x'.repeat(TREATMENT_NOTE_MAX)));
  assert.equal(noteAuthorLabel('Dra. Ana', 'doctor'), 'Dra. Ana (Médico)');
  assert.equal(noteAuthorLabel('Giulia', 'receptionist'), 'Giulia (Receção)');
  assert.equal(noteAuthorLabel(null, null), 'Utilizador removido');
});

// --- Ponto 26 ------------------------------------------------------------------
test('vista mensal: novembro de 2026 começa a 26/10 (segunda) e acaba a 6/12', () => {
  const g = monthGrid('2026-11'); // 1/11/2026 é domingo
  assert.equal(g.length, 6);
  assert.ok(g.every(w => w.length === 7));
  assert.equal(g[0][0].date, '2026-10-26');
  assert.equal(g[0][0].inMonth, false);
  assert.equal(g[0][6].date, '2026-11-01');
  assert.equal(g[0][6].inMonth, true);
  assert.equal(g[5][6].date, '2026-12-06');
  assert.equal(g.flat().filter(c => c.inMonth).length, 30);
});

test('vista mensal: fevereiro de 2027 cabe em 4 semanas; mudança de hora não desalinha', () => {
  const feb = monthGrid('2027-02'); // 1/2/2027 é segunda, 28 dias
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0].date, '2027-02-01');
  assert.equal(feb[3][6].date, '2027-02-28');
  // março e outubro têm mudança de hora: os dias continuam seguidos
  for (const m of ['2027-03', '2026-10']) {
    const days = monthGrid(m).flat().map(c => c.date);
    assert.equal(new Set(days).size, days.length, m);
    for (let i = 1; i < days.length; i++)
      assert.equal(new Date(`${days[i]}T12:00:00Z`).getTime() - new Date(`${days[i - 1]}T12:00:00Z`).getTime(), 86_400_000, m);
  }
});

test('vista mensal: navegar entre meses e rótulos', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(shiftMonth('2026-11', 0), '2026-11');
  assert.equal(monthOf('2026-11-28'), '2026-11');
  assert.equal(isMonthKey('2026-11'), true);
  assert.equal(isMonthKey('2026-13'), false);
  assert.equal(isMonthKey('2026-1'), false);
  assert.equal(isMonthKey(undefined), false);
  assert.equal(monthLabel('2026-11'), 'novembro de 2026');
  assert.equal(shortPatientName('ANA PAULA DOS SANTOS BORGES'), 'Ana Borges');
  assert.equal(shortPatientName('  maria  '), 'Maria');
  assert.equal(shortPatientName(null), '—');
});

// --- Ponto 34 ------------------------------------------------------------------
test('autorização de menor desacompanhado: rascunho, inativo até ser revisto', () => {
  assert.equal(MODELOS_RASCUNHO.length, 1);
  const t = MODELOS_RASCUNHO[0];
  assert.equal(t.draft, true);
  assert.equal(t.kind, 'autorizacao');
  assert.ok(!MODELOS_CLINICA.some(m => m.key === t.key));
  assert.ok(MODELOS_CLINICA.every(m => !m.draft)); // os da clínica nunca são rascunho
  const known = new Set(PLACEHOLDERS.map(p => p.key));
  for (const p of placeholdersIn(t.body)) assert.ok(known.has(p), p);
  assert.doesNotMatch(t.body, /[☐−◆⚠\t ]/);
  assert.ok(t.body.startsWith('IDENTIFICAÇÃO\n'));
});

console.log(`\n${n} testes OK`);
