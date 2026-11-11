// 📄 scripts/tests/escala.test.ts
// Correr: npx tsx scripts/tests/escala.test.ts
// -----------------------------------------------------------------------------
// 5.ª ronda/07+08: turnos quinzenais e transcrição da escala do Victor.
// A transcrição é conferida contra a coluna "Nº médicos" do próprio quadro
// (médicos por turno em cada dia no Colombo) e contra a linha da Buraca.
// -----------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { isBiweeklyOn } from '../../src/lib/availability';
import {
  ESCALA,
  buildSchedules,
  matchDoctors,
  normalizeName,
} from '../escala/escala-2026-11';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test('quinzenal: sem âncora trabalha todas as semanas', () => {
  assert.equal(isBiweeklyOn(null, '2026-11-14'), true);
  assert.equal(isBiweeklyOn(undefined, '2026-11-21'), true);
});

test('quinzenal: Dra. Flávia trabalha a 21/11 e folga a 14/11, 28/11, 12/12, 26/12', () => {
  const anchor = '2026-11-21';
  assert.equal(isBiweeklyOn(anchor, '2026-11-21'), true);
  assert.equal(isBiweeklyOn(anchor, '2026-12-05'), true);
  assert.equal(isBiweeklyOn(anchor, '2026-12-19'), true);
  for (const folga of ['2026-11-14', '2026-11-28', '2026-12-12', '2026-12-26']) {
    assert.equal(isBiweeklyOn(anchor, folga), false, folga);
  }
});

test('quinzenal: conta para trás da âncora e atravessa o ano', () => {
  // Dra. Geane: folgas ao domingo 11/10, 25/10, 08/11, 22/11, 06/12, 20/12
  const anchor = '2026-11-15';
  for (const folga of ['2026-10-11', '2026-10-25', '2026-11-08', '2026-11-22', '2026-12-06', '2026-12-20']) {
    assert.equal(isBiweeklyOn(anchor, folga), false, folga);
  }
  for (const on of ['2026-10-18', '2026-11-01', '2026-11-29', '2026-12-27', '2027-01-10']) {
    assert.equal(isBiweeklyOn(anchor, on), true, on);
  }
});

test('escala: médicos por turno no Colombo batem com a coluna "Nº médicos"', () => {
  // [manhã, tarde] por dia da semana (0 = domingo), como no quadro
  const esperado: Record<number, [number, number]> = {
    1: [4, 5],
    2: [5, 5],
    3: [5, 5],
    4: [5, 5],
    5: [5, 5],
    6: [5, 5],
    0: [5, 3],
  };
  for (const [wd, [manha, tarde]] of Object.entries(esperado)) {
    let m = 0;
    let t = 0;
    for (const med of ESCALA) {
      for (const l of med.linhas) {
        // as linhas por confirmar (Natacha ao fim de semana) partilham o
        // gabinete com a Dra. Flávia — o quadro conta-as uma vez
        if (l.clinic !== 'colombo' || l.weekday !== Number(wd) || l.confirmar) continue;
        if (l.turno === 'M' || l.turno === 'D') m++;
        if (l.turno === 'T' || l.turno === 'D') t++;
      }
    }
    assert.deepEqual([m, t], [manha, tarde], `dia ${wd}`);
  }
});

test('escala: Buraca tem um médico por dia e quarta por preencher', () => {
  const porDia = new Map<number, string[]>();
  for (const med of ESCALA) {
    for (const l of med.linhas) {
      if (l.clinic !== 'buraca' || l.confirmar) continue;
      porDia.set(l.weekday, [...(porDia.get(l.weekday) ?? []), med.nome]);
    }
  }
  assert.deepEqual(porDia.get(1), ['Dr. Júlio']);
  assert.deepEqual(porDia.get(2), ['Dr. Marcelo Natali']);
  assert.equal(porDia.get(3), undefined);
  assert.deepEqual(porDia.get(4), ['Dr. Marcelo Natali']);
  assert.deepEqual(porDia.get(5), ['Dra. Ana Paula']);
  assert.deepEqual(porDia.get(6), ['Dr. Júlio']);
  assert.equal(porDia.get(0), undefined);
});

