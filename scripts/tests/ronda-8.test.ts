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

import { canReadAudience, searchKnowledge } from '../../src/lib/knowledge';
import { TRAINING_STARTER } from '../../src/lib/data/training-starter';
import {
  budgetStatsByDoctor,
  isBudgetPending,
  isInProgressWithoutReturn,
} from '../../src/lib/budgets';
import { doctorOccupancy, formatHours, overlapMin } from '../../src/lib/occupancy';

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

// ---------------------------------------------------------------------------
// 3.ª parte: protocolos e treinamento (07, 08), orçamentos (12, 13), ocupação (15)
// ---------------------------------------------------------------------------
test('07: pesquisa de protocolos sem acentos, título primeiro', () => {
  const arts = [
    { title: 'Parcelamento', body: 'Como propor o pagamento em prestações.', keywords: 'prestações' },
    { title: 'Livro de reclamações', body: 'Entregar o livro e avisar a gestão.', keywords: 'queixa reclamação' },
    { title: 'Acidente de trabalho', body: 'Ligar ao seguro. Não é uma reclamação.', keywords: null },
  ];
  assert.deepEqual(searchKnowledge(arts, 'reclamacoes').map(a => a.title), ['Livro de reclamações']);
  assert.deepEqual(searchKnowledge(arts, 'RECLAMAÇÃO').map(a => a.title), ['Livro de reclamações', 'Acidente de trabalho']);
  assert.deepEqual(searchKnowledge(arts, 'prestacoes').map(a => a.title), ['Parcelamento']);
  assert.equal(searchKnowledge(arts, '  ').length, 3);
  assert.equal(searchKnowledge(arts, 'seguro livro').length, 0);
});

test('08: quem lê cada versão do treinamento', () => {
  assert.equal(canReadAudience('admin', 'doctor'), true);
  assert.equal(canReadAudience('receptionist', 'reception'), true);
  assert.equal(canReadAudience('receptionist', 'portal'), true);
  assert.equal(canReadAudience('receptionist', 'doctor'), false);
  assert.equal(canReadAudience('doctor', 'doctor'), true);
  assert.equal(canReadAudience('doctor', 'reception'), false);
  assert.equal(canReadAudience(null, 'reception'), false);
});

