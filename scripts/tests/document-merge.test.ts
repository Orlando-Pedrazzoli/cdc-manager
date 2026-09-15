// 📄 scripts/tests/document-merge.test.ts
// Correr: npx tsx scripts/tests/document-merge.test.ts
import assert from 'node:assert/strict';
import {
  mergeTemplate,
  placeholdersIn,
  longDatePt,
  shortDatePt,
} from '../../src/lib/document-merge';
import { DEFAULT_TEMPLATES } from '../../src/lib/data/document-templates';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('substitui placeholders e deixa "________" nos vazios', () => {
  const out = mergeTemplate(
    'Olá {{paciente.nome}}, NIF {{ paciente.nif }}, {{x}}',
    { 'paciente.nome': 'Livia', 'paciente.nif': null },
  );
  assert.equal(out, 'Olá Livia, NIF ________, ________');
});
test('lista placeholders únicos', () => {
  assert.deepEqual(placeholdersIn('{{a}} {{b}} {{a}}'), ['a', 'b']);
});
test('todos os modelos default só usam placeholders conhecidos', () => {
  const known = new Set([
    'paciente.nome',
    'paciente.nif',
    'paciente.utente',
    'paciente.nascimento',
    'paciente.processo',
    'medico.nome',
    'medico.cedula',
    'clinica.nome',
    'clinica.morada',
    'data',
    'data.curta',
    'consulta.data',
    'consulta.inicio',
    'consulta.fim',
    'acompanhante.nome',
    'dias',
    'tratamento',
  ]);
  for (const t of DEFAULT_TEMPLATES)
    for (const k of placeholdersIn(t.body))
      assert.ok(known.has(k), `${t.key}: ${k}`);
});
test('datas em PT (Lisboa)', () => {
  assert.equal(
    longDatePt(new Date('2026-09-15T10:00:00Z')),
    '15 de setembro de 2026',
  );
  assert.equal(shortDatePt(new Date('2026-09-15T10:00:00Z')), '15/09/2026');
});
console.log(`\n${n} testes passaram.`);
