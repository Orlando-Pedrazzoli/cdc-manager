// 📄 src/lib/seed/settings.ts
// =============================================================================
// CDC Manager — Seed: ClinicSettings + Armazém + utilizador admin (Victor)
// -----------------------------------------------------------------------------
// Idempotente: pode correr múltiplas vezes sem duplicar nada.
//   - ClinicSettings: identidade/valores base só na criação ($setOnInsert);
//     horário sempre atualizado ($set) — corrige seeds anteriores.
//   - Admin: criado a partir de SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD do
//     .env.local (credenciais NUNCA hardcoded). Se o email já existir,
//     não altera a password — apenas garante role/status.
//
// Horário real da clínica (Centro Comercial Colombo):
//   TODOS os dias, 09:00–23:00.
// =============================================================================

import bcrypt from 'bcryptjs';
import User from '@/models/User';
import ClinicSettings from '@/models/ClinicSettings';
import Warehouse from '@/models/Warehouse';

export async function seedSettings(): Promise<void> {
  // --- ClinicSettings (singleton) -------------------------------------------
  const ALL_WEEK_09_23 = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({
    weekday,
    ranges: [{ start: '09:00', end: '23:00' }],
  }));

  await ClinicSettings.updateOne(
    { key: 'main' },
    {
      $setOnInsert: {
        key: 'main',
        clinicName: 'Centro Dentário Colombo',
        legalName: 'D. Amaral — Assistência Prev. Dentária, Lda',
        maxConcurrentAppointments: 5,
        defaultDoctorCommission: 0.4,
      },
      // Em $set (não $setOnInsert) para corrigir documentos de seeds
      // anteriores; depois do arranque, o admin gere isto na UI
      $set: {
        openingHours: ALL_WEEK_09_23,
      },
    },
    { upsert: true },
  );
  console.log('✔ ClinicSettings (aberta 7 dias, 09:00–23:00)');

  // --- Armazém principal ------------------------------------------------------
  await Warehouse.updateOne(
    { name: 'Armazém Geral' },
    { $setOnInsert: { name: 'Armazém Geral', isDefault: true, active: true } },
    { upsert: true },
  );
  console.log('✔ Armazém Geral');

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
  });
  console.log(`✔ Admin criado: ${email}`);
}
