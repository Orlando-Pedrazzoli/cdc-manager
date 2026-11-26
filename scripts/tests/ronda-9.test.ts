// 📄 scripts/tests/ronda-9.test.ts
// =============================================================================
// 9.ª ronda (Ajustes de 17 e 18/11, Victor) — regras puras da fase 2
//   12: lista dos tipos de Raio-X · 15: janela da barra de tempo ·
//   19: nome completo do médico nos dados do formulário
// Correr: npx tsx scripts/tests/ronda-9.test.ts
// =============================================================================

import assert from 'node:assert/strict';
import {
  RX_MODALITIES,
  RX_MODALITIES_OFFERED,
  RX_MODALITY_LABEL,
  rxModalityUsesTeeth,
} from '../../src/lib/domain';
import { consultWindow } from '../../src/lib/consult-window';
import { createRxRequestSchema } from '../../src/lib/validations/rx';
import { createDoctorSchema } from '../../src/lib/validations/doctor';
import { createPlanSchema } from '../../src/lib/validations/procedure';
import { daysFrom, mondayOf, rangesLabel } from '../../src/lib/doctor-work-days';
import { stripTitleLine } from '../../src/lib/document-merge';
import { dayRequestState, firstFreeGap } from '../../src/lib/waitlist';
import {
  PATIENT_ACCESS_ALERT_THRESHOLD,
  doctorPatientSearchOr,
  patientAccessAlerts,
} from '../../src/lib/patient-access';
import {
  budgetConversion,
  budgetNumberLabel,
  budgetTicketStats,
} from '../../src/lib/budgets';
import {
  TIME_LOCKED_KINDS,
  isTimeLockedKind,
} from '../../src/lib/data/document-templates';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

test('RX: os 13 tipos do Victor, pela ordem dele, sem bitewing', () => {
  assert.deepEqual(
    RX_MODALITIES_OFFERED.map(m => RX_MODALITY_LABEL[m]),
    [
      'Radiografia periapical (apical)',
      'Radiografia oclusal',
      'Seriografia',
      'Radiografia panorâmica',
      'Telerradiografia lateral',
      'Telerradiografia frontal',
      'Radiografia axial',
      'Radiografia dos seios maxilares',
      'Radiografia da ATM',
      'Radiografia transcraniana',
      'Radiografia transfacial',
      'Radiografia de mão e punho',
      'CBCT',
    ],
  );
});

test('RX: bitewing continua válido para os pedidos antigos', () => {
  assert.ok((RX_MODALITIES as readonly string[]).includes('bitewing'));
  assert.ok(RX_MODALITY_LABEL.bitewing);
  // os valores já gravados não mudaram de nome
  for (const old of ['periapical', 'bitewing', 'panoramica']) {
    assert.ok((RX_MODALITIES as readonly string[]).includes(old));
  }
});

test('RX: só periapical e bitewing levam dentes', () => {
  const withTeeth = RX_MODALITIES.filter(rxModalityUsesTeeth);
  assert.deepEqual([...withTeeth].sort(), ['bitewing', 'periapical']);
});

test('RX: o pedido aceita um tipo novo e recusa um desconhecido', () => {
  const base = {
    appointmentId: 'a'.repeat(24),
    toothNumbers: '',
    notes: '',
    consentSignature: 'data:image/png;base64,AAAA',
  };
  assert.ok(createRxRequestSchema.safeParse({ ...base, modality: 'cbct' }).success);
  assert.ok(!createRxRequestSchema.safeParse({ ...base, modality: 'ressonancia' }).success);
});

// Regra substituída pelas respostas de 25/11 (A3): a barra vai do início
// real ao fim MARCADO e depois conta o atraso.
test('barra de tempo: do início real ao fim marcado', () => {
  const s = Date.UTC(2026, 10, 25, 10, 0);
  const e = Date.UTC(2026, 10, 25, 10, 30);
  assert.deepEqual(consultWindow(s, e, null), { startMs: s, endMs: e });
  assert.deepEqual(consultWindow(s, e, undefined), { startMs: s, endMs: e });
  assert.deepEqual(consultWindow(s, e, s), { startMs: s, endMs: e });
  // começou 10 min atrasada: a barra não estica, acaba à hora marcada
  assert.deepEqual(consultWindow(s, e, s + 10 * 60_000), {
    startMs: s + 10 * 60_000,
    endMs: e,
  });
});

test('barra de tempo: paciente atendido antes da hora', () => {
  const s = Date.UTC(2026, 10, 25, 10, 0);
  const e = Date.UTC(2026, 10, 25, 10, 30);
  const started = s - 20 * 60_000; // 09:40
  assert.deepEqual(consultWindow(s, e, started), { startMs: started, endMs: e });
});

