// 📄 src/lib/seed/demo.ts
// =============================================================================
// CDC Manager — SEED DE DEMONSTRAÇÃO ("um dia na clínica")
// -----------------------------------------------------------------------------
// Prepara a base de dados para a demo ao Victor e à Isabel: limpa TODOS os
// dados operacionais e cria um cenário realista:
//   · 4 profissionais (Dra. Marta com conta ATIVA para login na demo)
//   · 8 pacientes com NIFs válidos, telefones e consentimentos RGPD
//   · 1 paciente "rico": anamnese com alergias, odontograma v1+v2, plano
//     de tratamento aprovado com fase executada
//   · O DIA DE HOJE preenchido no Colombo com estados relativos à hora
//     atual (concluídas de manhã, uma em curso, uma em espera, futuras)
//   · Fila de cobrança com valores + 1 cobrança já registada hoje
//   · Preços de demonstração no catálogo de atos (a matriz real do cliente
//     substitui-os depois)
//
// USO:
//   npx tsx --env-file=.env.local src/lib/seed/demo.ts --confirmar
//   (opcional) SEED_DEMO_EMAIL=teu@email.com  → esse email vai para a
//   paciente Beatriz Carvalho, para testares a confirmação de marcação
//
// SEGURANÇA:
//   · Sem --confirmar: mostra o que faria e sai (dry-run)
//   · ABORTA se houver >100 pacientes (proteção contra apagar uma base
//     migrada real — os 86k do Dentoral nunca podem ser tocados por isto)
//   · Preserva: Clinics, TreatmentTypes, Users admin/receptionist
// =============================================================================

import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/mongodb';
import '@/models';
import mongoose from 'mongoose';
import Appointment from '@/models/Appointment';
import Procedure from '@/models/Procedure';
import Invoice from '@/models/Invoice';
import TreatmentPlan from '@/models/TreatmentPlan';
import Odontogram from '@/models/Odontogram';
import ClinicalRecord from '@/models/ClinicalRecord';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Waitlist from '@/models/Waitlist';
import Recall from '@/models/Recall';
import ActivationCode from '@/models/ActivationCode';
import Notification from '@/models/Notification';
import AuditLog from '@/models/AuditLog';
import User from '@/models/User';
import TreatmentType from '@/models/TreatmentType';
import Clinic from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { resolveCommissionRate, commissionCentsOf } from '@/lib/commissions';
import type { Specialty } from '@/lib/domain';

const DEMO_PASSWORD = 'Demo2026!';

// -----------------------------------------------------------------------------
// Helpers puros
// -----------------------------------------------------------------------------

/** Gera um NIF de pessoa singular VÁLIDO (checksum módulo 11) e determinístico */
export function makeValidNif(seed: number): string {
  // 8 dígitos base: começa em 2 (singular) + 7 derivados do seed
  const base = `2${String(1000000 + ((seed * 137) % 9000000)).slice(-7)}`;
  const sum = base.split('').reduce((s, d, i) => s + Number(d) * (9 - i), 0);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return base + String(check);
}

export interface SlotPlan {
  startMin: number;
  status:
    | 'completed'
    | 'no-show'
    | 'in-progress'
    | 'checked-in'
    | 'confirmed'
    | 'pending';
}

/**
 * Distribui estados pelo dia RELATIVOS à hora atual de Lisboa:
 * passadas → concluídas (uma vira falta), a mais próxima → em curso,
 * a seguinte → em espera, o resto → confirmada/pendente.
 */
export function assignStatuses(slots: number[], nowMin: number): SlotPlan[] {
  const sorted = [...slots].sort((a, b) => a - b);
  const past = sorted.filter(s => s + 45 <= nowMin);
  const future = sorted.filter(s => s + 45 > nowMin);
  const plans: SlotPlan[] = [];

  past.forEach((s, i) => {
    plans.push({
      startMin: s,
      // a penúltima passada vira falta (mostra o esbatido na demo)
      status:
        past.length > 1 && i === past.length - 2 ? 'no-show' : 'completed',
    });
  });
  future.forEach((s, i) => {
    if (i === 0) plans.push({ startMin: s, status: 'in-progress' });
    else if (i === 1) plans.push({ startMin: s, status: 'checked-in' });
    else if (i === 2) plans.push({ startMin: s, status: 'confirmed' });
    else plans.push({ startMin: s, status: 'pending' });
  });
  return plans;
}

