// 📄 scripts/migracao/09b-check-documents.ts
// =============================================================================
// Passo 9b — verifica os documentos migrados: o MD5 guardado em
// legacyData.md5 tem de existir entre os BLOBs do MySQL com EXATAMENTE o
// mesmo nome (BINARY). Os que não batem (apanhados com comparação frouxa na
// 1.ª ronda) são apagados do Mongo e do Cloudinary para o 09 os refazer.
// --dry-run só lista.
// =============================================================================

import { v2 as cloudinary } from 'cloudinary';
import { runScript, q, log, progress } from './lib/common';
import { ensureCloudinary } from './lib/cloud';

void runScript('09b-check-documents', async args => {
  const { Document } = await import('@/models');
  ensureCloudinary();
  const docs = await Document.find({ legacyId: /^documents:/ }, { legacyId: 1, publicId: 1, resourceType: 1, legacyData: 1 }).lean();
  log(`documentos migrados: ${docs.length}`);
  const md5ByName = new Map<string, Set<string>>();
  const names = [...new Set(docs.map(d => String((d as any).legacyData?.fileName ?? '')))].filter(Boolean);
  const t0 = Date.now();
  for (let i = 0; i < names.length; i += 200) {
    const slice = names.slice(i, i + 200);
    const rows = await q<{ FileName: string; md5: string }>('SELECT CONVERT(FileName USING latin1) AS FileName, MD5(Document) AS md5 FROM documents WHERE BINARY FileName IN (?)', [slice]);
    for (const r of rows) (md5ByName.get(r.FileName) ?? md5ByName.set(r.FileName, new Set()).get(r.FileName)!).add(r.md5);
    progress('md5', Math.min(i + 200, names.length), names.length, t0);
  }
  console.log();
  const bad = docs.filter(d => { const ld = (d as any).legacyData ?? {}; const set = md5ByName.get(String(ld.fileName)); return !set || !set.has(String(ld.md5)); });
  log(`documentos com conteúdo errado: ${bad.length}`, { exemplos: bad.slice(0, 5).map(d => d.legacyId) });
  if (args.dryRun || !bad.length) return;
  let removed = 0;
  for (const d of bad) {
    try { await cloudinary.uploader.destroy(String(d.publicId), { resource_type: (d as any).resourceType ?? 'image', type: 'authenticated', invalidate: true }); } catch { /* asset pode já não existir */ }
    await Document.deleteOne({ _id: d._id });
    removed++;
    progress('a remover', removed, bad.length, t0);
  }
  console.log();
  log(`removidos ${removed} — corre agora o 09 outra vez para os refazer`);
});
