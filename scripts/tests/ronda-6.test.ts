// 📄 scripts/tests/ronda-6.test.ts
// Correr: npx tsx scripts/tests/ronda-6.test.ts
// 6.ª ronda (Victor, nov. 2026): campos obrigatórios da ficha, resultados
// de recall, "Outro trabalho" do laboratório e nº de processo opcional.
import assert from 'node:assert/strict';
import {
  createPatientSchema,
  missingRequiredFields,
  FINAL_CONSUMER_ADDRESS_THRESHOLD_CENTS,
} from '../../src/lib/validations/patient';
import {
  RECALL_OUTCOME_LABEL,
  RECALL_OUTCOME_TARGET,
  canRegisterContact,
  recallContactSchema,
} from '../../src/lib/validations/recalls';
import { RECALL_OUTCOMES } from '../../src/models/Recall';
import { createLabCaseSchema } from '../../src/lib/validations/lab';
import { labWorkLabel, processLabel } from '../../src/lib/domain';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const full = {
  birthDate: new Date('1980-01-01'),
  nif: '123456789',
  sex: 'F',
  snsNumber: '123456789',
  nationality: 'Portuguesa',
  phone: '+351912345678',
  email: 'a@b.pt',
};

test('ficha: completa não tem campos em falta', () => {
  assert.deepEqual(missingRequiredFields(full), []);
});

test('ficha: cada obrigatório em falta é apontado', () => {
  const m = missingRequiredFields({});
  assert.equal(m.length, 7);
  assert.equal(missingRequiredFields({ ...full, birthDate: null }).length, 1);
  assert.equal(missingRequiredFields({ ...full, sex: null }).length, 1);
  assert.equal(missingRequiredFields({ ...full, nationality: '' }).length, 1);
});

test('ficha: "não indica NIF" / "não tem" deixam terminar a ficha', () => {
  const none = { ...full, nif: null, snsNumber: null, phone: null, email: null };
  assert.equal(missingRequiredFields(none).length, 4);
  assert.deepEqual(
    missingRequiredFields({
      ...none,
      noNif: true,
      noSnsNumber: true,
      noPhone: true,
      noEmail: true,
    }),
    [],
  );
});

test('ficha: o formulário envia as opções como checkboxes', () => {
  const p = createPatientSchema.parse({ name: 'Maria Silva', noNif: 'on' });
  assert.equal(p.noNif, true);
  assert.equal(p.noEmail, false);
  assert.equal(p.gdprTabletClinicId, null);
  assert.equal(FINAL_CONSUMER_ADDRESS_THRESHOLD_CENTS, 100000);
});

test('recall: todos os resultados têm nome e estado de destino', () => {
  for (const o of RECALL_OUTCOMES) {
    assert.ok(RECALL_OUTCOME_LABEL[o], o);
    assert.ok(RECALL_OUTCOME_TARGET[o], o);
  }
  assert.equal(RECALL_OUTCOME_TARGET.booked, 'booked');
  assert.equal(RECALL_OUTCOME_TARGET['no-answer'], 'contacted');
  assert.equal(RECALL_OUTCOME_TARGET['not-interested'], 'dismissed');
  assert.equal(RECALL_OUTCOME_TARGET['wrong-number'], 'unreachable');
});

test('recall: só se regista contacto num ciclo aberto', () => {
  for (const s of ['scheduled', 'due', 'contacted'] as const) assert.equal(canRegisterContact(s), true);
  for (const s of ['booked', 'dismissed', 'unreachable'] as const) assert.equal(canRegisterContact(s), false);
  const id = 'a'.repeat(24);
  assert.equal(recallContactSchema.safeParse({ id, outcome: 'no-answer', note: '' }).success, true);
  assert.equal(recallContactSchema.safeParse({ id, outcome: 'inventado', note: '' }).success, false);
});

test('laboratório: "Outro trabalho" exige a descrição', () => {
  const id = 'a'.repeat(24);
  const base = {
    clinicId: id,
    patientId: id,
    doctorId: '',
    supplierId: id,
    appointmentId: '',
    toothNotes: '',
    shade: '',
    notes: '',
    costCents: '',
    sentDate: '2026-11-12',
    dueDate: '2026-11-19',
  };
  assert.equal(createLabCaseSchema.safeParse({ ...base, workType: 'coroa', workDescription: '' }).success, true);
  assert.equal(createLabCaseSchema.safeParse({ ...base, workType: 'outro', workDescription: '' }).success, false);
  assert.equal(createLabCaseSchema.safeParse({ ...base, workType: 'outro', workDescription: 'placa de contenção' }).success, true);
  assert.equal(labWorkLabel('outro', 'placa de contenção'), 'Outro: placa de contenção');
  assert.equal(labWorkLabel('outro', null), 'Outro trabalho');
  assert.equal(labWorkLabel('coroa', 'ignorado'), 'Coroa');
});

test('nº de processo: a pré-marcação não tem número', () => {
  assert.equal(processLabel(91171), '91171');
  assert.equal(processLabel(null), 'pré-marcação');
  assert.equal(processLabel(undefined), 'pré-marcação');
});

console.log(`\n${n} testes OK`);