test('08: conteúdo inicial do treinamento sem repetições e com as três versões', () => {
  const slugs = TRAINING_STARTER.map(t => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const a of ['reception', 'doctor', 'portal'] as const) {
    assert.ok(TRAINING_STARTER.some(t => t.audience === a), a);
  }
  for (const t of TRAINING_STARTER) assert.ok(t.body.length > 200 && t.body.length < 20000, t.slug);
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 17, 12);

test('12: taxa de aceitação por médico, em número e em valor', () => {
  const from = Date.UTC(2026, 10, 1);
  const to = Date.UTC(2026, 11, 1);
  const r = budgetStatsByDoctor(
    [
      { doctorId: 'a', valueCents: 100_000, proposedMs: from + DAY, approvedMs: from + 3 * DAY },
      { doctorId: 'a', valueCents: 300_000, proposedMs: from + 2 * DAY, approvedMs: null },
      { doctorId: 'a', valueCents: 50_000, proposedMs: from - DAY, approvedMs: from + DAY }, // apresentado no mês anterior
      { doctorId: 'c', valueCents: 80_000, proposedMs: null, approvedMs: null }, // rascunho
    ],
    ['a', 'b'],
    from,
    to,
  );
  const a = r.find(x => x.doctorId === 'a')!;
  assert.equal(a.presentedN, 2);
  assert.equal(a.acceptedN, 1);
  assert.equal(a.rateN, 50);
  assert.equal(a.rateCents, 25);
  // quem não entregou nenhum aparece com zero
  const b = r.find(x => x.doctorId === 'b')!;
  assert.equal(b.presentedN, 0);
  assert.equal(b.rateN, null);
  assert.equal(r.find(x => x.doctorId === 'c'), undefined);
});

test('12: orçamento pendente há 30 dias ou mais', () => {
  assert.equal(isBudgetPending({ status: 'proposed', proposedMs: NOW - 30 * DAY }, NOW), true);
  assert.equal(isBudgetPending({ status: 'proposed', proposedMs: NOW - 29 * DAY }, NOW), false);
  assert.equal(isBudgetPending({ status: 'proposed', proposedMs: NOW - 20 * DAY }, NOW, 15), true);
  assert.equal(isBudgetPending({ status: 'in-progress', proposedMs: NOW - 90 * DAY }, NOW), false);
  assert.equal(isBudgetPending({ status: 'proposed', proposedMs: null }, NOW), false);
});

test('13: tratamento em curso sem retorno', () => {
  const base = { status: 'in-progress', hasFutureAppointment: false, lastVisitMs: NOW - 40 * DAY, approvedMs: NOW - 90 * DAY };
  assert.equal(isInProgressWithoutReturn(base, NOW), true);
  assert.equal(isInProgressWithoutReturn({ ...base, hasFutureAppointment: true }, NOW), false);
  assert.equal(isInProgressWithoutReturn({ ...base, lastVisitMs: NOW - 10 * DAY }, NOW), false);
  assert.equal(isInProgressWithoutReturn({ ...base, status: 'proposed' }, NOW), false);
  // aceitou há pouco e ainda não veio: ainda não conta
  assert.equal(isInProgressWithoutReturn({ status: 'approved', hasFutureAppointment: false, lastVisitMs: null, approvedMs: NOW - 5 * DAY }, NOW), false);
  assert.equal(isInProgressWithoutReturn({ status: 'approved', hasFutureAppointment: false, lastVisitMs: null, approvedMs: NOW - 45 * DAY }, NOW), true);
});

test('15: ocupação por turno, tempo de cadeira e marcações perdidas', () => {
  const ap = (day: string, startMin: number, endMin: number, status: string, extra: Partial<{ rescheduled: boolean; chairMin: number | null }> = {}) => ({
    day, startMin, endMin, status, rescheduled: false, chairMin: null, ...extra,
  });
  const occ = doctorOccupancy(
    {
      '2026-11-16': [{ start: 540, end: 960 }], // 09:00–16:00 = 420 min
      '2026-11-17': [{ start: 960, end: 1380 }], // 16:00–23:00 = 420 min
    },
    [
      ap('2026-11-16', 540, 750, 'completed', { chairMin: 180 }), // 210 min marcados, 180 reais
      ap('2026-11-16', 780, 840, 'no-show'),
      ap('2026-11-16', 840, 900, 'cancelled'),
      ap('2026-11-16', 900, 960, 'cancelled', { rescheduled: true }), // não conta
      ap('2026-11-17', 930, 1020, 'confirmed'), // só 60 min dentro do turno
      ap('2026-11-17', 1020, 1080, 'completed'), // sem registo real: 60 min
    ],
  );
  assert.equal(occ.availableMin, 840);
  assert.equal(occ.bookedMin, 210 + 60 + 60);
  assert.equal(occ.pct, 39);
  assert.deepEqual(occ.shifts.map(s => [s.label, s.pct, s.days]), [
    ['09:00–16:00', 50, 1],
    ['16:00–23:00', 29, 1],
  ]);
  assert.equal(occ.chairMin, 240);
  assert.equal(occ.appointments, 5);
  assert.equal(occ.noShows, 1);
  assert.equal(occ.cancellations, 1);
  assert.equal(occ.lostPct, 40);
  assert.equal(overlapMin({ start: 0, end: 10 }, { start: 20, end: 30 }), 0);
  assert.equal(formatHours(2250), '37 h 30');
  assert.equal(formatHours(420), '7 h');
  // sem turnos: sem percentagem, mas as marcações contam
  const off = doctorOccupancy({}, [ap('2026-11-18', 600, 660, 'completed')]);
  assert.equal(off.pct, null);
  assert.equal(off.appointments, 1);
});

console.log(`\n${n} testes OK`);

// -----------------------------------------------------------------------------
// 8.ª ronda/03 e 11 — respostas do Victor de 17/11/2026 (noite)
// -----------------------------------------------------------------------------
import { canManageAgendaDays } from '../../src/models/User';
import { counterNoticesFrom } from '../../src/lib/attendance-data';

test('abrir/fechar dias: gestão sempre, receção só com permissão', () => {
  assert.equal(canManageAgendaDays({ role: 'admin' }), true);
  assert.equal(canManageAgendaDays({ role: 'receptionist' }), false);
  assert.equal(
    canManageAgendaDays({ role: 'receptionist', canManageAgendaDays: true }),
    true,
  );
  assert.equal(
    canManageAgendaDays({ role: 'doctor', canManageAgendaDays: true }),
    false,
  );
});

test('aviso no balcão: só pacientes com faltas ou cancelamentos em cima da hora', () => {
  const d = (s: string) => new Date(s);
  const m = counterNoticesFrom([
    { patientId: 'a', status: 'no-show', startAt: d('2026-10-01T10:00:00Z') },
    { patientId: 'a', status: 'no-show', startAt: d('2026-11-03T10:00:00Z') },
    {
      patientId: 'a',
      status: 'cancelled',
      cancelledBy: 'patient',
      startAt: d('2026-11-10T10:00:00Z'),
      cancelledAt: d('2026-11-10T08:00:00Z'),
    },
    // clínica cancelou: não conta
    {
      patientId: 'b',
      status: 'cancelled',
      cancelledBy: 'clinic',
      startAt: d('2026-11-10T10:00:00Z'),
      cancelledAt: d('2026-11-10T09:00:00Z'),
    },
  ]);
  assert.equal(m.size, 1);
  assert.equal(
    m.get('a')?.text,
    '2 faltas sem aviso · 1 cancelamento com menos de 24 h',
  );
  assert.equal(m.get('a')?.lastNoShowLabel, '03/11/2026');
});
