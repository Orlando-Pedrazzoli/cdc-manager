// 📄 scripts/tests/ronda-7.test.ts
// Correr: npx tsx scripts/tests/ronda-7.test.ts
import assert from 'node:assert/strict';
import {
  BOOKING_BLOCK_REASON_MAX,
  bookingBlockError,
  isBookingBlocked,
  parseBlockReason,
} from '../../src/lib/booking-block';

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

console.log(`\n${n} testes OK`);
