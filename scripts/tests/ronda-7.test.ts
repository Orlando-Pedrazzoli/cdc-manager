// 📄 scripts/tests/ronda-7.test.ts
// Correr: npx tsx scripts/tests/ronda-7.test.ts
import assert from 'node:assert/strict';
import {
  BOOKING_BLOCK_REASON_MAX,
  bookingBlockError,
  isBookingBlocked,
  parseBlockReason,
} from '../../src/lib/booking-block';

import { AGENDA_COLORS, AGENDA_LEGEND, agendaColor } from '../../src/lib/agenda-colors';
import { buildPatientAlerts } from '../../src/lib/patient-alerts';
import {
  LOWER_PRIMARY_TEETH,
  UPPER_PRIMARY_TEETH,
  defaultDentition,
  isChildAge,
  isPrimaryTooth,
} from '../../src/lib/domain';
import { ageInYears } from '../../src/lib/age';
import {
  isDoNotUseName,
  renderMessage,
  toWhatsAppNumber,
  whatsAppLink,
} from '../../src/lib/patient-messages';
import {
  isVatRate,
  parsePriceToCents,
  saleLineTotals,
  saleTotals,
  vatIncluded,
} from '../../src/lib/product-sales';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('bloqueio: paciente sem data de bloqueio marca normalmente', () => {
  assert.equal(isBookingBlocked(null), false);
  assert.equal(isBookingBlocked({}), false);
  assert.equal(isBookingBlocked({ bookingBlockedAt: null }), false);
  assert.equal(bookingBlockError({ bookingBlockedAt: null }), null);
  // motivo antigo sem data não bloqueia (foi desbloqueado)
  assert.equal(
    bookingBlockError({ bookingBlockedAt: null, bookingBlockReason: 'x' }),
    null,
  );
});

test('bloqueio: a mensagem leva o motivo escrito pela gestão', () => {
  const msg = bookingBlockError({
    bookingBlockedAt: new Date('2026-11-13T10:00:00Z'),
    bookingBlockReason: '  Dívida antiga  ',
  });
  assert.ok(msg);
  assert.match(msg, /bloqueado para marcações pela gestão: Dívida antiga/);
  assert.match(msg, /Só a gestão pode desbloquear/);
});

test('bloqueio: sem motivo guardado a mensagem continua a bloquear', () => {
  const msg = bookingBlockError({ bookingBlockedAt: '2026-11-13' });
  assert.ok(msg);
  assert.match(msg, /bloqueado para marcações pela gestão\./);
});

test('bloqueio: o motivo é obrigatório, limpo e com tamanho máximo', () => {
  assert.equal(parseBlockReason('').ok, false);
  assert.equal(parseBlockReason('   ab ').ok, false);
  assert.equal(parseBlockReason(undefined).ok, false);
  assert.deepEqual(parseBlockReason('  Falta   de\npagamento '), {
    ok: true,
    reason: 'Falta de pagamento',
  });
  assert.equal(
    parseBlockReason('a'.repeat(BOOKING_BLOCK_REASON_MAX + 1)).ok,
    false,
  );
  assert.equal(parseBlockReason('a'.repeat(BOOKING_BLOCK_REASON_MAX)).ok, true);
});

// --- A2/A3: cores por estado -------------------------------------------------
test('cores: semáforo pedido pelo Victor', () => {
  assert.equal(agendaColor('cancelled').key, 'cancelled');
  assert.equal(agendaColor('pending').label, 'Por confirmar');
  assert.equal(agendaColor('confirmed').label, 'Confirmada');
  assert.equal(agendaColor('no-show').label, 'Falta');
  // vermelho, amarelo, verde, laranja: quatro cores diferentes
  const four = ['cancelled', 'pending', 'confirmed', 'no-show'].map(s => agendaColor(s).bg);
  assert.equal(new Set(four).size, 4);
});

test('cores: concluída só fica azul depois do "Tudo OK"', () => {
  assert.equal(agendaColor('completed', false).key, 'awaiting-close');
  assert.equal(agendaColor('completed', true).key, 'closed');
  assert.equal(agendaColor('completed', true).label, 'Concluído');
  // "fechado" só conta em consultas concluídas
  assert.equal(agendaColor('confirmed', true).key, 'confirmed');
});

