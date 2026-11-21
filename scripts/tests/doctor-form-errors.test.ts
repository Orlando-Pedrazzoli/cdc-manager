// 📄 scripts/tests/doctor-form-errors.test.ts
// Correr: npx tsx scripts/tests/doctor-form-errors.test.ts
// -----------------------------------------------------------------------------
// Formulário do médico: os avisos têm de dizer QUAL é o campo errado, todos de
// uma vez, e nunca mostrar a mensagem técnica do Zod ("Invalid input…").
// Regressão: com várias especialidades assinaladas só a última era gravada.
// -----------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { SPECIALTIES } from '../../src/lib/domain';
import {
  countDoctorFormErrors,
  doctorErrorsSummary,
  doctorFormRaw,
  validateCreateDoctor,
  validateUpdateDoctor,
} from '../../src/lib/doctor-form-errors';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const CLINIC_A = '64b0c0ffee0000000000000a';
const CLINIC_B = '64b0c0ffee0000000000000b';

const okSchedules = JSON.stringify([
  {
    clinicId: CLINIC_A,
    bookableOnline: true,
    weeklySchedule: [
      { weekday: 1, ranges: [{ start: '09:00', end: '13:00' }] },
    ],
  },
]);

/** Simula o envio do formulário (FormData como o browser a monta) */
function form(entries: [string, string][]): Record<string, unknown> {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return doctorFormRaw(fd);
}

const valid: [string, string][] = [
  ['name', 'Dra. Ana Silva'],
  ['licenseNumber', '12345'],
  ['birthDate', ''],
  ['commissionRate', ''],
  ['monthlyGoalCents', ''],
  ['color', '#2743A6'],
  ['specialties', SPECIALTIES[0]],
  ['clinicSchedules', okSchedules],
  ['email', ''],
];
const without = (...keys: string[]) => valid.filter(([k]) => !keys.includes(k));

const allMessages = (r: ReturnType<typeof validateCreateDoctor>) =>
  r.ok
    ? []
    : [
        ...Object.values(r.errors.fields),
        ...r.errors.schedule.map(s => s.message),
        r.errors.form ?? '',
      ];

test('formulário válido passa', () => {
  const r = validateCreateDoctor(form(valid));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('várias especialidades assinaladas são TODAS lidas', () => {
  const r = validateCreateDoctor(
    form([
      ...valid,
      ['specialties', SPECIALTIES[1]],
      ['specialties', SPECIALTIES[2]],
    ]),
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.specialties.length, 3);
});

test('nenhuma especialidade: aviso no campo, em português', () => {
  const r = validateCreateDoctor(form(without('specialties')));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.errors.fields.specialties ?? '', /pelo menos uma/i);
  }
});

test('vários erros chegam todos de uma vez, cada um no seu campo', () => {
  const r = validateCreateDoctor(
    form([
      ['name', 'A'],
      ['licenseNumber', '12 34A'],
      ['birthDate', '2999-01-01'],
      ['commissionRate', '150'],
      ['monthlyGoalCents', 'abc'],
      ['color', '#2743A6'],
      ['clinicSchedules', '[]'],
      ['email', 'nao-e-email'],
    ]),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    for (const f of [
      'name',
      'licenseNumber',
      'birthDate',
      'commissionRate',
      'monthlyGoalCents',
      'specialties',
      'email',
    ] as const) {
      assert.ok(r.errors.fields[f], `falta o aviso de ${f}`);
    }
    assert.equal(r.errors.schedule.length, 1);
    assert.equal(r.errors.schedule[0].clinicId, null);
    assert.equal(countDoctorFormErrors(r.errors), 8);
    assert.match(doctorErrorsSummary(r.errors), /8 pontos/);
  }
});

test('nunca aparece a mensagem técnica do Zod', () => {
  const cases = [
    form([]),
    form([['clinicSchedules', 'isto não é JSON']]),
    form([...without('commissionRate'), ['commissionRate', 'abc']]),
    form([...without('specialties'), ['specialties', 'nao-existe']]),
  ];
  for (const raw of cases) {
    const r = validateCreateDoctor(raw);
    assert.equal(r.ok, false);
    for (const m of allMessages(r)) {
      assert.doesNotMatch(m, /invalid|expected|received/i, m);
    }
  }
});

test('horários: o erro identifica a clínica e o dia', () => {
  const r = validateCreateDoctor(
    form([
      ...without('clinicSchedules'),
      [
        'clinicSchedules',
        JSON.stringify([
          {
            clinicId: CLINIC_A,
            bookableOnline: true,
            weeklySchedule: [
              { weekday: 1, ranges: [{ start: '09:00', end: '13:00' }] },
              { weekday: 4, ranges: [{ start: '18:00', end: '10:00' }] },
            ],
          },
          { clinicId: CLINIC_B, bookableOnline: true, weeklySchedule: [] },
        ]),
      ],
    ]),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    const thursday = r.errors.schedule.find(s => s.weekday === 4);
    assert.equal(thursday?.clinicId, CLINIC_A);
    assert.match(thursday?.message ?? '', /posterior/i);
    const b = r.errors.schedule.find(s => s.clinicId === CLINIC_B);
    assert.equal(b?.weekday, null);
    assert.match(b?.message ?? '', /pelo menos um período/i);
  }
});

test('sobreposição entre clínicas fica como aviso geral dos horários', () => {
  const day = (start: string, end: string) => [
    { weekday: 2, ranges: [{ start, end }] },
  ];
  const r = validateCreateDoctor(
    form([
      ...without('clinicSchedules'),
      [
        'clinicSchedules',
        JSON.stringify([
          {
            clinicId: CLINIC_A,
            bookableOnline: true,
            weeklySchedule: day('09:00', '13:00'),
          },
          {
            clinicId: CLINIC_B,
            bookableOnline: true,
            weeklySchedule: day('12:00', '18:00'),
          },
        ]),
      ],
    ]),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.errors.schedule[0].clinicId, null);
    assert.match(r.errors.schedule[0].message, /sobrepostos/i);
  }
});

test('convite assinalado sem email: aviso no email', () => {
  const r = validateCreateDoctor(
    form([...valid, ['sendActivationInvite', 'on']]),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.fields.email ?? '', /convite/i);
});

test('convite com email válido passa e o email fica em minúsculas', () => {
  const r = validateCreateDoctor(
    form([
      ...without('email'),
      ['email', 'Ana.Silva@Exemplo.PT'],
      ['sendActivationInvite', 'on'],
    ]),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  if (r.ok) {
    assert.equal(r.data.email, 'ana.silva@exemplo.pt');
    assert.equal(r.data.sendActivationInvite, true);
  }
});

test('edição: sem especialidades é erro (antes era ignorado em silêncio)', () => {
  const r = validateUpdateDoctor(form(without('specialties', 'email')));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.fields.specialties);
});

test('edição sem os campos financeiros (não-admin) não mexe neles', () => {
  const r = validateUpdateDoctor(
    form(without('commissionRate', 'monthlyGoalCents', 'email')),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  if (r.ok) {
    assert.equal(r.data.commissionRate, undefined);
    assert.equal(r.data.monthlyGoalCents, undefined);
  }
});

console.log(`\n${n} testes OK`);
