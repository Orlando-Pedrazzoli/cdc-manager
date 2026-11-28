// 📄 scripts/tests/rx-report.test.ts
// =============================================================================
// Ponto 31 (Giulia, 27/11): relatório da radiografia nos documentos.
// Correr: npx tsx scripts/tests/rx-report.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  cleanRxReportText,
  rxReportBlock,
  rxReportBody,
  rxReportTextError,
  rxReportTitle,
  RX_REPORT_MAX,
} from '../../src/lib/rx-report';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

test('texto: limpa quebras de linha do Windows, espaços finais e linhas vazias a mais', () => {
  assert.equal(cleanRxReportText('  Lesão no 36.  \r\n\r\n\r\n\r\nSem mais.  '), 'Lesão no 36.\n\nSem mais.');
  assert.equal(cleanRxReportText(null), '');
  assert.equal(cleanRxReportText(42), '');
});

test('texto: vazio ou curto de mais é recusado; acima do máximo também', () => {
  assert.match(rxReportTextError('') ?? '', /Escreva/);
  assert.match(rxReportTextError('ok') ?? '', /Escreva/);
  assert.equal(rxReportTextError('Sem alterações.'), null);
  assert.equal(rxReportTextError('a'.repeat(RX_REPORT_MAX)), null);
  assert.match(rxReportTextError('a'.repeat(RX_REPORT_MAX + 1)) ?? '', /máximo/);
});

test('só radiografia concluída e ainda sem relatório pode receber um', () => {
  assert.equal(rxReportBlock({ status: 'done', hasReport: false }), null);
  assert.match(rxReportBlock({ status: 'done', hasReport: true }) ?? '', /já tem/);
  assert.match(rxReportBlock({ status: 'requested', hasReport: false }) ?? '', /concluída/);
  assert.match(rxReportBlock({ status: 'in-progress', hasReport: false }) ?? '', /concluída/);
  assert.match(rxReportBlock({ status: 'cancelled', hasReport: false }) ?? '', /cancelado/);
});

test('título com a modalidade e os dentes', () => {
  assert.equal(rxReportTitle('Periapical', ['36', '37']), 'Relatório de radiografia — Periapical (dentes 36, 37)');
  assert.equal(rxReportTitle('Panorâmica', []), 'Relatório de radiografia — Panorâmica');
});

test('corpo: identificação do exame e a interpretação em blocos separados', () => {
  const body = rxReportBody({
    patientName: 'Maria Silva',
    processNumber: 1234,
    modalityLabel: 'Periapical',
    teeth: ['36'],
    examDateLabel: '28 de novembro de 2026',
    requestNotes: ' suspeita de fratura ',
    findings: 'Lesão periapical no 36.',
  });
  const blocks = body.split('\n\n');
  assert.equal(blocks.length, 3);
  assert.equal(
    blocks[0],
    'IDENTIFICAÇÃO\nPaciente: Maria Silva (processo n.º 1234)\nExame: Periapical — dentes 36\nData do exame: 28 de novembro de 2026\nMotivo do pedido: suspeita de fratura',
  );
  assert.equal(blocks[1], 'INTERPRETAÇÃO');
  assert.equal(blocks[2], 'Lesão periapical no 36.');
  const semExtras = rxReportBody({
    patientName: 'João',
    modalityLabel: 'Panorâmica',
    teeth: [],
    examDateLabel: '1 de dezembro de 2026',
    findings: 'Sem alterações.',
  });
  assert.ok(!semExtras.includes('processo'));
  assert.ok(!semExtras.includes('Motivo'));
  assert.ok(semExtras.includes('Exame: Panorâmica\n'));
});

console.log(`\nrx-report: ${n} testes OK`);
