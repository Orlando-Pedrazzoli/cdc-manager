// 📄 scripts/tests/ronda-9.test.ts
// =============================================================================
// 9.ª ronda (Ajustes de 17 e 18/11, Victor) — regras puras da fase 2
//   12: lista dos tipos de Raio-X · 15: janela da barra de tempo ·
//   19: nome completo do médico nos dados do formulário
// Correr: npx tsx scripts/tests/ronda-9.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  RX_MODALITIES,
  RX_MODALITIES_OFFERED,
  RX_MODALITY_LABEL,
  rxModalityUsesTeeth,
} from '../../src/lib/domain';
import { consultWindow } from '../../src/lib/consult-window';
import { createRxRequestSchema } from '../../src/lib/validations/rx';
import { createDoctorSchema } from '../../src/lib/validations/doctor';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

test('RX: os 13 tipos do Victor, pela ordem dele, sem bitewing', () => {
  assert.deepEqual(
    RX_MODALITIES_OFFERED.map(m => RX_MODALITY_LABEL[m]),
    [
      'Radiografia periapical (apical)',
      'Radiografia oclusal',
      'Seriografia',
      'Radiografia panorâmica',
      'Telerradiografia lateral',
      'Telerradiografia frontal',
      'Radiografia axial',
      'Radiografia dos seios maxilares',
      'Radiografia da ATM',
      'Radiografia transcraniana',
      'Radiografia transfacial',
      'Radiografia de mão e punho',
      'CBCT',
    ],
  );
});

test('RX: bitewing continua válido para os pedidos antigos', () => {
  assert.ok((RX_MODALITIES as readonly string[]).includes('bitewing'));
  assert.ok(RX_MODALITY_LABEL.bitewing);
  // os valores já gravados não mudaram de nome
  for (const old of ['periapical', 'bitewing', 'panoramica']) {
    assert.ok((RX_MODALITIES as readonly string[]).includes(old));
  }
});

test('RX: só periapical e bitewing levam dentes', () => {
  const withTeeth = RX_MODALITIES.filter(rxModalityUsesTeeth);
  assert.deepEqual([...withTeeth].sort(), ['bitewing', 'periapical']);
});

test('RX: o pedido aceita um tipo novo e recusa um desconhecido', () => {
  const base = {
    appointmentId: 'a'.repeat(24),
    toothNumbers: '',
    notes: '',
    consentSignature: 'data:image/png;base64,AAAA',
  };
  assert.ok(createRxRequestSchema.safeParse({ ...base, modality: 'cbct' }).success);
  assert.ok(!createRxRequestSchema.safeParse({ ...base, modality: 'ressonancia' }).success);
});

test('barra de tempo: dentro do horário marcado, conta sobre o horário', () => {
  const s = Date.UTC(2026, 10, 25, 10, 0);
  const e = Date.UTC(2026, 10, 25, 10, 30);
  assert.deepEqual(consultWindow(s, e, null), { startMs: s, endMs: e });
  assert.deepEqual(consultWindow(s, e, undefined), { startMs: s, endMs: e });
  assert.deepEqual(consultWindow(s, e, s), { startMs: s, endMs: e });
  // começou 10 min atrasada, ainda dentro do horário
  assert.deepEqual(consultWindow(s, e, s + 10 * 60_000), { startMs: s, endMs: e });
});

test('barra de tempo: paciente atendido antes da hora', () => {
  const s = Date.UTC(2026, 10, 25, 10, 0);
  const e = Date.UTC(2026, 10, 25, 10, 30);
  const started = s - 20 * 60_000; // 09:40
  assert.deepEqual(consultWindow(s, e, started), {
    startMs: started,
    endMs: started + 30 * 60_000,
  });
});

test('barra de tempo: urgência iniciada depois do fim marcado', () => {
  const s = Date.UTC(2026, 10, 25, 10, 0);
  const e = Date.UTC(2026, 10, 25, 10, 30);
  const started = e + 45 * 60_000; // 11:15
  assert.deepEqual(consultWindow(s, e, started), {
    startMs: started,
    endMs: started + 30 * 60_000,
  });
  // início exatamente no fim marcado já é fora do horário
  assert.equal(consultWindow(s, e, e).startMs, e);
});

test('médico: nome completo é opcional e tem tamanho mínimo', () => {
  const shape = createDoctorSchema.shape.fullName;
  assert.equal(shape.parse(''), null);
  // campo ausente do formulário = não mexer no valor gravado
  assert.equal(shape.parse(undefined), undefined);
  assert.equal(shape.parse('  Ana Maria Borges Silva '), 'Ana Maria Borges Silva');
  assert.ok(!shape.safeParse('Ana').success);
});

console.log(`\n${n} testes OK`);