test('cores: todos os estados têm cor e a legenda não repete', () => {
  for (const s of ['pending', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show']) {
    assert.match(agendaColor(s).bg, /^#[0-9A-F]{6}$/i, s);
  }
  assert.equal(agendaColor('estado-novo').key, 'pending');
  assert.equal(new Set(AGENDA_LEGEND).size, AGENDA_LEGEND.length);
  assert.equal(new Set(AGENDA_LEGEND.map(k => AGENDA_COLORS[k].bg)).size, AGENDA_LEGEND.length);
});

// --- B5: avisos do paciente --------------------------------------------------
test('avisos: paciente sem nada a assinalar não abre janela', () => {
  assert.deepEqual(buildPatientAlerts({}), []);
  assert.deepEqual(buildPatientAlerts({ note: '   ', unbilledCents: 0, dueCents: 0, noShows: 0, lateCancels: 0 }), []);
});

test('avisos: os exemplos do Victor', () => {
  const alerts = buildPatientAlerts({
    note: 'Encaminhar para o Dr. Éder para avaliação',
    unbilledCents: 12550,
    unbilledCount: 2,
    noShows: 3,
    lateCancels: 1,
  });
  assert.deepEqual(alerts.map(a => a.kind), ['note', 'unbilled', 'attendance']);
  assert.match(alerts[1].text, /125,50\s€ por faturar \(2 atos realizados\)/);
  assert.match(alerts[2].text, /últimos 12 meses faltou 3 vezes sem avisar e cancelou 1 vez com menos de 24 h/);
  assert.equal(alerts[2].level, 'warning');
});

test('avisos: o bloqueio vem primeiro e a dívida separa-se do por faturar', () => {
  const alerts = buildPatientAlerts({ blockReason: 'Dívida antiga', dueCents: 5000, noShows: 1 });
  assert.equal(alerts[0].kind, 'blocked');
  assert.equal(alerts[0].level, 'danger');
  assert.match(alerts[1].text, /50,00\s€ em dívida/);
  assert.equal(alerts[2].level, 'info'); // uma falta só informa
});

// --- B6: dentição infantil ----------------------------------------------------
test('dentição: 20 dentes de leite, sem repetidos, todos decíduos', () => {
  const all = [...UPPER_PRIMARY_TEETH, ...LOWER_PRIMARY_TEETH];
  assert.equal(all.length, 20);
  assert.equal(new Set(all).size, 20);
  assert.ok(all.every(isPrimaryTooth));
  assert.equal(isPrimaryTooth('16'), false);
  assert.equal(isPrimaryTooth('56'), false); // não existe
  // direita do paciente à esquerda do ecrã, como na definitiva
  assert.deepEqual([UPPER_PRIMARY_TEETH[0], UPPER_PRIMARY_TEETH[9]], ['55', '65']);
  assert.deepEqual([LOWER_PRIMARY_TEETH[0], LOWER_PRIMARY_TEETH[9]], ['85', '75']);
});

test('dentição: a idade escolhe a que abre', () => {
  assert.equal(defaultDentition(3), 'primary');
  assert.equal(defaultDentition(5), 'primary');
  assert.equal(defaultDentition(6), 'permanent'); // mista: o médico alterna
  assert.equal(defaultDentition(40), 'permanent');
  assert.equal(defaultDentition(null), 'permanent');
  assert.equal(isChildAge(12), true);
  assert.equal(isChildAge(13), false);
  assert.equal(isChildAge(null), false);
});

test('idade: anos completos', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  assert.equal(ageInYears('2020-11-13', now), 6);
  assert.equal(ageInYears('2020-11-14', now), 5);
  assert.equal(ageInYears(null, now), null);
  assert.equal(ageInYears('texto', now), null);
  assert.equal(ageInYears('2030-01-01', now), null);
});

// --- A1: mensagens -------------------------------------------------------------
test('mensagens: texto por omissão com os marcadores preenchidos', () => {
  const t = renderMessage('birthday', null, { patientName: 'MARIA JOÃO SILVA', clinicName: 'Centro Dentário Colombo' });
  assert.match(t, /^Olá Maria! A equipa do Centro Dentário Colombo/);
  assert.ok(!t.includes('{'));
  const f = renderMessage('no-show', '', { patientName: 'rui costa', clinicName: 'CDC Buraca', clinicPhone: '214 000 000', time: '15:30' });
  assert.match(f, /Olá Rui, .* das 15:30 no CDC Buraca/);
  assert.match(f, /214 000 000/);
});

test('mensagens: o texto da gestão substitui o por omissão', () => {
  const t = renderMessage('birthday', 'Parabéns, {nome}!  Beijinhos do {clinica}.', { patientName: 'ana', clinicName: 'CDC' });
  assert.equal(t, 'Parabéns, Ana! Beijinhos do CDC.');
  // sem telefone nem hora, a frase continua a ler-se
  const f = renderMessage('no-show', 'Faltou às {hora}. Ligue para {telefone}.', { patientName: 'Ana', clinicName: 'CDC' });
  assert.equal(f, 'Faltou às hoje. Ligue para a clínica.');
});

test('mensagens: telemóvel em formato internacional para o WhatsApp', () => {
  assert.equal(toWhatsAppNumber('912 345 678'), '351912345678');
  assert.equal(toWhatsAppNumber('+351 912 345 678'), '351912345678');
  assert.equal(toWhatsAppNumber('00351912345678'), '351912345678');
  assert.equal(toWhatsAppNumber('+55 11 91234-5678'), '5511912345678');
  assert.equal(toWhatsAppNumber('12345'), null);
  assert.equal(toWhatsAppNumber(''), null);
  assert.equal(toWhatsAppNumber(null), null);
  const url = whatsAppLink('912345678', 'Olá Ana! 🎉');
  assert.ok(url?.startsWith('https://wa.me/351912345678?text=Ol%C3%A1%20Ana!'));
  assert.equal(whatsAppLink(null, 'x'), null);
});

test('mensagens: fichas "(NAO USAR)" ficam de fora', () => {
  assert.equal(isDoNotUseName('MARIA MADALENA BATISTA (NAO USAR)'), true);
  assert.equal(isDoNotUseName('José (NÃO USAR)'), true);
  assert.equal(isDoNotUseName('Não usar - duplicado'), true);
  assert.equal(isDoNotUseName('Maria Nausara'), false);
  assert.equal(isDoNotUseName(null), false);
});

// --- B2b: venda ao balcão ----------------------------------------------------
test('venda: o IVA está contido no preço', () => {
  assert.equal(vatIncluded(1230, 23), 230);
  assert.equal(vatIncluded(1060, 6), 60);
  assert.equal(vatIncluded(1000, 0), 0);
  assert.deepEqual(saleLineTotals({ unitPriceCents: 1230, quantity: 2, vatRate: 23 }), {
    totalCents: 2460,
    vatCents: 460,
    netCents: 2000,
  });
});

test('venda: total de várias linhas e taxas', () => {
  const t = saleTotals([
    { unitPriceCents: 2500, quantity: 1, vatRate: 23 },
    { unitPriceCents: 350, quantity: 3, vatRate: 6 },
    { unitPriceCents: 1000, quantity: 1, vatRate: 0 },
  ]);
  assert.equal(t.totalCents, 2500 + 1050 + 1000);
  assert.equal(t.vatCents, vatIncluded(2500, 23) + vatIncluded(1050, 6));
  assert.equal(t.netCents + t.vatCents, t.totalCents);
  assert.deepEqual(saleTotals([]), { totalCents: 0, vatCents: 0, netCents: 0 });
});

test('venda: preço escrito pela gestão', () => {
  assert.equal(parsePriceToCents('12,50'), 1250);
  assert.equal(parsePriceToCents(' 12.5 € '), 1250);
  assert.equal(parsePriceToCents('12'), 1200);
  assert.equal(parsePriceToCents('0'), 0);
  assert.equal(parsePriceToCents('12,505'), null);
  assert.equal(parsePriceToCents('-3'), null);
  assert.equal(parsePriceToCents('abc'), null);
  assert.equal(parsePriceToCents(''), null);
  assert.equal(isVatRate(23), true);
  assert.equal(isVatRate(21), false);
  assert.equal(isVatRate('23'), false);
});

console.log(`\n${n} testes OK`);
