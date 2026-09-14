// 📄 scripts/tests/anamnesis.test.ts
// Correr: npx tsx scripts/tests/anamnesis.test.ts
import assert from 'node:assert/strict';
import {
  parseQuestionnaireForm,
  deriveSafetyAlerts,
  anamnesisStatus,
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

console.log(`\n${n} testes passaram.`);
