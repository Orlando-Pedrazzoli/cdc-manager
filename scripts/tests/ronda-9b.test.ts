// 📄 scripts/tests/ronda-9b.test.ts
// =============================================================================
// 9.ª ronda (b) — respostas do Victor de 25/11 aos "Ajustes de 17 e 18/11"
//   A4/A5: horas dos comprovativos · A9: alerta de acessos por mês ·
//   A12: vaga de 30 min · B1: "N.º do paciente" nos modelos ·
//   B3: categoria "Outro" escondida do médico · F3: Dr./Dra. · F4: "Pendente"
// Correr: npx tsx scripts/tests/ronda-9b.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import { certificateTimes } from '../../src/lib/certificate-times';
import {
  PATIENT_ACCESS_ALERT_THRESHOLD,
  doctorCanSeeDocument,
  doctorDocumentFilter,
  patientAccessAlerts,
} from '../../src/lib/patient-access';
import { DAY_REQUEST_MIN_GAP, dayRequestState } from '../../src/lib/waitlist';
import { renamePatientNumberLabel } from '../../src/lib/template-labels';
import { guessDoctorTitle, standardDoctorName } from '../../src/lib/doctor-title';
import { agendaColor } from '../../src/lib/agenda-colors';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

const at = (hhmm: string) => new Date(`2026-11-25T${hhmm}:00.000Z`);

test('comprovativo: entrada = "Chegou", saída = "Tudo OK"', () => {
  const t = certificateTimes({
    startAt: at('10:00'),
    endAt: at('10:30'),
    checkedInAt: at('09:52'),
    startedAt: at('10:05'),
    completedAt: at('10:40'),
    closedAt: at('10:58'),
  });
  assert.equal(t.recorded, true);
  assert.equal(t.blockReason, null);
  assert.equal(t.entry?.toISOString(), at('09:52').toISOString());
  // a saída é o fecho da faturação, não o fim da consulta
  assert.equal(t.exit?.toISOString(), at('10:58').toISOString());
});

test('comprovativo: sem entrada ou sem saída registadas não é emitido', () => {
  const base = { startAt: at('10:00'), endAt: at('10:30') };
  assert.match(certificateTimes(null).blockReason ?? '', /Escolha a consulta/);
  assert.match(certificateTimes(base).blockReason ?? '', /nem a saída/);
  // consulta concluída pelo médico, mas ainda sem "Tudo OK"
  const noExit = certificateTimes({
    ...base,
    checkedInAt: at('09:55'),
    startedAt: at('10:00'),
    completedAt: at('10:30'),
  });
  assert.equal(noExit.recorded, false);
  assert.match(noExit.blockReason ?? '', /Tudo OK/);
  // fechada, mas a receção nunca marcou "Chegou"
  const noEntry = certificateTimes({
    ...base,
    startedAt: at('10:00'),
    completedAt: at('10:30'),
    closedAt: at('10:45'),
  });
  assert.equal(noEntry.recorded, false);
  assert.match(noEntry.blockReason ?? '', /Chegou/);
  // horas incoerentes
  assert.equal(
    certificateTimes({ ...base, checkedInAt: at('11:00'), closedAt: at('10:45') }).recorded,
    false,
  );
});

test('comprovativo: os outros modelos continuam a ter horas para mostrar', () => {
  const t = certificateTimes({ startAt: at('10:00'), endAt: at('10:30') });
  assert.equal(t.entry?.toISOString(), at('10:00').toISOString());
  assert.equal(t.exit?.toISOString(), at('10:30').toISOString());
});

test('acessos: aviso às 8 fichas fora da agenda no mesmo mês', () => {
  assert.equal(PATIENT_ACCESS_ALERT_THRESHOLD, 8);
  const alerts = patientAccessAlerts(
    [
      { doctorId: 'a', doctorName: 'Dr. A', patients: 7 },
      { doctorId: 'b', doctorName: 'Dra. B', patients: 8 },
    ],
    '2026-11-25',
  );
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].subject, 'Dra. B');
  assert.ok(alerts[0].text.includes('este mês'));
  assert.ok(alerts[0].href?.includes('dias=30'));
});

test('lista de espera: a vaga passa a ser de 30 minutos', () => {
  assert.equal(DAY_REQUEST_MIN_GAP, 30);
  const work = [{ start: 9 * 60, end: 13 * 60 }];
  // sobram 20 min: já não conta como vaga
  assert.equal(dayRequestState(work, [{ start: 9 * 60, end: 12 * 60 + 40 }]), 'full');
  assert.equal(dayRequestState(work, [{ start: 9 * 60, end: 12 * 60 + 30 }]), 'free');
});

