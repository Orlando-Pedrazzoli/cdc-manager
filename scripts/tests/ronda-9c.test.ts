// 📄 scripts/tests/ronda-9c.test.ts
// =============================================================================
// 9.ª ronda (c) — respostas do Victor de 27/11/2026, fase A
//   · 56 modelos da clínica + contratos (dados íntegros)
//   · acesso por médico aos modelos restritos (contratos)
//   · contratos escondidos dos médicos sem acesso
//   · importação: procura das médicas pelo nome, criar/igual/substituir
//   · orçamento em A4: linhas, fases e totais
//   · A3: atraso para começar, em separado do tempo excedido
//   · ponto 24: cobranças abrem no dia de hoje
// Correr: npx tsx scripts/tests/ronda-9c.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import { MODELOS_CLINICA } from '../../src/lib/data/modelos-clinica';
import { CONTRATOS_CLINICA } from '../../src/lib/data/contratos-clinica';
import {
  PLACEHOLDERS,
  TEMPLATE_FOLDERS,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_DOC_CATEGORY,
  TEMPLATE_KIND_LABEL,
} from '../../src/lib/data/document-templates';
import { DOCUMENT_CATEGORIES } from '../../src/lib/domain';
import { mergeTemplate, placeholdersIn } from '../../src/lib/document-merge';
import {
  cleanDoctorIds,
  contractAccessQuery,
  doctorIsAllowed,
  documentTextDoctorId,
  templateIssueBlock,
  templateListFilter,
} from '../../src/lib/template-access';
import {
  doctorCanSeeDocument,
  doctorDocumentFilter,
} from '../../src/lib/patient-access';
import {
  foldName,
  importAction,
  matchDoctors,
  unambiguousIds,
} from '../../src/lib/template-import';
import {
  budgetHasPhases,
  budgetPdfFilename,
  budgetPrintRows,
  budgetPrintTotals,
  eurPdf,
} from '../../src/lib/budget-print';
import { lateStartMinutes } from '../../src/lib/consult-window';
import { consultDelay, summarizeDelays } from '../../src/lib/consult-delays';
import { cobrancaOpensToday } from '../../src/lib/cobranca-filters';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
}

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);

console.log('9.ª ronda (c) — fase A');

// --- Modelos -------------------------------------------------------------------
test('56 modelos: 28 consentimentos, 2 termos, 24 orientações, atestado, encaminhamento', () => {
  const by = (k: string) => MODELOS_CLINICA.filter(t => t.kind === k).length;
  assert.equal(MODELOS_CLINICA.length, 56);
  assert.equal(by('consentimento'), 28);
  assert.equal(by('termo'), 2);
  assert.equal(by('pos-operatorio'), 24);
  assert.equal(by('atestado'), 1);
  assert.equal(by('encaminhamento'), 1);
});

test('4 contratos + folha de modalidades, todos do tipo contrato', () => {
  assert.equal(CONTRATOS_CLINICA.length, 5);
  assert.ok(CONTRATOS_CLINICA.every(t => t.kind === 'contrato'));
  assert.equal(CONTRATOS_CLINICA.filter(t => t.requiresSignature).length, 4);
});

test('chaves únicas, tipo e pasta válidos, título e texto dentro dos limites', () => {
  const all = [...MODELOS_CLINICA, ...CONTRATOS_CLINICA];
  assert.equal(new Set(all.map(t => t.key)).size, all.length);
  for (const t of all) {
    assert.ok((TEMPLATE_KINDS as readonly string[]).includes(t.kind), t.key);
    assert.ok((TEMPLATE_FOLDERS as readonly string[]).includes(t.folder), t.key);
    assert.ok(t.title.length >= 3 && t.title.length <= 120, t.key);
    assert.ok(t.body.length >= 10 && t.body.length <= 20_000, t.key);
    assert.match(t.key, /^[a-z0-9-]+$/);
  }
});

test('as orientações 06, 07 e 08 mantêm as chaves de 09/10 (substituem as antigas)', () => {
  const keys = new Set(MODELOS_CLINICA.map(t => t.key));
  for (const k of [
    'orientacoes-06-extracao-simples',
    'orientacoes-07-dentes-do-siso',
    'orientacoes-08-implantes-dentarios',
  ])
    assert.ok(keys.has(k), k);
});

test('só usam campos {{...}} que o sistema conhece', () => {
  const known = new Set(PLACEHOLDERS.map(p => p.key));
  for (const t of [...MODELOS_CLINICA, ...CONTRATOS_CLINICA])
    for (const p of placeholdersIn(t.body)) assert.ok(known.has(p), `${t.key}: ${p}`);
});

