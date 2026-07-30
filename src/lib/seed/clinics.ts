// 📄 src/lib/seed/clinics.ts
// =============================================================================
// CDC Manager — Seed: Clínicas + Armazéns + utilizador admin (Victor)
// -----------------------------------------------------------------------------
// SUBSTITUI o antigo settings.ts (singleton ClinicSettings → duas Clinic).
// Idempotente: pode correr múltiplas vezes sem duplicar nada.
//
// Horários REAIS (confirmados pelo Victor, jul/2026):
//   · Colombo — Centro Dentário Colombo (CC Colombo, Lisboa)
//       Todos os dias 09:00–23:00 · 5 gabinetes rotativos
//   · Buraca — Clínica Dentária da Buraca
//       Seg–Sex 10:00–20:00 com PAUSA DE ALMOÇO 13:00–14:00
//       Sáb 09:30–13:30 · Dom encerrado · 1 gabinete
//
// Migração do seed anterior: o "Armazém Geral" do Sprint 0 foi criado SEM
// clinicId (schema antigo) — este seed ADOTA esse documento para o Colombo
// antes de fazer os upserts, para não violar o índice único {clinicId, name}
// nem deixar um documento órfão inválido.
// =============================================================================

import bcrypt from 'bcryptjs';
import User from '@/models/User';
import Clinic from '@/models/Clinic';
import Warehouse from '@/models/Warehouse';

export async function seedClinics(): Promise<void> {
  // --- Clínica 1: Centro Dentário Colombo -----------------------------------
  const COLOMBO_HOURS = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({
    weekday,
    ranges: [{ start: '09:00', end: '23:00' }],
  }));

  const colombo = await Clinic.findOneAndUpdate(
    { slug: 'colombo' },
    {
      $setOnInsert: {
        slug: 'colombo',
        name: 'Centro Dentário Colombo',
        legalName: 'D. Amaral — Assistência Prev. Dentária, Lda',
        maxConcurrentAppointments: 5,
        defaultDoctorCommission: 0.4,
        bookableOnline: true,
        isActive: true,
      },
      // Horário sempre atualizado (corrige seeds anteriores); depois do
      // arranque, o admin gere isto em /admin/configuracoes
      $set: { openingHours: COLOMBO_HOURS },
    },
    { upsert: true, returnDocument: 'after' },
  );
  console.log(
    '✔ Clínica: Centro Dentário Colombo (7 dias, 09:00–23:00, 5 gab.)',
  );

  // --- Clínica 2: Clínica Dentária da Buraca --------------------------------
  // weekday: 0=Dom … 6=Sáb (padrão JS)
  const BURACA_HOURS = [
    { weekday: 0, ranges: [] }, // Domingo — encerrado
    ...([1, 2, 3, 4, 5] as const).map(weekday => ({
      weekday,
      ranges: [
        { start: '10:00', end: '13:00' }, // manhã
        { start: '14:00', end: '20:00' }, // tarde (13–14 = almoço)
      ],
    })),
    { weekday: 6, ranges: [{ start: '09:30', end: '13:30' }] }, // Sábado
  ];

  const buraca = await Clinic.findOneAndUpdate(
    { slug: 'buraca' },
    {
      $setOnInsert: {
        slug: 'buraca',
        name: 'Clínica Dentária da Buraca',
        legalName: 'D. Amaral — Assistência Prev. Dentária, Lda',
        maxConcurrentAppointments: 1,
        // Assume o mesmo 60/40 do Colombo até o Victor confirmar
        defaultDoctorCommission: 0.4,
        bookableOnline: true,
        isActive: true,
      },
      $set: { openingHours: BURACA_HOURS },
    },
    { upsert: true, returnDocument: 'after' },
  );
  console.log(
    '✔ Clínica: Clínica Dentária da Buraca (Seg–Sex 10–20 c/ almoço 13–14, Sáb 09:30–13:30, 1 gab.)',
  );

  // --- Armazéns ---------------------------------------------------------------
  // 1. ADOÇÃO do armazém legado do Sprint 0 (criado sem clinicId): passa a
  //    pertencer ao Colombo. Tem de acontecer ANTES do upsert, senão o índice
  //    único {clinicId, name} deixaria coexistir o órfão e um novo.
  await Warehouse.updateOne(
    { name: 'Armazém Geral', clinicId: { $exists: false } },
    { $set: { clinicId: colombo._id } },
  );

  // 2. Upsert dos defaults de cada clínica
  await Warehouse.updateOne(
    { clinicId: colombo._id, name: 'Armazém Geral' },
    {
      $setOnInsert: {
        clinicId: colombo._id,
        name: 'Armazém Geral',
        isDefault: true,
        active: true,
      },
    },
    { upsert: true },
  );
  await Warehouse.updateOne(
    { clinicId: buraca._id, name: 'Armazém Geral' },
    {
      $setOnInsert: {
        clinicId: buraca._id,
        name: 'Armazém Geral',
        isDefault: true,
        active: true,
      },
    },
    { upsert: true },
  );
  console.log(
    '✔ Armazéns Gerais (Colombo + Buraca; legado adotado pelo Colombo)',
  );

  // --- Admin inicial (Victor) -------------------------------------------------
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Define SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env.local antes de correr o seed.',
    );
  }
  if (password.length < 10) {
    throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 10 caracteres.');
  }

  const existing = await User.findOne({ email });
  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      { $set: { role: 'admin', status: 'active' } },
    );
    console.log(`✔ Admin já existia (${email}) — role/status garantidos`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    name: 'Victor Ruiz',
    email,
    passwordHash,
    role: 'admin',
    status: 'active',
    clinicIds: [], // admin vê tudo (campo ignorado para este role)
  });
  console.log(`✔ Admin criado: ${email}`);
}