function utcNowLisbonMin(): number {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date())) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

// Preços de demonstração por palavra-chave do nome do ato (cêntimos)
const DEMO_PRICES: [RegExp, number][] = [
  [/avalia|check-?up|consulta/i, 4000],
  [/destartariza|limpeza|higien/i, 6000],
  [/branqueamento/i, 25000],
  [/restaura|bonding|compósito/i, 8500],
  [/endodontia|desvitaliza|canal/i, 22000],
  [/extra[çc][ãa]o|exodontia/i, 9000],
  [/siso/i, 15000],
  [/implante/i, 95000],
  [/coroa/i, 50000],
  [/ponte|pôntico/i, 45000],
  [/prótese/i, 60000],
  [/aparelho|ortod|alinhador/i, 180000],
  [/selante/i, 3500],
  [/flúor|fluor/i, 3000],
  [/radiografia|rx|panorâmica/i, 3500],
  [/periodont|raspagem|alisamento/i, 12000],
  [/gengiv/i, 15000],
  [/faceta/i, 40000],
  [/harmoniza|botox|ácido/i, 25000],
  [/urgência/i, 5500],
];
function demoPriceFor(name: string): number {
  for (const [re, cents] of DEMO_PRICES) if (re.test(name)) return cents;
  return 7500; // fallback: 75 €
}

