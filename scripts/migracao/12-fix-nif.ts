// 📄 scripts/migracao/12-fix-nif.ts
// =============================================================================
// Passo 12 — limpa NIFs inválidos nos pacientes migrados (sem repetir o 03).
// Anula: placeholders do Dentoral (999999990 "consumidor final", dígitos
// repetidos, 123456789) e NIFs com dígito de controlo errado. O valor original
// fica em legacyData.nifOriginal. Idempotente.
// =============================================================================

import { runScript, nif, log } from './lib/common';

void runScript('12-fix-nif', async args => {
  const { Patient } = await import('@/models');
  const cursor = Patient.find({ legacyId: /^dentoral:/, nif: { $type: 'string' } }, { nif: 1 }).lean().cursor({ batchSize: 5000 });
  const ops: any[] = [];
  const reasons = new Map<string, number>();
  for await (const p of cursor) {
    const current = String(p.nif);
    if (nif(current)) continue;
    const why = current === '999999990' ? 'consumidor-final' : /^(\d)\1{8}$/.test(current) ? 'repetido' : 'digito-controlo';
    reasons.set(why, (reasons.get(why) ?? 0) + 1);
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { nif: null, 'legacyData.nifOriginal': current } } } });
  }
  log(`NIFs a anular: ${ops.length}`, Object.fromEntries(reasons));
  if (!args.dryRun) for (let i = 0; i < ops.length; i += 1000) await Patient.bulkWrite(ops.slice(i, i + 1000), { ordered: false, timestamps: false });
});