test('escala: 22 médicos, 67 turnos no Colombo e 5 dias na Buraca', () => {
  assert.equal(ESCALA.length, 22);
  let turnos = 0;
  let buraca = 0;
  for (const med of ESCALA) {
    for (const l of med.linhas) {
      if (l.confirmar) continue;
      if (l.clinic === 'buraca') buraca++;
      else turnos += l.turno === 'D' ? 2 : 1;
    }
  }
  // o quadro soma 65 turnos; a linha da Dra. Lays Negrissoli (a última)
  // não tem total preenchido — com os 2 turnos dela são 67, o mesmo que a
  // soma da coluna "Nº médicos" (9 + 5×10 + 8)
  assert.equal(buraca, 5);
  assert.equal(turnos, 67);
});

test('escala: ninguém está no Colombo e na Buraca no mesmo dia', () => {
  for (const med of ESCALA) {
    const dias = new Map<number, Set<string>>();
    for (const l of med.linhas) {
      const s = dias.get(l.weekday) ?? new Set<string>();
      s.add(l.clinic);
      dias.set(l.weekday, s);
    }
    for (const [wd, s] of dias) assert.equal(s.size, 1, `${med.nome} dia ${wd}`);
  }
});

test('correspondência de nomes: fichas do Dentoral em maiúsculas e com título', () => {
  const fichas = [
    'NATALIIA GALKA DRª.',
    'PATRÍCIA OCTAVIO DRA',
    'MARCELO FERRIAN NATALI DR.',
    'MARCELO MARQUES DR.',
    'FERNANDA PATRICIO DRA.',
    'EDER QUEDAS FERREIRA DR.',
    'ANA PAULA BORGES DRA.',
    'JÚLIO SOUZA DR.',
  ].map(name => ({ name }));
  const de = (nome: string) =>
    matchDoctors(ESCALA.find(m => m.nome === nome)!, fichas).map(f => f.name);
  assert.deepEqual(de('Dra. Natália'), ['NATALIIA GALKA DRª.']);
  assert.deepEqual(de('Dr. Marcelo Natali'), ['MARCELO FERRIAN NATALI DR.']);
  assert.deepEqual(de('Dr. Marques'), ['MARCELO MARQUES DR.']);
  assert.deepEqual(de('Dra. Patrícia'), ['PATRÍCIA OCTAVIO DRA']);
  assert.deepEqual(de('Dra. Fernanda'), ['FERNANDA PATRICIO DRA.']);
  assert.deepEqual(de('Dr. Éder'), ['EDER QUEDAS FERREIRA DR.']);
  assert.deepEqual(de('Dra. Lidiany'), []);
  assert.equal(normalizeName('Júlio  Souza Dr.'), 'JULIO SOUZA DR');
});

test('semana-tipo: dúvidas ficam de fora por omissão; sexta da Dra. Jéssica acaba às 20:00', () => {
  const natacha = ESCALA.find(m => m.nome === 'Dra. Natacha')!;
  assert.deepEqual(buildSchedules(natacha, false).colombo.map(w => w.weekday), [4]);
  assert.deepEqual(buildSchedules(natacha, true).colombo.map(w => w.weekday), [0, 4, 6]);
  const jessica = buildSchedules(ESCALA.find(m => m.nome === 'Dra. Jéssica')!, false);
  assert.deepEqual(jessica.colombo.find(w => w.weekday === 5)?.ranges, [{ start: '09:00', end: '20:00' }]);
  const flavia = buildSchedules(ESCALA.find(m => m.nome === 'Dra. Flávia')!, false);
  assert.equal(flavia.colombo.find(w => w.weekday === 6)?.biweeklyAnchor, '2026-11-21');
  assert.equal(flavia.colombo.find(w => w.weekday === 1)?.biweeklyAnchor, null);
});

console.log(`\n${n} testes OK`);
