// 📄 scripts/seed-stock-locations.ts
// =============================================================================
// CDC Manager — Seed dos LOCAIS de stock (set/2026, pedido da Isabel)
// -----------------------------------------------------------------------------
// Cria, de forma IDEMPOTENTE (upsert por {clinicId, name}), a estrutura
// física de cada clínica decidida com o Orlando/Isabel em set/2026:
//   Colombo  → Armazém Geral (central) + Gabinete 1..5 (rotativos) +
//              Esterilização + Sala de RX + Receção + Casas de banho
//   Buraca   → Armazém Geral (central) + Gabinete 1 (1 médico) +
//              Esterilização + Receção + Casas de banho
// Migra também os armazéns legado (isDefault sem `kind`) para 'central'.
// Nunca apaga nem renomeia nada: locais extra criados no painel ficam.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/seed-stock-locations.ts --dry-run
//   npx tsx --env-file=.env.local scripts/seed-stock-locations.ts
// =============================================================================

import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import Clinic from '@/models/Clinic';
import Warehouse from '@/models/Warehouse';
import type { WarehouseKind } from '@/lib/domain';

type Spec = {
  name: string;
  kind: WarehouseKind;
  sortOrder: number;
  description?: string;
};

const COMMON: Spec[] = [
  { name: 'Esterilização', kind: 'sterilization', sortOrder: 20 },
  { name: 'Receção', kind: 'reception', sortOrder: 30 },
  {
    name: 'Casas de banho',
    kind: 'services',
    sortOrder: 40,
    description: 'WC pacientes e staff — consumíveis de higiene',
  },
];

const BY_SLUG: Record<string, Spec[]> = {
  colombo: [
    ...[1, 2, 3, 4, 5].map(n => ({
      name: `Gabinete ${n}`,
      kind: 'operatory' as const,
      sortOrder: n,
    })),
    { name: 'Sala de RX', kind: 'xray', sortOrder: 10 },
    ...COMMON,
  ],
  buraca: [{ name: 'Gabinete 1', kind: 'operatory', sortOrder: 1 }, ...COMMON],
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await dbConnect();

  // 1. Legado → kind 'central'
  const migrated = dryRun
    ? await Warehouse.countDocuments({
        isDefault: true,
        kind: { $ne: 'central' },
      })
    : (
        await Warehouse.updateMany(
          { isDefault: true, kind: { $ne: 'central' } },
          { $set: { kind: 'central', sortOrder: 0 } },
        )
      ).modifiedCount;
  console.log(
    `${dryRun ? '[dry-run] ' : ''}armazéns centrais migrados: ${migrated}`,
  );

  const clinics = await Clinic.find({}).select('slug name').lean();
  for (const clinic of clinics) {
    const specs = BY_SLUG[clinic.slug];
    if (!specs) {
      console.log(
        `· ${clinic.name} (${clinic.slug}): sem template de locais — ignorada`,
      );
      continue;
    }
    // Garantir central
    const central = await Warehouse.findOne({
      clinicId: clinic._id,
      isDefault: true,
    }).lean();
    if (!central) {
      console.log(
        `· ${clinic.name}: sem armazém central — ${dryRun ? 'seria criado' : 'a criar'}`,
      );
      if (!dryRun) {
        await Warehouse.create({
          clinicId: clinic._id,
          name: 'Armazém Geral',
          kind: 'central',
          isDefault: true,
          active: true,
          sortOrder: 0,
        });
      }
    }
    let created = 0;
    for (const s of specs) {
      const exists = await Warehouse.exists({
        clinicId: clinic._id,
        name: s.name,
      });
      if (exists) continue;
      created++;
      if (!dryRun) {
        await Warehouse.create({
          clinicId: clinic._id,
          name: s.name,
          kind: s.kind,
          sortOrder: s.sortOrder,
          description: s.description ?? null,
          isDefault: false,
          active: true,
        });
      }
    }
    console.log(
      `· ${clinic.name}: ${created} local(is) ${dryRun ? 'a criar' : 'criado(s)'} (${specs.length} no template)`,
    );
  }

  await mongoose.disconnect();
  console.log(
    dryRun ? '✔ dry-run concluído (nada escrito)' : '✔ locais de stock prontos',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
