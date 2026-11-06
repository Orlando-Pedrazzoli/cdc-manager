// 📄 scripts/migracao/00-setup.ts
// =============================================================================
// Passo 0 — verifica ligações e cria as referências fixas que os outros
// scripts precisam:
//   · User de sistema "Migração Dentoral" (admin, disabled) — uploadedByUserId
//   · Doctor placeholder "Médico não identificado (Dentoral)" — tratexec.Clinico=0
//     e códigos de médico inexistentes
//   · TreatmentType "Consulta (histórico Dentoral)" — a agenda do Dentoral
//     não tem ato associado e Appointment.treatmentTypeId é obrigatório
//   · TreatmentType "Orçamento livre (Dentoral)" — orclivre
// Idempotente: pode correr-se as vezes que for preciso.
// =============================================================================

import { runScript, q, log, SYSTEM_USER_EMAIL, PLACEHOLDER_DOCTOR_LEGACY, LEGACY_APPOINTMENT_TT_CODE, LEGACY_FREE_BUDGET_TT_CODE } from './lib/common';

await runScript('00-setup', async args => {
  const { Clinic, User, Doctor, TreatmentType } = await import('@/models');

  // --- MySQL ----------------------------------------------------------------
  const [v] = await q<{ v: string }>('SELECT VERSION() AS v');
  const counts = await q<{ t: string; n: number }>(`
    SELECT 'paciente' t, COUNT(*) n FROM paciente UNION ALL
    SELECT 'medicos', COUNT(*) FROM medicos UNION ALL
    SELECT 'tabelat', COUNT(*) FROM tabelat UNION ALL
    SELECT 'agenda_com_pac', COUNT(*) FROM agenda WHERE Mecano > 0 UNION ALL
    SELECT 'faltas', COUNT(*) FROM faltas UNION ALL
    SELECT 'tratexec_atos', COUNT(*) FROM tratexec WHERE Inicial = 'Não' UNION ALL
    SELECT 'planotrat', COUNT(*) FROM planotrat UNION ALL
    SELECT 'obsger', COUNT(*) FROM obsger UNION ALL
    SELECT 'ccorrentes', COUNT(*) FROM ccorrentes UNION ALL
    SELECT 'doclin', COUNT(*) FROM doclin UNION ALL
    SELECT 'documents', COUNT(*) FROM documents`);
  log(`MySQL ${v.v} OK`);
  for (const c of counts) log(`  drdata.${c.t}`, { linhas: Number(c.n) });

  // --- Mongo ------------------------------------------------------------------
  const clinic = await Clinic.findOne({ slug: 'colombo' });
  if (!clinic) throw new Error("Clínica 'colombo' não existe no CDC — correr o seed da app primeiro");
  log(`Clinic colombo: ${clinic._id}`);

  if (args.dryRun) {
    log('dry-run: não cria referências');
    return;
  }

  // User de sistema (nunca faz login: status disabled, sem passwordHash)
  const user = await User.findOneAndUpdate(
    { email: SYSTEM_USER_EMAIL },
    {
      $setOnInsert: {
        name: 'Migração Dentoral',
        email: SYSTEM_USER_EMAIL,
        role: 'admin',
        status: 'disabled',
        clinicIds: [clinic._id],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  log(`User sistema: ${user._id}`);

  const doctor = await Doctor.findOneAndUpdate(
    { legacyId: PLACEHOLDER_DOCTOR_LEGACY },
    {
      $setOnInsert: {
        name: 'Médico não identificado (Dentoral)',
        specialties: ['dentisteria'],
        clinicSchedules: [],
        exceptions: [],
        active: false,
        color: '#9CA3AF',
        legacyId: PLACEHOLDER_DOCTOR_LEGACY,
        legacyData: { note: 'Placeholder para tratexec.Clinico = 0 e códigos inexistentes' },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  log(`Doctor placeholder: ${doctor._id}`);

  const tt = await TreatmentType.findOneAndUpdate(
    { dentoralCode: LEGACY_APPOINTMENT_TT_CODE },
    {
      $setOnInsert: {
        slug: 'consulta-historico-dentoral',
        name: 'Consulta (histórico Dentoral)',
        specialty: 'dentisteria',
        dentoralCode: LEGACY_APPOINTMENT_TT_CODE,
        category: 'CONSULTAS',
        durationMin: 30,
        bufferMin: 0,
        bookableOnline: false,
        requiresEvaluation: false,
        priceCents: 0,
        costCents: 0,
        source: 'imported',
        notes: 'Tipo genérico das marcações migradas do Dentoral (a agenda antiga não registava o ato).',
        active: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  log(`TreatmentType agenda legacy: ${tt._id}`);

  const tt2 = await TreatmentType.findOneAndUpdate(
    { dentoralCode: LEGACY_FREE_BUDGET_TT_CODE },
    {
      $setOnInsert: {
        slug: 'orcamento-livre-dentoral',
        name: 'Orçamento livre (Dentoral)',
        specialty: 'dentisteria',
        dentoralCode: LEGACY_FREE_BUDGET_TT_CODE,
        category: 'CONSULTAS',
        durationMin: 30,
        bufferMin: 0,
        bookableOnline: false,
        requiresEvaluation: false,
        priceCents: 0,
        costCents: 0,
        source: 'imported',
        notes: 'Item genérico dos orçamentos em texto livre (orclivre) migrados do Dentoral.',
        active: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  log(`TreatmentType orçamento livre: ${tt2._id}`);
});
