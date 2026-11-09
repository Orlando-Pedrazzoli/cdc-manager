// Read-only audit of legacyId uniqueness and coverage.
// Run with: npx tsx --env-file=.env.local scripts/migracao/98-audit-legacy-ids.ts
// This script never writes to MongoDB or MySQL.

import { runScript, log } from './lib/common';

void runScript('98-audit-legacy-ids', async () => {
  const M = await import('@/models');
  const models = [
    ['Patient', M.Patient],
    ['Doctor', M.Doctor],
    ['Employee', M.Employee],
    ['Appointment', M.Appointment],
    ['Procedure', M.Procedure],
    ['TreatmentPlan', M.TreatmentPlan],
    ['Document', M.Document],
  ] as const;

  let hasDuplicates = false;

  console.log('\n=== Auditoria read-only de legacyId ===');
  for (const [name, model] of models) {
    const [total, withLegacyId, missing, duplicates] = await Promise.all([
      model.countDocuments({}),
      model.countDocuments({ legacyId: { $type: 'string', $ne: '' } }),
      model.countDocuments({
        $or: [
          { legacyId: null },
          { legacyId: { $exists: false } },
          { legacyId: '' },
          { legacyId: { $not: { $type: 'string' } } },
        ],
      }),
      model.aggregate([
        { $match: { legacyId: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$legacyId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    if (duplicates.length > 0) hasDuplicates = true;
    console.log(
      `\n${name}: total=${total}, com legacyId=${withLegacyId}, sem legacyId=${missing}, chaves duplicadas=${duplicates.length > 0 ? 'SIM' : 'não'}`,
    );
    for (const duplicate of duplicates) {
      console.log(`  DUPLICADO count=${duplicate.count} legacyId=${String(duplicate._id)}`);
    }
  }

  log('Resultado', {
    duplicatesFound: hasDuplicates,
    note: 'Amostra limitada a 10 chaves duplicadas por coleção. Nenhum dado foi alterado.',
  });
});