test('barra de tempo: iniciada depois do fim marcado já está em atraso', () => {
  const s = Date.UTC(2026, 10, 25, 10, 0);
  const e = Date.UTC(2026, 10, 25, 10, 30);
  const started = e + 45 * 60_000; // 11:15
  assert.deepEqual(consultWindow(s, e, started), { startMs: s, endMs: e });
  assert.deepEqual(consultWindow(s, e, e), { startMs: s, endMs: e });
});

test('médico: nome completo é opcional e tem tamanho mínimo', () => {
  const shape = createDoctorSchema.shape.fullName;
  assert.equal(shape.parse(''), null);
  // campo ausente do formulário = não mexer no valor gravado
  assert.equal(shape.parse(undefined), undefined);
  assert.equal(shape.parse('  Ana Maria Borges Silva '), 'Ana Maria Borges Silva');
  assert.ok(!shape.safeParse('Ana').success);
});

test('dias de trabalho: semana começa à segunda e a faixa tem 14 dias', () => {
  assert.equal(mondayOf('2026-11-25'), '2026-11-23'); // quarta → segunda
  assert.equal(mondayOf('2026-11-23'), '2026-11-23');
  assert.equal(mondayOf('2026-11-29'), '2026-11-23'); // domingo
  const days = daysFrom('2026-11-23', 14);
  assert.equal(days.length, 14);
  assert.equal(days[0], '2026-11-23');
  assert.equal(days[13], '2026-12-06'); // atravessa o mês
});

test('dias de trabalho: horário por extenso, ordenado', () => {
  assert.equal(
    rangesLabel([
      { start: 14 * 60, end: 18 * 60 },
      { start: 9 * 60, end: 13 * 60 },
    ]),
    '09:00–13:00 · 14:00–18:00',
  );
  assert.equal(rangesLabel([]), '');
});

test('comprovativos de presença: tipos sem edição', () => {
  assert.deepEqual([...TIME_LOCKED_KINDS], ['presenca', 'acompanhante']);
  assert.ok(isTimeLockedKind('presenca'));
  assert.ok(!isTimeLockedKind('atestado'));
  assert.ok(!isTimeLockedKind(undefined));
});

test('documentos: o título repetido na 1.ª linha é retirado', () => {
  assert.equal(
    stripTitleLine('CERTIFICADO DE PRESENÇA\n\nPara os devidos efeitos.'),
    'Para os devidos efeitos.',
  );
  // sem linha em branco a seguir, ou sem maiúsculas: fica como está
  assert.equal(stripTitleLine('TÍTULO\ntexto'), 'TÍTULO\ntexto');
  assert.equal(stripTitleLine('Para os devidos efeitos.'), 'Para os devidos efeitos.');
});

test('lista de espera: dia sem horário, cheio e com vaga', () => {
  const work = [{ start: 9 * 60, end: 13 * 60 }];
  assert.equal(dayRequestState([], []), 'no-schedule');
  assert.equal(dayRequestState(work, [{ start: 9 * 60, end: 13 * 60 }]), 'full');
  // sobra só 10 min: não chega para um lugar da grelha
  assert.equal(
    dayRequestState(work, [{ start: 9 * 60, end: 12 * 60 + 50 }]),
    'full',
  );
  assert.equal(dayRequestState(work, [{ start: 9 * 60, end: 12 * 60 }]), 'free');
  assert.equal(dayRequestState(work, []), 'free');
});

test('lista de espera: primeira vaga do dia', () => {
  const work = [
    { start: 14 * 60, end: 18 * 60 },
    { start: 9 * 60, end: 13 * 60 },
  ];
  const busy = [
    { start: 9 * 60, end: 10 * 60 },
    { start: 10 * 60, end: 11 * 60 },
    { start: 11 * 60 + 30, end: 13 * 60 },
  ];
  assert.deepEqual(firstFreeGap(work, busy), { start: 11 * 60, end: 11 * 60 + 30 });
  // hoje, às 12:00: a vaga das 11:00 já passou → só à tarde
  assert.deepEqual(firstFreeGap(work, busy, 15, 12 * 60), {
    start: 14 * 60,
    end: 18 * 60,
  });
  // marcações sobrepostas não criam vagas falsas
  assert.equal(
    firstFreeGap(
      [{ start: 9 * 60, end: 10 * 60 }],
      [
        { start: 9 * 60, end: 9 * 60 + 40 },
        { start: 9 * 60 + 20, end: 10 * 60 },
      ],
    ),
    null,
  );
  // depois da hora de fecho não há vaga
  assert.equal(firstFreeGap(work, [], 15, 18 * 60), null);
});

