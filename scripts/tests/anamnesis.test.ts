// 📄 scripts/tests/anamnesis.test.ts
// Correr: npx tsx scripts/tests/anamnesis.test.ts
import assert from 'node:assert/strict';
import {
  parseQuestionnaireForm,
  deriveSafetyAlerts,
  anamnesisStatus,
  missingRequired,
  requiredStatus,
  anamnesisGateReason,
  anesthesiaReactionAlert,
} from '../../src/lib/anamnesis';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('parse: checkboxes múltiplas, rádios, sim/não + qual, blocos opcionais', () => {
  const fd = new FormData();
  fd.set('g.reason', 'Dor no 36');
  fd.append('g.conditions[]', 'diabetes');
  fd.append('g.conditions[]', 'hipertensao');
  fd.set('g.surgeryLast12m', 'sim');
  fd.set('g.surgeryWhich', 'Apendicite');
  fd.set('g.takesMedication', 'nao');
  fd.append('g.allergies[]', 'latex');
  fd.set('g.allergiesOther', 'Ibuprofeno');
  fd.set('g.frequency', 'anual');
  fd.set('g.flossDaily', 'sim');
  fd.set('includeAesthetic', 'on');
  fd.set('a.satisfaction', 'satisfeito');
  fd.append('a.contraindications[]', 'anticoagulantes');
  const q = parseQuestionnaireForm(fd);
  assert.deepEqual(q.general.conditions, ['diabetes', 'hipertensao']);
  assert.equal(q.general.surgeryLast12m, true);
  assert.equal(q.general.surgeryWhich, 'Apendicite');
  assert.equal(q.general.takesMedication, false);
  assert.deepEqual(q.general.allergies, ['latex']);
  assert.equal(q.general.frequency, 'anual');
  assert.equal(q.pediatric, null);
  assert.equal(q.aesthetic?.satisfaction, 'satisfeito');
  assert.deepEqual(q.aesthetic?.contraindications, ['anticoagulantes']);
});

test('parse: uma só checkbox marcada continua a ser lista', () => {
  const fd = new FormData();
  fd.append('g.symptoms[]', 'ronco');
  const q = parseQuestionnaireForm(fd);
  assert.deepEqual(q.general.symptoms, ['ronco']);
});

test('parse: valor inválido num enum rejeita', () => {
  const fd = new FormData();
  fd.set('g.frequency', 'semanal');
  assert.throws(() => parseQuestionnaireForm(fd));
});

test('alertas: alergias marcadas + outra + condições', () => {
  const fd = new FormData();
  fd.append('g.allergies[]', 'anestesicos');
  fd.set('g.allergiesOther', 'Penicilina');
  fd.append('g.conditions[]', 'epilepsia');
  fd.set('g.takesMedication', 'sim');
  fd.set('g.medicationWhich', 'Levetiracetam 500mg');
  const a = deriveSafetyAlerts(parseQuestionnaireForm(fd));
  assert.deepEqual(a.allergies, ['Anestésicos', 'Penicilina']);
  assert.equal(a.conditions[0].condition, 'Epilepsia');
  assert.deepEqual(a.medications, ['Levetiracetam 500mg']);
});

test('estado: em falta / válida / expirada / por validar', () => {
  const now = new Date('2026-09-14T10:00:00Z');
  assert.equal(anamnesisStatus(null, now).state, 'missing');
  assert.equal(
    anamnesisStatus(
      { completedAt: new Date('2026-06-01'), completedByRole: 'doctor' },
      now,
    ).state,
    'ok',
  );
  assert.equal(
    anamnesisStatus(
      { completedAt: new Date('2025-06-01'), completedByRole: 'doctor' },
      now,
    ).state,
    'expired',
  );
  assert.equal(
    anamnesisStatus(
      {
        completedAt: new Date('2026-09-10'),
        completedByRole: 'patient',
        reviewedAt: null,
      },
      now,
    ).state,
    'unreviewed',
  );
  assert.equal(
    anamnesisStatus(
      {
        completedAt: new Date('2026-09-10'),
        completedByRole: 'patient',
        reviewedAt: new Date('2026-09-11'),
      },
      now,
    ).state,
    'ok',
  );
});