// -----------------------------------------------------------------------------
// Runner
// -----------------------------------------------------------------------------
async function main() {
  const confirm = process.argv.includes('--confirmar');
  const demoEmail = process.env.SEED_DEMO_EMAIL ?? null;

  console.log('CDC Manager — seed de DEMONSTRAÇÃO');
  console.log('───────────────────────────────────────────────');

  await dbConnect();

  // GUARDA: nunca tocar numa base com dados reais migrados
  const patientCount = await Patient.countDocuments();
  if (patientCount > 100) {
    console.error(
      `✗ ABORTADO: existem ${patientCount} pacientes na base — isto parece uma base REAL (migrada).`,
    );
    console.error('  O seed de demo só corre em bases pequenas de teste.');
    process.exit(1);
  }

  if (!confirm) {
    console.log('MODO DRY-RUN (sem --confirmar). O seed iria:');
    console.log(
      `  · APAGAR dados operacionais (${patientCount} pacientes atuais, médicos, marcações, atos, faturas, fichas, planos, auditoria, contas doctor/patient)`,
    );
    console.log('  · Manter: clínicas, catálogo de atos, contas admin/receção');
    console.log(
      '  · Criar: 4 profissionais, 8 pacientes, o dia de hoje preenchido, cobranças',
    );
    console.log('  · Definir preços de demonstração no catálogo');
    console.log(
      '\nPara executar:  npx tsx --env-file=.env.local src/lib/seed/demo.ts --confirmar',
    );
    process.exit(0);
  }

  // --- 1. LIMPEZA ordenada ---------------------------------------------------
  console.log('· A limpar dados operacionais…');
  await Promise.all([
    Appointment.deleteMany({}),
    Procedure.deleteMany({}),
    Invoice.deleteMany({}),
    TreatmentPlan.deleteMany({}),
    Odontogram.deleteMany({}),
    ClinicalRecord.deleteMany({}),
    Waitlist.deleteMany({}),
    Recall.deleteMany({}),
    ActivationCode.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  await Patient.deleteMany({});
  await Doctor.deleteMany({});
  await User.deleteMany({ role: { $in: ['doctor', 'patient'] } });

  const admin = await User.findOne({ role: 'admin' }).select('_id name');
  if (!admin) {
    console.error(
      '✗ Sem utilizador admin na base — corre primeiro o seed base.',
    );
    process.exit(1);
  }

  const colombo = await Clinic.findOne({ slug: 'colombo' });
  const buraca = await Clinic.findOne({ slug: 'buraca' });
  if (!colombo || !buraca) {
    console.error('✗ Clínicas em falta — corre primeiro o seed base.');
    process.exit(1);
  }

  // --- 2. Preços de demonstração no catálogo ---------------------------------
  console.log('· Preços de demonstração no catálogo de atos…');
  const treatments = await TreatmentType.find({});
  for (const t of treatments) {
    t.set('priceCents', demoPriceFor(t.name));
    await t.save();
  }
  const byName = (re: RegExp) =>
    treatments.find(t => re.test(t.name)) ?? treatments[0];

  // --- 3. Profissionais ------------------------------------------------------
  console.log('· Profissionais…');
  const weekdays = (days: number[], ranges: { start: string; end: string }[]) =>
    days.map(weekday => ({ weekday, ranges }));

  const doctorDocs = [
    {
      name: 'Dra. Marta Fonseca',
      cedula: '14523',
      specialties: ['dentisteria', 'estetica-dentaria'] as Specialty[],
      color: '#2743A6',
      active: true,
      clinicSchedules: [
        {
          clinicId: colombo._id,
          bookableOnline: true,
          weeklySchedule: weekdays(
            [1, 2, 3, 4, 5],
            [
              { start: '09:00', end: '13:00' },
              { start: '14:00', end: '19:00' },
            ],
          ),
        },
      ],
    },
    {
      name: 'Dr. Rui Tavares',
      cedula: '11876',
      specialties: ['implantologia', 'periodontologia'] as Specialty[],
      color: '#0F7B4D',
      active: true,
      clinicSchedules: [
        {
          clinicId: colombo._id,
          bookableOnline: true,
          weeklySchedule: weekdays(
            [1, 3, 5],
            [{ start: '10:00', end: '19:00' }],
          ),
        },
        {
          clinicId: buraca._id,
          bookableOnline: false,
          weeklySchedule: weekdays([6], [{ start: '09:30', end: '13:30' }]),
        },
      ],
    },
    {
      name: 'Dra. Sofia Lima',
      cedula: 'HO-2201',
      specialties: ['higiene-oral'] as Specialty[],
      color: '#7A4FB0',
      active: true,
      clinicSchedules: [
        {
          clinicId: colombo._id,
          bookableOnline: true,
          weeklySchedule: weekdays([2, 4], [{ start: '09:00', end: '17:00' }]),
        },
        {
          clinicId: buraca._id,
          bookableOnline: true,
          weeklySchedule: weekdays(
            [1, 3],
            [
              { start: '10:00', end: '13:00' },
              { start: '14:00', end: '18:00' },
            ],
          ),
        },
      ],
    },
    {
      name: 'Dr. Miguel Antunes',
      cedula: '16690',
      specialties: ['ortodontia', 'odontopediatria'] as Specialty[],
      color: '#C2620A',
      active: true,
      clinicSchedules: [
        {
          clinicId: colombo._id,
          bookableOnline: true,
          weeklySchedule: [
            ...weekdays([1, 2, 3, 4, 5], [{ start: '12:00', end: '20:00' }]),
            ...weekdays([6, 0], [{ start: '10:00', end: '14:00' }]),
          ],
        },
      ],
    },
  ];
  const marta = await Doctor.create(doctorDocs[0]);
  for (const d of doctorDocs.slice(1)) await Doctor.create(d);

  // Conta ATIVA para a demo (login como médico ao vivo)
  const martaEmail = 'marta.fonseca@demo.cdc';
  await User.create({
    name: marta.name,
    email: martaEmail,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
    role: 'doctor',
    status: 'active',
    doctorId: marta._id,
    clinicIds: [],
  });

  // --- 4. Pacientes ----------------------------------------------------------
  console.log('· Pacientes…');
  const patientData: {
    name: string;
    birth: string;
    phone: string;
    email?: string | null;
  }[] = [
    {
      name: 'Beatriz Carvalho',
      birth: '1988-04-12',
      phone: '+351912345671',
      email: demoEmail,
    },
    { name: 'António Meireles', birth: '1957-11-03', phone: '+351913345672' },
    {
      name: 'Carla Susana Rodrigues',
      birth: '1979-06-25',
      phone: '+351934345673',
    },
    { name: 'João Pedro Ferro', birth: '1995-02-17', phone: '+351915345674' },
    {
      name: 'Maria Helena Duarte',
      birth: '1948-09-30',
      phone: '+351926345675',
    },
    {
      name: 'Tiago Filipe Baptista',
      birth: '2001-12-08',
      phone: '+351917345676',
    },
    { name: 'Inês Salgueiro', birth: '1992-07-19', phone: '+351938345677' },
    { name: 'Rodrigo Paiva', birth: '2016-03-22', phone: '+351919345678' },
  ];
  const now = new Date();
  const patients = [];
  for (let i = 0; i < patientData.length; i++) {
    const p = patientData[i];
    patients.push(
      await Patient.create({
        processNumber: i + 1,
        name: p.name,
        birthDate: new Date(`${p.birth}T12:00:00Z`),
        phone: p.phone,
        email: p.email ?? null,
        nif: makeValidNif(i + 1),
        preferredChannel: 'whatsapp',
        status: 'active',
        consents: {
          dataProcessingAt: now,
          remindersAt: now,
          marketingAt: i % 2 === 0 ? now : null,
        },
      }),
    );
  }
  const [beatriz, antonio, carla, joaoPedro, mariaHelena, tiago, ines] =
    patients;

  // --- 5. Paciente "rico": António Meireles ---------------------------------
  console.log('· Ficha clínica rica (António Meireles)…');
  await ClinicalRecord.create({
    patientId: antonio._id,
    allergies: ['Penicilina'],
    currentMedications: ['Varfarina 5mg'],
    systemicConditions: [
      { condition: 'hipertensao', detail: 'Controlada com medicação' },
      { condition: 'anticoagulantes', detail: 'Varfarina — INR mensal' },
    ],
    smoker: false,
    anamnesisNotes: 'Consultar médico assistente antes de cirurgias.',
    anamnesisUpdatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    anamnesisUpdatedBy: marta._id,
    notes: [
      {
        doctorId: marta._id,
        appointmentId: null,
        text: 'Sensibilidade generalizada ao frio. Recomendada pasta dessensibilizante.',
        createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      },
    ],
  });
  await Odontogram.create({
    patientId: antonio._id,
    version: 1,
    updatedBy: marta._id,
    appointmentId: null,
    teeth: [
      {
        number: '16',
        status: 'present',
        faces: [{ face: 'O', condition: 'caries' }],
        note: null,
      },
      {
        number: '26',
        status: 'present',
        faces: [{ face: 'O', condition: 'restoration' }],
        note: null,
      },
      { number: '18', status: 'missing', faces: [], note: null },
    ],
    createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000),
  });
  await Odontogram.create({
    patientId: antonio._id,
    version: 2,
    updatedBy: marta._id,
    appointmentId: null,
    teeth: [
      {
        number: '16',
        status: 'present',
        faces: [{ face: 'O', condition: 'restoration' }],
        note: 'Restaurado em fase 1 do plano',
      },
      {
        number: '26',
        status: 'present',
        faces: [{ face: 'O', condition: 'restoration' }],
        note: null,
      },
      { number: '18', status: 'missing', faces: [], note: null },
      {
        number: '36',
        status: 'to-extract',
        faces: [],
        note: 'Resto radicular — extração planeada',
      },
    ],
    createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
  });

  // Plano aprovado: fase 1 executada, fase 2 por executar
  const restauro = byName(/restaura|bonding/i);
  const extracao = byName(/extra[çc][ãa]o|exodontia/i);
  const commissionOf = (treatmentTypeId: unknown, priceCents: number) => {
    const rate = resolveCommissionRate({
      overrides: [],
      doctorRate: null,
      clinicDefault: colombo.defaultDoctorCommission,
      treatmentTypeId,
    });
    return { rate, cents: commissionCentsOf(priceCents, rate) };
  };
  const c1 = commissionOf(restauro._id, restauro.priceCents);
  const procFase1 = await Procedure.create({
    clinicId: colombo._id,
    patientId: antonio._id,
    doctorId: marta._id,
    treatmentTypeId: restauro._id,
    appointmentId: null,
    status: 'completed',
    nameSnapshot: restauro.name,
    priceCents: restauro.priceCents,
    commissionRate: c1.rate,
    commissionCents: c1.cents,
    toothNumbers: ['16'],
    notes: 'Fase 1 do plano',
    executedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
  });
  const c2 = commissionOf(extracao._id, extracao.priceCents);
  const procFase2 = await Procedure.create({
    clinicId: colombo._id,
    patientId: antonio._id,
    doctorId: marta._id,
    treatmentTypeId: extracao._id,
    appointmentId: null,
    status: 'planned',
    nameSnapshot: extracao.name,
    priceCents: extracao.priceCents,
    commissionRate: c2.rate,
    commissionCents: c2.cents,
    toothNumbers: ['36'],
    notes: null,
    executedAt: null,
  });
  const plan = await TreatmentPlan.create({
    clinicId: colombo._id,
    patientId: antonio._id,
    doctorId: marta._id,
    title: 'Reabilitação — restauro 16 e extração 36',
    status: 'in-progress',
    items: [
      {
        treatmentTypeId: restauro._id,
        nameSnapshot: restauro.name,
        priceCents: restauro.priceCents,
        toothNumbers: ['16'],
        phase: 1,
        procedureId: procFase1._id,
      },
      {
        treatmentTypeId: extracao._id,
        nameSnapshot: extracao.name,
        priceCents: extracao.priceCents,
        toothNumbers: ['36'],
        phase: 2,
        procedureId: procFase2._id,
      },
    ],
    totalCents: restauro.priceCents + extracao.priceCents,
    discountCents: 0,
    proposedAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
    validUntil: new Date(Date.now() + 46 * 24 * 3600 * 1000),
    approvedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    approvedVia: 'in-person',
  });
  await Procedure.updateMany(
    { _id: { $in: [procFase1._id, procFase2._id] } },
    { $set: { treatmentPlanId: plan._id } },
  );

  // --- 6. O dia de HOJE no Colombo -------------------------------------------
  console.log('· Marcações de hoje (estados relativos à hora atual)…');
  const today = todayLisbon();
  const nowMin = utcNowLisbonMin();
  const consulta = byName(/avalia|check-?up|consulta/i);
  const limpeza = byName(/destartariza|limpeza|higien/i);

  // Slots da Dra. Marta (dentro de 09-13/14-19) + 2 do Dr. Miguel (12-20)
  const martaSlots = [
    9 * 60 + 30,
    10 * 60 + 30,
    11 * 60 + 30,
    14 * 60 + 30,
    15 * 60 + 30,
    16 * 60 + 30,
    17 * 60 + 30,
  ];
  const plans = assignStatuses(martaSlots, nowMin);

  const dayPatients = [
    beatriz,
    carla,
    joaoPedro,
    mariaHelena,
    tiago,
    ines,
    antonio,
  ];
  const createdAppointments: {
    id: mongoose.Types.ObjectId;
    plan: SlotPlan;
    patient: (typeof patients)[number];
  }[] = [];

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const patient = dayPatients[i % dayPatients.length];
    const treatment = i % 2 === 0 ? consulta : limpeza;
    const startAt = lisbonToUtc(today, p.startMin);
    const endAt = new Date(
      startAt.getTime() +
        (treatment.durationMin + (treatment.bufferMin ?? 0)) * 60_000,
    );

    const timestamps: Record<string, Date | null> = {};
    const t0 = new Date(startAt.getTime() - 24 * 3600 * 1000);
    if (
      [
        'completed',
        'no-show',
        'in-progress',
        'checked-in',
        'confirmed',
      ].includes(p.status)
    ) {
      timestamps.confirmedAt = t0;
    }
    if (['completed', 'in-progress', 'checked-in'].includes(p.status)) {
      timestamps.checkedInAt = new Date(startAt.getTime() - 10 * 60_000);
    }
    if (['completed', 'in-progress'].includes(p.status)) {
      timestamps.startedAt = startAt;
    }
    if (p.status === 'completed') timestamps.completedAt = endAt;

    const appt = await Appointment.create({
      clinicId: colombo._id,
      patientId: patient._id,
      doctorId: marta._id,
      treatmentTypeId: treatment._id,
      startAt,
      endAt,
      status: p.status,
      channel: 'front-desk',
      createdByUserId: admin._id,
      note: i === 3 ? 'Paciente pede RX recente' : null,
      ...timestamps,
    });
    createdAppointments.push({ id: appt._id, plan: p, patient });
  }

  // --- 7. Atos das concluídas → fila de cobrança + 1 cobrança feita ----------
  console.log('· Atos executados + cobrança…');
  const completedAppts = createdAppointments.filter(
    a => a.plan.status === 'completed',
  );
  const billable: mongoose.Types.ObjectId[] = [];
  for (const [idx, a] of completedAppts.entries()) {
    const treatment = idx % 2 === 0 ? limpeza : restauro;
    const cc = commissionOf(treatment._id, treatment.priceCents);
    const proc = await Procedure.create({
      clinicId: colombo._id,
      patientId: a.patient._id,
      doctorId: marta._id,
      treatmentTypeId: treatment._id,
      appointmentId: a.id,
      status: 'completed',
      nameSnapshot: treatment.name,
      priceCents: treatment.priceCents,
      commissionRate: cc.rate,
      commissionCents: cc.cents,
      toothNumbers: idx % 2 === 0 ? [] : ['21'],
      notes: null,
      executedAt: lisbonToUtc(today, a.plan.startMin + 30),
    });
    billable.push(proc._id);
  }

  // A 1ª concluída fica JÁ COBRADA (lista "Cobranças de hoje"); as restantes
  // ficam na fila (o momento "Cobrar" da demo)
  if (billable.length > 0) {
    const first = await Procedure.findById(billable[0]);
    if (first) {
      const inv = await Invoice.create({
        clinicId: colombo._id,
        patientId: first.patientId,
        status: 'awaiting-emission',
        lines: [
          {
            procedureId: first._id,
            description: first.nameSnapshot,
            priceCents: first.priceCents,
          },
        ],
        totalCents: first.priceCents,
        paymentMethod: 'card',
        paidAt: new Date(),
        nifSnapshot: null,
        issuedByUserId: admin._id,
      });
      first.set('status', 'invoiced');
      first.set('invoiceId', inv._id);
      await first.save();
    }
  }

  // --- Resumo ---------------------------------------------------------------
  console.log('───────────────────────────────────────────────');
  console.log('✓ Seed de demonstração concluído.');
  console.log('');
  console.log('  LOGIN DA DEMO (área clínica):');
  console.log(`    email:    ${martaEmail}`);
  console.log(`    password: ${DEMO_PASSWORD}`);
  console.log('');
  console.log(
    `  Profissionais: 4 · Pacientes: 8 · Marcações hoje: ${createdAppointments.length}`,
  );
  console.log(
    '  Paciente "rico": António Meireles (alergias, odontograma v1+v2, plano em execução)',
  );
  if (demoEmail) {
    console.log(`  Email de teste (Beatriz Carvalho): ${demoEmail}`);
  } else {
    console.log(
      '  Dica: SEED_DEMO_EMAIL=teu@email.com para testares a confirmação de marcação',
    );
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Seed de demo falhou:', err);
  process.exit(1);
});