test('sem caracteres que a letra do PDF não tem (☐, −, ◆, ⚠) nem tabulações', () => {
  for (const t of [...MODELOS_CLINICA, ...CONTRATOS_CLINICA]) {
    assert.doesNotMatch(t.body, /[☐−◆⚠\t ]/, t.key);
    assert.doesNotMatch(t.title, /[☐−◆⚠\t ]/, t.key);
  }
});

test('o texto não repete o título no início (o PDF já o imprime)', () => {
  for (const t of MODELOS_CLINICA)
    assert.ok(t.body.startsWith('IDENTIFICAÇÃO\n'), t.key);
});

test('consentimentos e termos identificam paciente e médico; orientações têm contactos', () => {
  for (const t of MODELOS_CLINICA) {
    assert.ok(t.body.includes('{{paciente.nome}}'), t.key);
    assert.ok(t.body.includes('{{medico.nome}}'), t.key);
    if (t.kind === 'pos-operatorio') {
      assert.ok(t.body.includes('{{clinica.telefone}}'), t.key);
      assert.ok(t.body.includes('CONTACTE-NOS IMEDIATAMENTE SE OCORRER'), t.key);
    }
    if (t.kind === 'consentimento')
      assert.ok(/DECLARAÇÃO DE CONSENTIMENTO/.test(t.body), t.key);
  }
});

test('contratos de alinhadores: as três modalidades somam 4.500,00 €', () => {
  const body = (k: string) => CONTRATOS_CLINICA.find(t => t.key === k)!.body;
  const sum = (b: string) =>
    [...b.matchAll(/^(?:Fase \d|Entrada|Mês \d) · .* · ([\d.]+),00 €$/gm)]
      .map(m => Number(m[1].replace('.', '')))
      .reduce((s, v) => s + v, 0);
  for (const k of ['1', '2', '3']) {
    const b = body(`contrato-alinhadores-opcao-${k}`);
    assert.equal(sum(b), 4500, k);
    assert.ok(b.includes('Total · 4.500,00 €'), k);
    assert.ok(b.includes('Cláusula 20.ª (Disposições finais)'), k);
  }
  assert.ok(body('contrato-tratamento-ortodontico').includes('Cláusula 14.ª (Declaração final)'));
});

test('um modelo preenchido não fica com campos por substituir', () => {
  const values = Object.fromEntries(PLACEHOLDERS.map(p => [p.key, 'X']));
  for (const t of [...MODELOS_CLINICA, ...CONTRATOS_CLINICA])
    assert.ok(!mergeTemplate(t.body, values).includes('{{'), t.key);
});

test('tipos novos: encaminhamento arquiva em "referral", contrato em "contract"', () => {
  assert.equal(TEMPLATE_KIND_DOC_CATEGORY.encaminhamento, 'referral');
  assert.equal(TEMPLATE_KIND_DOC_CATEGORY.contrato, 'contract');
  assert.ok((DOCUMENT_CATEGORIES as readonly string[]).includes('contract'));
  assert.equal(TEMPLATE_KIND_LABEL.contrato, 'Contrato');
});

// --- Acesso por médico -----------------------------------------------------------
test('modelo sem restrição: qualquer médico; receção só com allowStaff', () => {
  assert.equal(templateIssueBlock({ allowStaff: false }, { role: 'doctor', doctorId: A }), null);
  assert.equal(templateIssueBlock({ allowStaff: true }, { role: 'receptionist' }), null);
  assert.equal(
    templateIssueBlock({ allowStaff: false }, { role: 'admin' }),
    'Este modelo só pode ser emitido pelo médico.',
  );
});

test('modelo restrito: só os médicos da lista; lista vazia = nenhum', () => {
  const t = { allowStaff: true, restrictedToDoctors: true, allowedDoctorIds: [A, B] };
  assert.equal(templateIssueBlock(t, { role: 'doctor', doctorId: A }), null);
  assert.equal(templateIssueBlock(t, { role: 'doctor', doctorId: C }), 'Modelo indisponível.');
  assert.equal(templateIssueBlock(t, { role: 'doctor', doctorId: null }), 'Modelo indisponível.');
  assert.equal(doctorIsAllowed({ restrictedToDoctors: true, allowedDoctorIds: [] }, A), false);
  // gestão e receção não dependem da lista de médicos
  assert.equal(templateIssueBlock(t, { role: 'admin' }), null);
  assert.equal(templateIssueBlock(t, { role: 'receptionist' }), null);
  assert.equal(templateIssueBlock(t, { role: 'patient' }), 'Sem permissões.');
});

