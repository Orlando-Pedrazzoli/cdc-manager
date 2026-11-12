// 📄 scripts/tests/attendance.test.ts
// Correr: npx tsx scripts/tests/attendance.test.ts
import assert from 'node:assert/strict';
import {
  attendanceWarning,
  cancelledVisibleIds,
  isLateCancellation,
  summarizeAttendance,
} from '../../src/lib/attendance';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};
const at = (iso: string) => new Date(iso);

test('cancelamento em cima da hora: só do paciente e com menos de 24 h', () => {
  const start = at('2026-11-20T15:00:00Z');
  const base = { status: 'cancelled', startAt: start, cancelledBy: 'patient' };
  assert.equal(isLateCancellation({ ...base, cancelledAt: at('2026-11-20T09:00:00Z') }), true);
  assert.equal(isLateCancellation({ ...base, cancelledAt: at('2026-11-19T15:00:01Z') }), true);
  assert.equal(isLateCancellation({ ...base, cancelledAt: at('2026-11-19T15:00:00Z') }), false); // 24 h certas
  assert.equal(isLateCancellation({ ...base, cancelledAt: at('2026-11-13T10:00:00Z') }), false);
  // a clínica cancelou, ou foi remarcada → não conta contra o paciente
  assert.equal(isLateCancellation({ ...base, cancelledBy: 'clinic', cancelledAt: at('2026-11-20T09:00:00Z') }), false);
  assert.equal(isLateCancellation({ ...base, cancelledAt: at('2026-11-20T09:00:00Z'), rescheduledToId: 'x' }), false);
  assert.equal(isLateCancellation({ ...base, cancelledAt: null }), false);
});

test('resumo do paciente: faltas, cancelamentos tardios e última falta', () => {
  const s = summarizeAttendance([
    { status: 'completed', startAt: at('2026-01-10T10:00:00Z') },
    { status: 'no-show', startAt: at('2026-03-02T11:00:00Z') },
    { status: 'no-show', startAt: at('2026-09-15T11:00:00Z') },
    { status: 'cancelled', startAt: at('2026-10-01T11:00:00Z'), cancelledBy: 'patient', cancelledAt: at('2026-10-01T08:00:00Z') },
    { status: 'cancelled', startAt: at('2026-10-20T11:00:00Z'), cancelledBy: 'clinic', cancelledAt: at('2026-10-20T08:00:00Z') },
    { status: 'confirmed', startAt: at('2026-12-01T11:00:00Z') },
  ]);
  assert.equal(s.noShows, 2);
  assert.equal(s.lateCancels, 1);
  assert.equal(s.completed, 1);
  assert.equal(s.lastNoShowAt?.toISOString(), '2026-09-15T11:00:00.000Z');
  assert.equal(attendanceWarning(s), '2 faltas sem aviso · 1 cancelamento com menos de 24 h');
});

test('paciente sem faltas: nada a assinalar', () => {
  const s = summarizeAttendance([{ status: 'completed', startAt: at('2026-01-10T10:00:00Z') }]);
  assert.equal(attendanceWarning(s), null);
  assert.equal(attendanceWarning({ ...s, noShows: 1 }), '1 falta sem aviso');
});

test('grelha: a cancelada fica à vista até o horário ser ocupado ou ser retirada', () => {
  const h = (hour: number, min = 0) => Date.UTC(2026, 10, 12, hour, min);
  const c = (id: string, extra: object = {}) => ({
    id,
    doctorId: 'dr1',
    startMs: h(15),
    endMs: h(15, 30),
    status: 'cancelled',
    removedFromGrid: false,
    rescheduled: false,
    ...extra,
  });
  // sozinha no horário → à vista
  assert.deepEqual([...cancelledVisibleIds([c('a')])], ['a']);
  // retirada à mão ou remarcada → fora
  assert.equal(cancelledVisibleIds([c('a', { removedFromGrid: true })]).size, 0);
  assert.equal(cancelledVisibleIds([c('a', { rescheduled: true })]).size, 0);
  // outra marcação ativa do mesmo médico por cima → fora
  const live = { id: 'b', doctorId: 'dr1', startMs: h(15, 15), endMs: h(15, 45), status: 'pending', removedFromGrid: false, rescheduled: false };
  assert.equal(cancelledVisibleIds([c('a'), live]).size, 0);
  // marcação de OUTRO médico, ou encostada (sem sobreposição) → continua à vista
  assert.equal(cancelledVisibleIds([c('a'), { ...live, doctorId: 'dr2' }]).size, 1);
  assert.equal(cancelledVisibleIds([c('a'), { ...live, startMs: h(15, 30), endMs: h(16) }]).size, 1);
  // uma falta no mesmo horário não ocupa o lugar
  assert.equal(cancelledVisibleIds([c('a'), { ...live, status: 'no-show' }]).size, 1);
});

console.log(`\n${n} testes OK`);
