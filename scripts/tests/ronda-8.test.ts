// 📄 scripts/tests/ronda-8.test.ts
// Correr: npx tsx scripts/tests/ronda-8.test.ts
import assert from 'node:assert/strict';
import {
  AGENDA_COMPACT_MIN_PX_PER_MIN,
  AGENDA_PX_PER_MIN,
  compactPxPerMin,
  weekdayDatesInRange,
} from '../../src/lib/agenda-bulk';
import { patientNameWithProcess } from '../../src/lib/domain';
import {
  TEMPLATE_FOLDERS,
  TEMPLATE_FOLDER_LABEL,
  sortByFolder,
  templateDisplayTitle,
  templateFolder,
} from '../../src/lib/data/document-templates';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

// 0 = seg … 6 = dom
const QUI = 3;
const SAB = 5;
const DOM = 6;

test('03: todas as quintas de janeiro de 2027', () => {
  const r = weekdayDatesInRange('2027-01-01', '2027-01-31', new Set([QUI]), '2026-11-17');
  assert.deepEqual(r, ['2027-01-07', '2027-01-14', '2027-01-21', '2027-01-28']);
});

test('03: todos os sábados e domingos de 2027', () => {
  const r = weekdayDatesInRange('2027-01-01', '2027-12-31', new Set([SAB, DOM]), '2026-11-17');
  assert.equal(r.length, 104);
  assert.equal(r[0], '2027-01-02');
  assert.equal(r[r.length - 1], '2027-12-26');
  for (const d of r) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    assert.ok(wd === 6 || wd === 0, d);
  }
});

test('03: nunca devolve dias que já passaram', () => {
  // 17/11/2026 é terça; segundas de novembro a partir de hoje
  const r = weekdayDatesInRange('2026-11-01', '2026-11-30', new Set([0]), '2026-11-17');
  assert.deepEqual(r, ['2026-11-23', '2026-11-30']);
});

test('03: período inválido ou sem dias da semana', () => {
  assert.deepEqual(weekdayDatesInRange('2027-02-01', '2027-01-01', new Set([0]), '2026-11-17'), []);
  assert.deepEqual(weekdayDatesInRange('2027-01-01', '2027-01-31', new Set(), '2026-11-17'), []);
  assert.deepEqual(weekdayDatesInRange('', '2027-01-31', new Set([0]), '2026-11-17'), []);
  assert.deepEqual(weekdayDatesInRange('2025-01-01', '2025-12-31', new Set([0]), '2026-11-17'), []);
});

test('03: um ano inteiro de um dia da semana cabe no limite de 400 dias', () => {
  const all = weekdayDatesInRange('2027-01-01', '2027-12-31', new Set([0, 1, 2, 3, 4, 5, 6]), '2026-11-17');
  assert.equal(all.length, 365);
});

test('02: vista compacta encolhe o dia até caber', () => {
  // dia das 9h às 23h = 840 min, 700 px disponíveis
  const px = compactPxPerMin(700, 840);
  assert.ok(Math.abs(px * 840 - 700) < 0.001);
});

test('02: nunca maior do que a vista normal nem ilegível', () => {
  assert.equal(compactPxPerMin(5000, 600), AGENDA_PX_PER_MIN);
  assert.equal(compactPxPerMin(100, 840), AGENDA_COMPACT_MIN_PX_PER_MIN);
  assert.equal(compactPxPerMin(-50, 840), AGENDA_COMPACT_MIN_PX_PER_MIN);
  assert.equal(compactPxPerMin(700, 0), AGENDA_PX_PER_MIN);
});

test('04: nome com o número do paciente', () => {
  assert.equal(patientNameWithProcess('MÓNICA ROCHA', 75099), 'MÓNICA ROCHA · n.º 75099');
  assert.equal(patientNameWithProcess('teste3 teste3', null), 'teste3 teste3');
  assert.equal(patientNameWithProcess('Ana', undefined), 'Ana');
});

test('06: pastas dos modelos', () => {
  assert.equal(templateFolder('cirurgia'), 'cirurgia');
  assert.equal(templateFolder(undefined), 'geral');
  assert.equal(templateFolder('inventada'), 'geral');
  for (const f of TEMPLATE_FOLDERS) assert.ok(TEMPLATE_FOLDER_LABEL[f]);
  assert.equal(
    templateDisplayTitle('cirurgia', 'Pós-operatório: extração de siso'),
    '(Cirurgia) Pós-operatório: extração de siso',
  );
  assert.equal(
    templateDisplayTitle(null, 'Atestado de comparecimento'),
    '(Geral) Atestado de comparecimento',
  );
});

test('06: modelos ordenados por pasta e depois por título', () => {
  const r = sortByFolder([
    { folder: 'ortodontia' as const, title: 'Consentimento: aparelho fixo' },
    { folder: 'geral' as const, title: 'Atestado médico' },
    { folder: 'cirurgia' as const, title: 'Pós-operatório: siso' },
    { folder: 'geral' as const, title: 'Atestado de comparecimento' },
  ]);
  assert.deepEqual(
    r.map(x => x.title),
    [
      'Atestado de comparecimento',
      'Atestado médico',
      'Pós-operatório: siso',
      'Consentimento: aparelho fixo',
    ],
  );
});

console.log(`\n${n} testes OK`);