test('lista de modelos ao emitir: o médico não vê os restritos em que não está', () => {
  assert.deepEqual(templateListFilter({ role: 'receptionist' }), { active: true, allowStaff: true });
  assert.deepEqual(templateListFilter({ role: 'doctor', doctorId: A }), {
    active: true,
    $or: [{ restrictedToDoctors: { $ne: true } }, { allowedDoctorIds: A }],
  });
  assert.deepEqual(templateListFilter({ role: 'doctor', doctorId: null }), {
    active: true,
    restrictedToDoctors: { $ne: true },
  });
  assert.equal(contractAccessQuery(A).kind, 'contrato');
});

test('ids vindos do formulário: só válidos e sem repetidos', () => {
  assert.deepEqual(cleanDoctorIds([A, A, 'x', B, 42, ` ${C} `]), [A, B, C]);
});

test('contratos na ficha: escondidos do médico sem acesso; "Outro" continua escondido', () => {
  const contract = { category: 'contract', uploadedByUserId: 'u2' };
  assert.equal(doctorCanSeeDocument(contract, 'u1'), false);
  assert.equal(doctorCanSeeDocument(contract, 'u1', true), true);
  assert.equal(doctorCanSeeDocument(contract, 'u2'), true); // foi ele que carregou
  assert.equal(doctorCanSeeDocument({ category: 'other', uploadedByUserId: 'u2' }, 'u1', true), false);
  assert.equal(doctorCanSeeDocument({ category: 'consent' }, 'u1'), true);
  assert.deepEqual(doctorDocumentFilter('u1'), {
    $or: [{ category: { $nin: ['other', 'contract'] } }, { uploadedByUserId: 'u1' }],
  });
  assert.deepEqual(doctorDocumentFilter('u1', true), {
    $or: [{ category: { $nin: ['other'] } }, { uploadedByUserId: 'u1' }],
  });
});

test('texto do documento: médico que emite; se for a receção, o da consulta', () => {
  assert.equal(documentTextDoctorId(A, B), A); // o médico que emite prevalece
  assert.equal(documentTextDoctorId(null, B), B); // receção + consulta escolhida
  assert.equal(documentTextDoctorId(null, null), null); // receção sem consulta
  assert.equal(documentTextDoctorId(undefined, 'x'), null); // id inválido não entra
});

// --- Importação ------------------------------------------------------------------
test('procura das médicas: palavras inteiras, sem acentos; ambíguo fica de fora', () => {
  const doctors = [
    { id: A, name: 'Dra. ANA PAULA BORGES' },
    { id: B, name: 'Dra. CAMILA SOUZA' },
    { id: C, name: 'Dra. MARIANA PAULA REIS' },
    { id: 'd'.repeat(24), name: 'Dr. CAMILO ANA' },
  ];
  assert.equal(foldName('  Drª.  Ána  '), 'drª. ana');
  const m = matchDoctors(['Christina', 'Camila', 'Ana Paula', ' '], doctors);
  assert.equal(m.length, 3);
  assert.equal(m[0].found.length, 0); // não existe
  assert.deepEqual(m[1].found.map(f => f.id), [B]); // "Camila" não apanha "Camilo"
  assert.deepEqual(m[2].found.map(f => f.id), [A]); // "Ana" não apanha "Mariana"
  assert.deepEqual(unambiguousIds(m), [B, A]);
  const amb = matchDoctors(['Paula'], doctors);
  assert.equal(amb[0].found.length, 2);
  assert.deepEqual(unambiguousIds(amb), []);
});

test('importação: criar, igual, substituir', () => {
  const next = { title: 'T', body: 'corpo', kind: 'termo', folder: 'geral' };
  assert.equal(importAction(null, next), 'criar');
  assert.equal(importAction({ ...next }, next), 'igual');
  assert.equal(importAction({ title: 'T', body: 'corpo', kind: 'termo' }, next), 'igual'); // sem pasta = geral
  assert.equal(importAction({ ...next, body: 'outro' }, next), 'substituir');
  assert.equal(importAction({ ...next, folder: 'cirurgia' }, next), 'substituir');
});

