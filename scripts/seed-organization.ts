// 📄 scripts/seed-organization.ts
// =============================================================================
// CDC Manager — Cria o registo Organization (e as cores/nomes curtos das
// clínicas históricas) numa base existente, SEM correr o seed completo.
// Seguro em produção: idempotente, nunca sobrescreve edições do admin.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/seed-organization.ts
//   MONGODB_URI="mongodb+srv://..." npx tsx scripts/seed-organization.ts
//
// Alternativa sem script: Configurações → Organização → "Gravar organização"
// (o formulário já vem preenchido com os defaults).
// =============================================================================

import mongoose from 'mongoose';
import { seedOrganization } from '../src/lib/seed/organization';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error('MONGODB_URI não definida (usa --env-file ou a env).');
  await mongoose.connect(uri);
  await seedOrganization();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
