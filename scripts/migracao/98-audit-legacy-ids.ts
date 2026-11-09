// Read-only audit of legacyId uniqueness and coverage.
// Run with: npx tsx --env-file=.env.local scripts/migracao/98-audit-legacy-ids.ts
// This script never writes to MongoDB or MySQL.

import type { Model } from 'mongoose';
import { runScript, log } from './lib/common';

void runScript('98-audit-legacy-ids', async () => {
  const M = await import('@/models');
  // Normalize model types because the imported models have different document
  // interfaces. The audit only uses generic MongoDB query/aggregation methods.
  const models: Array<[string, Model<any>]> = [
    ['Patient', M.Patient as Model<any>],
    ['Doctor', M.Doctor as Model<any>],
    ['Employee', M.Employee as Model<any>],
    ['Appointment', M.Appointment as Model<any>],
    ['Procedure', M.Procedure as Model<any>],
    ['TreatmentPlan', M.TreatmentPlan as Model<any>],
    ['Document', M.Document as Model<any>],
  ];

  let hasDuplicates = false;

  console.log('\n=== Auditoria read-only de legacyId ===');
  for (const [name, model] of models) {
    const missingFilter = {
      $or: [
        { legacyId: null },
        { legacyId: { $exists: false } },
        { legacyId: '' },
        { legacyId: { $not: { $type: 'string' } } },
      ],
    };
    const [total, withLegacyId, missing, duplicates, missingBreakdown] = await Promise.all([
      model.countDocuments({}),
      model.countDocuments({ legacyId: { $type: 'string', $ne: '' } }),
      model.countDocuments(missingFilter),
      model.aggregate([
        { $match: { legacyId: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$legacyId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      model.aggregate([
        { $match: missingFilter },
        {
          $group: {
            _id: {
              hasLegacyData: { $ne: [{ $ifNull: ['$legacyData', null] }, null] },
              createdYear: { $year: { $ifNull: ['$createdAt', new Date(0)] } },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.createdYear': 1, '_id.hasLegacyData': 1 } },
      ]),
    ]);

    if (duplicates.length > 0) hasDuplicates = true;
    console.log(
      `\n${name}: total=${total}, com legacyId=${withLegacyId}, sem legacyId=${missing}, chaves duplicadas=${duplicates.length > 0 ? 'SIM' : 'não'}`,
    );
    for (const duplicate of duplicates) {
      console.log(`  DUPLICADO count=${duplicate.count} legacyId=${String(duplicate._id)}`);
    }
    if (missingBreakdown.length > 0) {
      console.log('  Distribuição dos registros sem legacyId (ano de criação / legacyData):');
      for (const group of missingBreakdown) {
        console.log(`    ano=${group._id.createdYear}, legacyData=${group._id.hasLegacyData ? 'sim' : 'não'}, total=${group.count}`);
      }
    }
  }

  // ClinicalRecord guarda os legacyIds das notas em um array de subdocumentos.
  // A verificação é separada porque não existe uma coleção própria de notas.
  const duplicateClinicalNotes = await M.ClinicalRecord.aggregate([
    { $unwind: '$notes' },
    { $match: { 'notes.legacyId': { $type: 'string', $ne: '' } } },
    { $group: { _id: '$notes.legacyId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  if (duplicateClinicalNotes.length > 0) hasDuplicates = true;
  console.log(`\nClinicalRecord.notes: chaves duplicadas=${duplicateClinicalNotes.length > 0 ? 'SIM' : 'não'}`);
  for (const duplicate of duplicateClinicalNotes) {
    console.log(`  DUPLICADO count=${duplicate.count} legacyId=${String(duplicate._id)}`);
  }

  log('Resultado', {
    duplicatesFound: hasDuplicates,
    note: 'Amostra limitada a 10 chaves duplicadas por coleção. Nenhum dado foi alterado.',
  });
});
