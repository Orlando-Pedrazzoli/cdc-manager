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

import {
  CONTRACT_WARN_DAYS,
  birthdayAlerts,
  birthdayThisWeek,
  contractAlerts,
  daysBetween,
  expiryAlerts,
  sortAlerts,
  weekRange,
} from '../../src/lib/management-alerts';
import { fitsDay, waitlistCandidates } from '../../src/lib/waitlist';

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

// ---------------------------------------------------------------------------
// 2.ª parte: avisos da gestão (09, 16, 17, 18) e lista de espera (10)
// ---------------------------------------------------------------------------
const TODAY = '2026-11-17'; // terça-feira; semana de 16/11 a 22/11

test('09: semana de segunda a domingo', () => {
  assert.deepEqual(weekRange(TODAY), { start: '2026-11-16', end: '2026-11-22' });
  assert.deepEqual(weekRange('2026-11-22'), { start: '2026-11-16', end: '2026-11-22' });
});

test('09: aniversário só avisa na própria semana', () => {
  assert.equal(birthdayThisWeek('1985-11-20', TODAY), '2026-11-20');
  assert.equal(birthdayThisWeek('1990-11-16', TODAY), '2026-11-16');
  assert.equal(birthdayThisWeek('1990-11-23', TODAY), null);
  assert.equal(birthdayThisWeek('1990-11-15', TODAY), null);
  // 29/02 festeja a 28/02 nos anos comuns
  assert.equal(birthdayThisWeek('1988-02-29', '2027-02-24'), '2027-02-28');
  // semana que apanha a passagem de ano
  assert.equal(birthdayThisWeek('1980-01-02', '2026-12-30'), '2027-01-02');
});

test('09: aviso de aniversário aponta para a ficha certa', () => {
  const a = birthdayAlerts(
    [
      { id: 'd1', name: 'Dra. Marta', type: 'doctor', birthIso: '1985-11-17' },
      { id: 'e1', name: 'Ana Costa', type: 'employee', birthIso: '1992-11-21' },
      { id: 'e2', name: 'Rui', type: 'employee', birthIso: '1992-12-21' },
      { id: 'e3', name: 'Sem data', type: 'employee', birthIso: null },
    ],
    TODAY,
  );
  assert.equal(a.length, 2);
  assert.equal(a[0].text, 'Dra. Marta faz anos hoje.');
  assert.equal(a[0].href, '/admin/medicos/d1');
  assert.equal(a[1].href, '/admin/colaboradores/e1');
  assert.equal(a[1].days, 4);
});

test('16: documento do médico avisa 30 dias antes e fica urgente depois de vencer', () => {
  const mk = (expiresIso: string) => ({
    id: 'x', scope: 'doctor' as const, name: 'Seguro', owner: 'Dr. Éder', doctorId: 'd9', expiresIso,
  });
  assert.equal(expiryAlerts([mk('2026-12-18')], TODAY).length, 0); // 31 dias
  const soon = expiryAlerts([mk('2026-12-17')], TODAY); // 30 dias
  assert.equal(soon.length, 1);
  assert.equal(soon[0].level, 'warning');
  assert.equal(soon[0].doctorId, 'd9');
  const late = expiryAlerts([mk('2026-11-10')], TODAY);
  assert.equal(late[0].level, 'urgent');
  assert.equal(late[0].kind, 'doctor-document');
  assert.ok(late[0].text.includes('vencido há 7 dias'));
});

test('17: renovação com empresa parceira', () => {
  const a = expiryAlerts(
    [{ id: 'p', scope: 'partner', name: 'Extintores', owner: 'Segurmax', doctorId: null, expiresIso: '2026-11-17' }],
    TODAY,
  );
  assert.equal(a[0].kind, 'partner');
  assert.ok(a[0].text.startsWith('Extintores — Segurmax: expira hoje'));
});

test('18: fim de contrato avisa 40 dias antes de cada data', () => {
  assert.equal(daysBetween(TODAY, '2026-12-27'), CONTRACT_WARN_DAYS);
  const a = contractAlerts(
    [{ employeeId: 'e1', name: 'Ana Costa', endIsos: ['2027-06-27', '2026-12-27', '2027-12-27'] }],
    TODAY,
  );
  assert.equal(a.length, 1);
  assert.equal(a[0].date, '2026-12-27');
  assert.ok(a[0].text.includes('1.ª data'));
  assert.equal(a[0].level, 'warning');
  // 41 dias: ainda não; data já passada: não avisa
  assert.equal(contractAlerts([{ employeeId: 'e', name: 'X', endIsos: ['2026-12-28'] }], TODAY).length, 0);
  assert.equal(contractAlerts([{ employeeId: 'e', name: 'X', endIsos: ['2026-11-16'] }], TODAY).length, 0);
  assert.equal(contractAlerts([{ employeeId: 'e', name: 'X', endIsos: ['2026-11-20'] }], TODAY)[0].level, 'urgent');
});

test('avisos: urgentes primeiro, depois o mais próximo', () => {
  const sorted = sortAlerts([
    ...birthdayAlerts([{ id: 'd', name: 'B', type: 'doctor', birthIso: '1980-11-17' }], TODAY),
    ...expiryAlerts(
      [
        { id: '1', scope: 'doctor', name: 'Cédula', owner: 'A', doctorId: 'a', expiresIso: '2026-12-01' },
        { id: '2', scope: 'doctor', name: 'Seguro', owner: 'A', doctorId: 'a', expiresIso: '2026-11-01' },
      ],
      TODAY,
    ),
  ]);
  assert.deepEqual(sorted.map(a => a.level), ['urgent', 'warning', 'info']);
});

test('10: lista de espera — quem encaixa num dia', () => {
  const e = (preference: 'earlier' | 'later' | 'any', appointmentDay: string) => ({ preference, appointmentDay });
  assert.equal(fitsDay(e('earlier', '2026-11-25'), '2026-11-20', TODAY), true);
  assert.equal(fitsDay(e('earlier', '2026-11-19'), '2026-11-20', TODAY), false);
  assert.equal(fitsDay(e('later', '2026-11-19'), '2026-11-20', TODAY), true);
  assert.equal(fitsDay(e('later', '2026-11-25'), '2026-11-20', TODAY), false);
  assert.equal(fitsDay(e('any', '2026-11-25'), '2026-11-20', TODAY), true);
  // dia que já passou nunca serve
  assert.equal(fitsDay(e('any', '2026-11-25'), '2026-11-16', TODAY), false);
});

test('10: lista de espera — só os médicos do dia, quem ganha mais primeiro', () => {
  const mk = (id: string, doctorId: string | null, preference: 'earlier' | 'later' | 'any', appointmentDay: string) => ({
    id, doctorId, preference, appointmentDay, appointmentStartMin: 600,
  });
  const r = waitlistCandidates(
    [
      mk('a', 'd1', 'earlier', '2026-11-24'),
      mk('b', 'd1', 'earlier', '2026-12-10'),
      mk('c', 'd2', 'earlier', '2026-12-10'), // outro médico
      mk('d', 'd1', 'later', '2026-12-10'), // quer mais tarde, não serve
      mk('e', null, 'any', '2026-11-21'), // sem médico: serve a qualquer um
    ],
    { dayIso: '2026-11-20', todayIso: TODAY, doctorIds: new Set(['d1']) },
  );
  assert.deepEqual(r.map(x => x.id), ['b', 'a', 'e']);
});

console.log(`\n${n} testes OK`);