test('modelos: "N.º de processo" passa a "N.º do paciente"', () => {
  assert.equal(
    renamePatientNumberLabel('NIF: {{paciente.nif}} · Processo n.º {{paciente.processo}}'),
    'NIF: {{paciente.nif}} · N.º do paciente: {{paciente.processo}}',
  );
  assert.equal(
    renamePatientNumberLabel('Nº de processo: {{paciente.processo}}'),
    'N.º do paciente: {{paciente.processo}}',
  );
  assert.equal(
    renamePatientNumberLabel('N.º de paciente: {{paciente.processo}}'),
    'N.º do paciente: {{paciente.processo}}',
  );
  // o campo e o resto do texto ficam como estão; aplicar duas vezes não muda
  const clinical = 'O processo de cicatrização demora 7 dias. {{paciente.processo}}';
  assert.equal(renamePatientNumberLabel(clinical), clinical);
  const once = renamePatientNumberLabel('Número de processo {{paciente.processo}}');
  assert.equal(renamePatientNumberLabel(once), once);
});

test('documentos: o médico não vê a categoria "Outro", salvo o que carregou', () => {
  assert.equal(doctorCanSeeDocument({ category: 'xray', uploadedByUserId: 'x' }, 'u1'), true);
  assert.equal(doctorCanSeeDocument({ category: 'other', uploadedByUserId: 'x' }, 'u1'), false);
  assert.equal(doctorCanSeeDocument({ category: 'other', uploadedByUserId: 'u1' }, 'u1'), true);
  assert.equal(doctorCanSeeDocument({ category: 'other' }, 'u1'), false);
  assert.deepEqual(doctorDocumentFilter('u1'), {
    $or: [{ category: { $ne: 'other' } }, { uploadedByUserId: 'u1' }],
  });
});

test('médicos: nomes padronizados com Dr. / Dra.', () => {
  assert.deepEqual(standardDoctorName('Dra. Ana Borges'), {
    name: 'Dra. Ana Borges',
    outcome: 'ok',
  });
  assert.equal(standardDoctorName('Dra Ana Borges').name, 'Dra. Ana Borges');
  assert.equal(standardDoctorName('DR. Rui Costa').name, 'Dr. Rui Costa');
  assert.equal(standardDoctorName('Drª Marta Silva').name, 'Dra. Marta Silva');
  assert.deepEqual(standardDoctorName('Flávia Mendes'), {
    name: 'Dra. Flávia Mendes',
    outcome: 'added',
  });
  assert.equal(standardDoctorName('Éder Lima').name, 'Dr. Éder Lima');
  assert.equal(standardDoctorName('Geane Souza').name, 'Dra. Geane Souza');
  // Dentoral: o título vem no fim — passa para a frente, uma só vez
  assert.deepEqual(standardDoctorName('ANA PAULA BORGES DRA.'), {
    name: 'Dra. ANA PAULA BORGES',
    outcome: 'normalized',
  });
  assert.equal(standardDoctorName('DIANA FERNANDES DRª').name, 'Dra. DIANA FERNANDES');
  assert.equal(standardDoctorName('NATALIIA GALKA DRª.').name, 'Dra. NATALIIA GALKA');
  assert.equal(standardDoctorName('PATRÍCIA OCTAVIO DRA').name, 'Dra. PATRÍCIA OCTAVIO');
  assert.equal(standardDoctorName('EDER QUEDAS FERREIRA DR.').name, 'Dr. EDER QUEDAS FERREIRA');
  assert.equal(standardDoctorName('VIVIANE  LIMA PAULA DRª.').name, 'Dra. VIVIANE LIMA PAULA');
  // o título escrito decide quando o primeiro nome não dá certeza
  assert.equal(standardDoctorName('REGIS SIMONY DR.').name, 'Dr. REGIS SIMONY');
  assert.equal(standardDoctorName('ROSELI TAVARES DRA.').name, 'Dra. ROSELI TAVARES');
  assert.equal(standardDoctorName('Doutor Teste 2').name, 'Dr. Teste 2');
  // título escrito que contradiz o nome: por decidir, não se adivinha
  assert.equal(standardDoctorName('JANAÍNA DE OLIVEIRA BRAGA DR.').outcome, 'unknown');
  assert.equal(
    standardDoctorName('JANAÍNA DE OLIVEIRA BRAGA DR.', 'Dra.').name,
    'Dra. JANAÍNA DE OLIVEIRA BRAGA',
  );
  // entradas que não são médicos ficam como estão
  for (const n of ['BACKOFFICE', 'ORTOPANTOMOGRAFO', 'MONTEIRO', 'Médico não identificado (Dentoral)']) {
    const r = standardDoctorName(n);
    assert.equal(r.outcome, 'unknown');
    assert.equal(r.name, n);
  }
  // aplicar duas vezes não muda nada
  assert.equal(standardDoctorName('Dra. ANA PAULA BORGES').outcome, 'ok');
  // sem certeza não se inventa: fica por decidir
  assert.equal(standardDoctorName('Portugal').outcome, 'unknown');
  assert.equal(standardDoctorName('Darcy Reis').outcome, 'unknown');
  assert.equal(guessDoctorTitle('Darcy'), null);
  // decisão dada na linha de comandos
  assert.equal(standardDoctorName('Darcy Reis', 'Dra.').name, 'Dra. Darcy Reis');
});

test('agenda: o estado chama-se "Pendente"', () => {
  assert.equal(agendaColor('pending').label, 'Pendente');
});

console.log(`\n${n} testes OK`);
