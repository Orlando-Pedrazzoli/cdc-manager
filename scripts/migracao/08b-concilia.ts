// 📄 scripts/migracao/08b-concilia.ts
// =============================================================================
// Passo 8b — ccconcilia → LegacyInvoice.relatedLegacyIds
//
// Esquema real (6 nov 2026): DocTipo, DocNum, RelacionaTipo, RelacionaDoc,
// RefClinica — sem Terc. Resolve-se o paciente pelo índice (docTypeCode, number)
// das faturas já migradas e liga-se nos dois sentidos. Idempotente ($addToSet).
// Correr depois do 08.
// =============================================================================

import { runScript, q, log, progress } from './lib/common';

void runScript('08b-concilia', async args => {
  const { LegacyInvoice } = await import('@/models');
  const byTypeNum = new Map<string, string>(); // `${tipo}-${num}` → legacyId
  const cursor = LegacyInvoice.find({}, { docTypeCode: 1, number: 1, legacyId: 1 }).lean().cursor({ batchSize: 5000 });
  for await (const inv of cursor) byTypeNum.set(`${inv.docTypeCode}-${inv.number}`, String(inv.legacyId));
  log(`faturas indexadas: ${byTypeNum.size}`);

  const rows = await q<{ DocTipo: number; DocNum: number; RelacionaTipo: number; RelacionaDoc: number }>('SELECT DocTipo, DocNum, RelacionaTipo, RelacionaDoc FROM ccconcilia');
  const ops: any[] = [];
  let unresolved = 0;
  for (const r of rows) {
    const a = byTypeNum.get(`${Number(r.DocTipo)}-${Number(r.DocNum)}`);
    const b = byTypeNum.get(`${Number(r.RelacionaTipo)}-${Number(r.RelacionaDoc)}`);
    if (!a || !b) { unresolved++; continue; }
    ops.push({ updateOne: { filter: { legacyId: a }, update: { $addToSet: { relatedLegacyIds: b } } } });
    ops.push({ updateOne: { filter: { legacyId: b }, update: { $addToSet: { relatedLegacyIds: a } } } });
  }
  log(`ccconcilia: ${rows.length} linhas → ${ops.length / 2} ligações (não resolvidas: ${unresolved})`);
  if (!args.dryRun) {
    const t0 = Date.now();
    for (let i = 0; i < ops.length; i += 1000) {
      await LegacyInvoice.bulkWrite(ops.slice(i, i + 1000), { ordered: false, timestamps: false });
      progress('ligações', Math.min(i + 1000, ops.length), ops.length, t0);
    }
    console.log();
  }
});