// --- Orçamento em A4 ---------------------------------------------------------------
test('orçamento: linhas por fase, dentes e desconto da linha', () => {
  const rows = budgetPrintRows([
    { nameSnapshot: 'Coroa', priceCents: 65000, phase: 2, toothNumbers: ['36'] },
    { nameSnapshot: 'Consulta', priceCents: 3000 },
    {
      nameSnapshot: 'Restauração',
      listPriceCents: 13000,
      discountCents: 1300,
      priceCents: 11700,
      toothNumbers: ['24', '25'],
      note: '  com isolamento ',
    },
  ]);
  assert.deepEqual(rows.map(r => r.phase), [1, 1, 2]);
  assert.equal(rows[0].description, 'Consulta');
  assert.equal(rows[0].listCents, null); // sem desconto não se mostra o preço à parte
  assert.equal(rows[1].description, 'Restauração (dentes 24, 25)');
  assert.equal(rows[1].listCents, 13000);
  assert.equal(rows[1].note, 'com isolamento');
  assert.equal(rows[2].description, 'Coroa (dente 36)');
  assert.equal(budgetHasPhases(rows), true);
  assert.equal(budgetHasPhases(rows.slice(0, 2)), false);
});

test('orçamento: total = soma das linhas menos o desconto global (como na página)', () => {
  const rows = budgetPrintRows([
    { nameSnapshot: 'A', priceCents: 3000 },
    { nameSnapshot: 'B', listPriceCents: 13000, discountCents: 1300, priceCents: 11700 },
  ]);
  assert.deepEqual(budgetPrintTotals(rows, 0), { grossCents: 16000, discountCents: 1300, totalCents: 14700 });
  assert.deepEqual(budgetPrintTotals(rows, 700), { grossCents: 16000, discountCents: 2000, totalCents: 14000 });
  // desconto global maior do que a soma: total 0, e o desconto mostrado não passa do que havia
  assert.deepEqual(budgetPrintTotals(rows, 999_999), { grossCents: 16000, discountCents: 16000, totalCents: 0 });
  assert.deepEqual(budgetPrintTotals([], null), { grossCents: 0, discountCents: 0, totalCents: 0 });
});

test('orçamento: valores e nome do ficheiro', () => {
  assert.equal(eurPdf(0), '0,00 €');
  assert.equal(eurPdf(1234567), '12 345,67 €');
  assert.equal(eurPdf(-1300), '-13,00 €');
  assert.equal(eurPdf(5), '0,05 €');
  assert.doesNotMatch(eurPdf(123456789), /[ −]/);
  assert.equal(budgetPdfFilename(123), 'orcamento-123.pdf');
  assert.equal(budgetPdfFilename(null), 'orcamento-rascunho.pdf');
});

// --- A3: os dois atrasos, em separado ------------------------------------------------
test('atraso para começar: minutos inteiros depois da hora marcada', () => {
  const t0 = Date.UTC(2026, 10, 27, 10, 0);
  assert.equal(lateStartMinutes(t0, t0 + 7 * 60_000 + 59_000), 7);
  assert.equal(lateStartMinutes(t0, t0), 0);
  assert.equal(lateStartMinutes(t0, t0 - 5 * 60_000), 0); // começou antes da hora
  assert.equal(lateStartMinutes(t0, null), 0);
  assert.equal(lateStartMinutes(t0, undefined), 0);
});

test('resumo: quem começou tarde conta à parte de quem passou do fim', () => {
  const t0 = Date.UTC(2026, 10, 27, 10, 0);
  const min = 60_000;
  const mk = (started: number, done: number) =>
    consultDelay({ startMs: t0, endMs: t0 + 30 * min, startedMs: t0 + started * min, completedMs: t0 + done * min })!;
  const [s] = summarizeDelays([
    { key: 'm', delay: mk(0, 30) }, // a horas
    { key: 'm', delay: mk(10, 28) }, // começou tarde, acabou a horas
    { key: 'm', delay: mk(20, 45) }, // começou tarde e passou 15 min
    { key: 'm', delay: mk(0, 40) }, // começou a horas e passou 10 min
  ]);
  assert.equal(s.consults, 4);
  assert.equal(s.lateStarts, 2);
  assert.equal(s.lateStartMin, 30);
  assert.equal(s.avgLateStartMin, 15);
  assert.equal(s.maxLateStartMin, 20);
  assert.equal(s.delayed, 2);
  assert.equal(s.overrunMin, 25);
  assert.equal(s.avgOverrunMin, 13);
  assert.equal(s.maxOverrunMin, 15);
});

// --- Ponto 24: cobranças de hoje -------------------------------------------------------
test('cobranças: sem data abre em hoje; "Todos" e todos=1 mostram tudo', () => {
  assert.equal(cobrancaOpensToday({}), true);
  assert.equal(cobrancaOpensToday({ todos: '1' }), false);
  assert.equal(cobrancaOpensToday({ ano: '' }), false); // filtro submetido com "Todos"
  assert.equal(cobrancaOpensToday({ mes: '11', dia: '3' }), false);
  assert.equal(cobrancaOpensToday({ todos: '0' }), true);
});

console.log(`\n${n} testes OK`);
