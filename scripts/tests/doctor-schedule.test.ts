// 📄 scripts/tests/doctor-schedule.test.ts
// Correr: npx tsx scripts/tests/doctor-schedule.test.ts
// -----------------------------------------------------------------------------
// Regressão do apontamento 07 (2.ª reunião): médico criado com "Trabalha em X"
// ativado mas sem nenhum período ficava invisível na agenda dessa clínica.
// O schema tem de recusar clínicas ativadas sem horário.
// -----------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { SPECIALTIES } from '../../src/lib/domain';
import { createDoctorSchema } from '../../src/lib/validations/doctor';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const CLINIC_A = '64b0c0ffee0000000000000a';
const CLINIC_B = '64b0c0ffee0000000000000b';

const base = {
  name: 'Miguel Ruiz',
  licenseNumber: '12345',
  specialties: [SPECIALTIES[0]],
  color: '#2743A6',
  email: '',
};

test('recusa clínica ativada sem nenhum período', () => {
  const r = createDoctorSchema.safeParse({
    ...base,
    clinicSchedules: JSON.stringify([
      { clinicId: CLINIC_A, bookableOnline: true, weeklySchedule: [] },
    ]),
  });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.match(r.error.issues[0].message, /pelo menos um período/i);
  }
});

test('recusa clínica com dias listados mas todos sem intervalos', () => {
  const r = createDoctorSchema.safeParse({
    ...base,
    clinicSchedules: JSON.stringify([
      {
        clinicId: CLINIC_A,
        bookableOnline: true,
        weeklySchedule: [{ weekday: 1, ranges: [] }],
      },
    ]),
  });
  assert.equal(r.success, false);
});

test('aceita clínica com um período válido', () => {
  const r = createDoctorSchema.safeParse({
    ...base,
    clinicSchedules: JSON.stringify([
      {
        clinicId: CLINIC_A,
        bookableOnline: true,
        weeklySchedule: [
          { weekday: 1, ranges: [{ start: '09:00', end: '13:00' }] },
        ],
      },
    ]),
  });
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test('duas clínicas: a segunda sem período é recusada', () => {
  const r = createDoctorSchema.safeParse({
    ...base,
    clinicSchedules: JSON.stringify([
      {
        clinicId: CLINIC_A,
        bookableOnline: true,
        weeklySchedule: [
          { weekday: 1, ranges: [{ start: '09:00', end: '13:00' }] },
        ],
      },
      { clinicId: CLINIC_B, bookableOnline: true, weeklySchedule: [] },
    ]),
  });
  assert.equal(r.success, false);
});

test('sobreposição entre clínicas continua a ser detetada', () => {
  const r = createDoctorSchema.safeParse({
    ...base,
    clinicSchedules: JSON.stringify([
      {
        clinicId: CLINIC_A,
        bookableOnline: true,
        weeklySchedule: [
          { weekday: 2, ranges: [{ start: '09:00', end: '13:00' }] },
        ],
      },
      {
        clinicId: CLINIC_B,
        bookableOnline: true,
        weeklySchedule: [
          { weekday: 2, ranges: [{ start: '12:00', end: '18:00' }] },
        ],
      },
    ]),
  });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.match(r.error.issues[0].message, /sobrepostos/i);
  }
});

console.log(`\n${n} testes OK`);
