// 📄 scripts/tests/rx-launch.test.ts
// Correr: npx tsx scripts/tests/rx-launch.test.ts
import assert from 'node:assert/strict';
import {
  irysLaunchUrl,
  irysPatId,
  kodakLaunchUrl,
  normalizeKodakFolder,
  rxCleanName,
  rxSplitName,
} from '../../src/lib/rx-launch';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

// O que o lançador do posto aceita (public/rx-agent/cdc-rx-launcher.ps1)
const LAUNCHER_NAME = /^[\p{L}\p{M} .'-]{1,60}$/u;
const LAUNCHER_DIR = /^([\p{L}\d(])\.RVG\\([\p{L}\d(])\d{7}$/u;
const query = (url: string) => new URLSearchParams(url.split('?')[1]);

test('iRYS: PATID = P + n.º de processo com 7 dígitos', () => {
  assert.equal(irysPatId(69163), 'P0069163');
  assert.equal(irysPatId(1), 'P0000001');
  assert.equal(irysPatId(9_999_999), 'P9999999');
  for (const bad of [null, undefined, 0, -3, 1.5, 10_000_000, Number.NaN]) {
    assert.equal(irysPatId(bad as number | null), null, String(bad));
  }
});

test('iRYS: reproduz a chamada capturada do Dentoral (19/11/2026)', () => {
  // "C:\NNT\NNTBridge.exe" /PATID P0069163 /NAME "PEDRAZZOLI" /SURNAME "ORLANDO"
  assert.equal(
    irysLaunchUrl({ processNumber: 69163, name: 'Orlando Pedrazzoli' }),
    'cdcrx://irys/?patid=P0069163&name=PEDRAZZOLI&surname=ORLANDO',
  );
});

test('iRYS: nome com várias palavras usa a primeira e a última', () => {
  const q = query(irysLaunchUrl({ processNumber: 91130, name: '  maria  josé da Conceição  ' })!);
  assert.equal(q.get('patid'), 'P0091130');
  assert.equal(q.get('surname'), 'MARIA');
  assert.equal(q.get('name'), 'CONCEIÇÃO');
});

test('iRYS: uma só palavra serve de nome e de apelido', () => {
  assert.deepEqual(rxSplitName('Madonna'), { first: 'MADONNA', last: 'MADONNA' });
});

test('iRYS: sem n.º de processo (pré-marcação) ou sem nome não há endereço', () => {
  assert.equal(irysLaunchUrl({ processNumber: null, name: 'Ana Silva' }), null);
  assert.equal(irysLaunchUrl({ processNumber: 10, name: '' }), null);
  assert.equal(irysLaunchUrl({ processNumber: 10, name: '123 456' }), null);
});

test('nome: só sobra o que o lançador aceita', () => {
  for (const raw of ['Ana "Nita" Silva', 'João & Maria', 'O\'Neil-Souza Jr.', 'Paciente anonimizado 123', 'a'.repeat(200), 'Zoë\tÅngström\n']) {
    const clean = rxCleanName(raw);
    assert.match(clean, LAUNCHER_NAME, raw);
    assert.equal(clean, clean.trim(), raw);
  }
  assert.equal(rxCleanName('Ana "Nita" Silva'), 'ANA NITA SILVA');
  assert.equal(rxCleanName(null), '');
});

test('nome: os valores enviados nunca levam aspas nem separadores de argumentos', () => {
  const q = query(irysLaunchUrl({ processNumber: 5, name: 'Ana" /PATID P9999999 /X "Silva' })!);
  for (const k of ['name', 'surname']) assert.match(q.get(k)!, LAUNCHER_NAME, k);
  assert.equal(q.get('patid'), 'P0000005');
});

test('Kodak: reproduz a pasta capturada do Dentoral', () => {
  // TW.exe -PZ:\J.RVG\J0002369 -N<NOME COMPLETO>
  const q = query(kodakLaunchUrl({ folder: 'j0002369', name: 'Ana Maria Silva' })!);
  assert.equal(q.get('dir'), 'J.RVG\\J0002369');
  assert.equal(q.get('name'), 'ANA MARIA SILVA');
  assert.match(q.get('dir')!, LAUNCHER_DIR);
});

test('Kodak: pastas numéricas, com acento e com parêntese', () => {
  for (const [folder, dir] of [['00054651', '0.RVG\\00054651'], ['É0000039', 'É.RVG\\É0000039'], ['(0000001', '(.RVG\\(0000001']] as const) {
    const q = query(kodakLaunchUrl({ folder, name: 'Ana Silva' })!);
    assert.equal(q.get('dir'), dir);
    const m = LAUNCHER_DIR.exec(q.get('dir')!);
    assert.ok(m && m[1] === m[2], folder);
  }
});

test('Kodak: código inválido ou sem nome não dá endereço', () => {
  for (const bad of ['', null, 'J000236', 'J00023699', 'JJ002369', '..\\..\\x', 'J0002369\\..', 'recp']) {
    assert.equal(kodakLaunchUrl({ folder: bad, name: 'Ana Silva' }), null, String(bad));
  }
  assert.equal(kodakLaunchUrl({ folder: 'J0002369', name: '' }), null);
});

test('Kodak: a migração limpa os valores da rx_kodak (código ou caminho)', () => {
  assert.equal(normalizeKodakFolder(' m0001323 '), 'M0001323');
  assert.equal(normalizeKodakFolder('00079641'), '00079641');
  assert.equal(normalizeKodakFolder('Z:\\M.RVG\\M0001323'), 'M0001323');
  assert.equal(normalizeKodakFolder('dadoskodak/DB/K.RVG/K0000035/'), 'K0000035');
  assert.equal(normalizeKodakFolder('á0000056'), 'Á0000056');
  for (const bad of ['', null, undefined, 'recp', 'M.RVG', 'M000132', 'MM001323', 'M00013233']) {
    assert.equal(normalizeKodakFolder(bad), null, String(bad));
  }
});

test('Kodak: o endereço só aceita o código simples, nunca um caminho', () => {
  assert.equal(kodakLaunchUrl({ folder: 'Z:\\J.RVG\\J0002369', name: 'Ana Silva' }), null);
  assert.equal(kodakLaunchUrl({ folder: 'J.RVG/J0002369', name: 'Ana Silva' }), null);
});

console.log(`\n${n} testes OK (rx-launch)`);