test('orçamentos: conversão por orçamento', () => {
  assert.equal(budgetConversion(100_00, 0), 0);
  assert.equal(budgetConversion(100_00, 25_00), 25);
  assert.equal(budgetConversion(100_00, 100_00), 100);
  assert.equal(budgetConversion(100_00, 130_00), 100); // nunca passa de 100%
  assert.equal(budgetConversion(0, 0), null); // orçamento a zero
});

test('orçamentos: ticket médio apresentado, aceite e do tratamento feito', () => {
  const s = budgetTicketStats([
    { valueCents: 1000_00, accepted: true, doneCents: 400_00 },
    { valueCents: 500_00, accepted: true, doneCents: 0 },
    { valueCents: 300_00, accepted: false, doneCents: 0 },
  ]);
  assert.equal(s.presentedN, 3);
  assert.equal(s.acceptedN, 2);
  assert.equal(s.startedN, 1);
  assert.equal(s.avgPresentedCents, 600_00);
  assert.equal(s.avgAcceptedCents, 750_00);
  assert.equal(s.avgDoneCents, 400_00);
  assert.equal(s.conversionCents, 22); // 400 de 1800
  const empty = budgetTicketStats([]);
  assert.equal(empty.avgPresentedCents, null);
  assert.equal(empty.avgDoneCents, null);
  assert.equal(empty.conversionCents, null);
});

test('orçamentos: etiqueta do número', () => {
  assert.equal(budgetNumberLabel(12), 'n.º 12');
  assert.equal(budgetNumberLabel(null), 's/ n.º');
  assert.equal(budgetNumberLabel(undefined), 's/ n.º');
});

test('médico: pesquisa só por nome ou n.º de processo', () => {
  assert.deepEqual(doctorPatientSearchOr('1234'), [{ processNumber: 1234 }]);
  // telemóvel e NIF não servem para pesquisar
  assert.deepEqual(doctorPatientSearchOr('912345678'), []);
  assert.deepEqual(doctorPatientSearchOr('123456789'), []);
  // menos de 3 letras não chega
  assert.deepEqual(doctorPatientSearchOr('an'), []);
  assert.deepEqual(doctorPatientSearchOr('  '), []);
  assert.deepEqual(doctorPatientSearchOr('ana'), [
    { name: { $regex: 'ana', $options: 'i' } },
  ]);
  assert.deepEqual(doctorPatientSearchOr('ana silva'), [
    {
      $and: [
        { name: { $regex: 'ana', $options: 'i' } },
        { name: { $regex: 'silva', $options: 'i' } },
      ],
    },
  ]);
  // carateres de regex no termo são neutralizados
  assert.deepEqual(doctorPatientSearchOr('a.b*c'), [
    { name: { $regex: 'a\\.b\\*c', $options: 'i' } },
  ]);
});

test('acessos: aviso à gestão só a partir do limite de fichas fora da agenda', () => {
  const t = PATIENT_ACCESS_ALERT_THRESHOLD;
  const alerts = patientAccessAlerts(
    [
      { doctorId: 'a', doctorName: 'Dr. A', patients: t - 1 },
      { doctorId: 'b', doctorName: 'Dra. B', patients: t },
      { doctorId: null, doctorName: 'Dr. C', patients: t * 2 },
    ],
    '2026-11-25',
  );
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].subject, 'Dra. B');
  assert.equal(alerts[0].level, 'warning');
  assert.equal(alerts[0].kind, 'patient-access');
  assert.ok(alerts[0].href?.includes('medico=b'));
  assert.equal(alerts[1].level, 'urgent');
  assert.ok(alerts[1].text.includes(String(t * 2)));
});

test('plano: criar orçamento sem desconto (null) não falha a validação', () => {
  const id = '507f1f77bcf86cd799439011';
  const parsed = createPlanSchema.safeParse({
    patientId: id,
    clinicId: id,
    title: 'Reabilitação do quadrante',
    items: JSON.stringify([
      {
        treatmentTypeId: id,
        priceEuros: '45,50',
        note: '',
        toothNumbers: '26',
        phase: '1',
      },
    ]),
    discountEuros: null,
    notes: '',
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.discountEuros, 0);
  assert.equal(parsed.data.items[0].priceEuros, 4550);
  assert.deepEqual(parsed.data.items[0].toothNumbers, ['26']);
});

console.log(`\n${n} testes OK`);
