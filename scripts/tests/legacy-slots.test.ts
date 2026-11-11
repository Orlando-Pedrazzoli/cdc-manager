// 📄 scripts/tests/legacy-slots.test.ts
// Correr: npx tsx scripts/tests/legacy-slots.test.ts
// -----------------------------------------------------------------------------
// 4.ª ronda (Victor, nov. 2026), ponto 02 — a agenda do Dentoral tem uma linha
// por intervalo; a importação tem de juntar as linhas seguidas do mesmo
// paciente e usar a grelha real do médico (não 30 min fixos), senão o paciente
// aparece repetido e as marcações sobrepõem-se em duas colunas.
// Casos tirados dos ecrãs do Victor (Dra. Camila, grelha de 20; Dra.
// Christina, grelha de 15).
// -----------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { mergeSlots, joinNotes, type SlotItem } from '../migracao/lib/slots';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const DAY = '2026-11-10';
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(2026, 10, 10, h, m);
};
const row = (doctor: string, hhmm: string, patient: string, kind = 'agenda'): SlotItem<string> => ({
  doctor,
  day: DAY,
  startMs: at(hhmm),
  patient,
  kind,
  ref: `${doctor}:${hhmm}:${patient}`,
});
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const view = (items: SlotItem<string>[]) =>
  mergeSlots(items).map(m => `${m.first.patient} ${hhmm(m.startMs)}-${hhmm(m.endMs)} x${m.members.length}`);

test('grelha de 20 min: pares do mesmo paciente viram uma marcação de 40 min', () => {
  const out = view([
    row('camila', '10:20', 'joao'), row('camila', '10:40', 'joao'),
    row('camila', '11:40', 'rafaela'), row('camila', '12:00', 'rafaela'), row('camila', '12:20', 'rafaela'),
    row('camila', '14:40', 'dam'), row('camila', '15:00', 'dam'),
    row('camila', '15:20', 'vagner'), row('camila', '15:40', 'vagner'),
  ]);
  assert.deepEqual(out, [
    'joao 10:20-11:00 x2',
    'rafaela 11:40-12:40 x3',
    'dam 14:40-15:20 x2',
    'vagner 15:20-16:00 x2',
  ]);
});

test('grelha de 15 min: consultas seguidas não se sobrepõem', () => {
  const merged = mergeSlots([
    row('christina', '09:00', 'laura'), row('christina', '09:15', 'laura'),
    row('christina', '09:30', 'andrei'), row('christina', '09:45', 'andrei'),
    row('christina', '10:00', 'maria'), row('christina', '10:15', 'maria'),
  ]);
  assert.equal(merged.length, 3);
  assert.ok(merged.every(m => m.slotMin === 15));
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i].startMs >= merged[i - 1].endMs, 'sem sobreposição');
});

test('linha isolada fica com a duração de um intervalo da grelha', () => {
  const out = view([
    row('camila', '10:00', 'a'), row('camila', '10:20', 'b'), row('camila', '10:40', 'c'), row('camila', '11:00', 'd'),
  ]);
  assert.deepEqual(out, ['a 10:00-10:20 x1', 'b 10:20-10:40 x1', 'c 10:40-11:00 x1', 'd 11:00-11:20 x1']);
});

test('mesmo paciente, manhã e tarde: duas marcações distintas', () => {
  const out = view([
    row('camila', '10:00', 'a'), row('camila', '10:20', 'a'), row('camila', '10:40', 'b'),
    row('camila', '16:00', 'a'), row('camila', '16:20', 'c'),
  ]);
  assert.deepEqual(out, ['a 10:00-10:40 x2', 'b 10:40-11:00 x1', 'a 16:00-16:20 x1', 'c 16:20-16:40 x1']);
});

test('médicos diferentes não se misturam, nem agenda com faltas', () => {
  const merged = mergeSlots([
    row('camila', '10:00', 'a'), row('camila', '10:20', 'b'), row('camila', '10:40', 'c'),
    row('christina', '10:00', 'a'), row('christina', '10:15', 'a'), row('christina', '10:30', 'z'),
    row('camila', '11:00', 'a', 'no-show'),
  ]);
  const a = merged.filter(m => m.first.patient === 'a');
  assert.equal(a.length, 3);
  assert.deepEqual(a.map(m => m.members.length).sort(), [1, 1, 2]);
});

test('sem amostra para inferir a grelha → 30 min', () => {
  const merged = mergeSlots([row('novo', '09:00', 'a')]);
  assert.equal(merged[0].slotMin, 30);
  assert.equal(hhmm(merged[0].endMs), '09:30');
});

test('a mesma hora repetida conta como uma só', () => {
  const out = view([row('camila', '10:00', 'a'), row('camila', '10:00', 'a'), row('camila', '10:20', 'b'), row('camila', '10:40', 'c')]);
  assert.equal(out[0], 'a 10:00-10:20 x2');
});

test('observações juntam-se sem repetir', () => {
  assert.equal(joinNotes(['Trazer RX', null, 'trazer rx', ' Ligar antes ']), 'Trazer RX · Ligar antes');
  assert.equal(joinNotes([null, '']), null);
});

console.log(`\n${n} testes OK`);