// --- 5.ª ronda/04 (Victor, nov. 2026): campos obrigatórios ---------------------
const vazio = {
  surgeryLast12m: null,
  surgeryWhich: null,
  anesthesiaReaction: null,
  anesthesiaReactionWhich: null,
  takesMedication: null,
  medicationWhich: null,
  allergies: [] as string[],
  allergiesOther: null,
  noKnownAllergies: false,
};
const completo = {
  ...vazio,
  surgeryLast12m: false,
  anesthesiaReaction: false,
  takesMedication: true,
  medicationWhich: 'Varfarina',
  noKnownAllergies: true,
};

test('obrigatórios: sem respostas faltam os quatro', () => {
  assert.equal(missingRequired(vazio).length, 4);
  assert.equal(missingRequired(null).length, 4);
});

test('obrigatórios: Sim exige o "Qual?"; Não chega', () => {
  const st = requiredStatus({ ...vazio, surgeryLast12m: true, anesthesiaReaction: false });
  assert.equal(st.surgery, false); // Sim sem "Qual?"
  assert.equal(st.anesthesia, true);
  assert.equal(requiredStatus({ ...vazio, surgeryLast12m: true, surgeryWhich: '  ' }).surgery, false);
  assert.equal(requiredStatus({ ...vazio, surgeryLast12m: true, surgeryWhich: 'Apendicite' }).surgery, true);
});

test('obrigatórios: alergias — uma opção, "outra" ou "Sem alergias conhecidas"', () => {
  assert.equal(requiredStatus(vazio).allergies, false);
  assert.equal(requiredStatus({ ...vazio, allergies: ['latex'] }).allergies, true);
  assert.equal(requiredStatus({ ...vazio, allergiesOther: 'Níquel' }).allergies, true);
  assert.equal(requiredStatus({ ...vazio, noKnownAllergies: true }).allergies, true);
  // contraditório: "sem alergias" com uma alergia marcada
  assert.equal(requiredStatus({ ...vazio, noKnownAllergies: true, allergies: ['latex'] }).allergies, false);
});

test('obrigatórios: ficha completa não tem nada em falta', () => {
  assert.deepEqual(missingRequired(completo), []);
});

test('janela da consulta: em falta, revisão anual, incompleta, ok', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  assert.equal(anamnesisGateReason(null, now), 'missing');
  assert.equal(anamnesisGateReason({ completedAt: null }, now), 'missing');
  assert.equal(
    anamnesisGateReason({ completedAt: new Date('2025-11-01'), data: { general: completo } }, now),
    'expired',
  );
  // ficha anterior à v2: dentro da validade mas sem os obrigatórios
  assert.equal(
    anamnesisGateReason({ completedAt: new Date('2026-09-01'), data: { general: vazio } }, now),
    'incomplete',
  );
  assert.equal(
    anamnesisGateReason({ completedAt: new Date('2026-09-01'), data: { general: completo } }, now),
    null,
  );
});

test('formulário: "Sem alergias conhecidas" chega ao servidor como booleano', () => {
  const fd = new FormData();
  fd.set('g.surgeryLast12m', 'nao');
  fd.set('g.anesthesiaReaction', 'sim');
  fd.set('g.anesthesiaReactionWhich', 'Taquicardia com articaína');
  fd.set('g.takesMedication', 'nao');
  fd.set('g.noKnownAllergies', 'on');
  const q = parseQuestionnaireForm(fd);
  assert.equal(q.general.noKnownAllergies, true);
  assert.deepEqual(missingRequired(q.general), []);
  assert.equal(anesthesiaReactionAlert(q), 'Taquicardia com articaína');
  assert.equal(parseQuestionnaireForm(new FormData()).general.noKnownAllergies, false);
});

console.log(`\n${n} testes passaram.`);
