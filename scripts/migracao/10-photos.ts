// 📄 scripts/migracao/10-photos.ts
// =============================================================================
// Passo 10 — paciente.PFoto (BLOB) → Cloudinary → Patient.photoPublicId
//
// · publicId: `cdc/legacy/photos/<PMecano>` (type private).
// · Só pacientes migrados sem photoPublicId. Idempotente/retomável.
// · 77 220 fotos — correr com --limit primeiro; demora.
// · Deteta formato pelos magic bytes (JPEG/PNG/BMP/GIF); desconhecido → jpg.
// =============================================================================

import { runScript, q, log, progress, loadLegacyMap } from './lib/common';
import { uploadBuffer, existsInCloudinary, withRetry } from './lib/cloud';

function sniff(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
  return 'jpg';
}

void runScript('10-photos', async args => {
  const { Patient } = await import('@/models');
  const patientMap = await loadLegacyMap(Patient);
  const withPhoto = new Set<string>((await Patient.find({ photoPublicId: { $type: 'string' } }, { legacyId: 1 }).lean()).map(p => String(p.legacyId)));
  const ids = await q<{ PMecano: number }>('SELECT PMecano FROM paciente WHERE PFoto IS NOT NULL AND LENGTH(PFoto) > 0 ORDER BY PMecano');
  log(`fotos no Dentoral: ${ids.length} · já com foto no CDC: ${withPhoto.size}`);
  const t0 = Date.now();
  let done = 0, uploaded = 0, skipped = 0, failed = 0;
  for (const { PMecano } of ids) {
    if (done >= args.limit) break;
    done++;
    const legacyId = `dentoral:${Number(PMecano)}`;
    const patientId = patientMap.get(legacyId);
    if (!patientId || withPhoto.has(legacyId)) { skipped++; continue; }
    if (args.dryRun) { progress('fotos', done, ids.length, t0); continue; }
    const publicId = `cdc/legacy/photos/${Number(PMecano)}`;
    try {
      let finalId = publicId;
      if (!(await existsInCloudinary(publicId, 'image'))) {
        const [row] = await q<{ PFoto: Buffer | null }>('SELECT PFoto FROM paciente WHERE PMecano = ?', [PMecano]);
        if (!row?.PFoto?.length) { failed++; continue; }
        const up = await withRetry(() => uploadBuffer(row.PFoto!, publicId, sniff(row.PFoto!)));
        finalId = up.publicId;
        uploaded++;
      }
      await Patient.updateOne({ _id: patientId, photoPublicId: null }, { $set: { photoPublicId: finalId } }, { timestamps: false });
    } catch (e: any) {
      failed++;
      log(`ERRO foto ${PMecano}: ${e?.message ?? e}`);
    }
    progress('fotos', done, ids.length, t0);
  }
  console.log();
  log('PFoto → cloudinary + patients.photoPublicId', { lidas: done, enviadas: uploaded, saltadas: skipped, falhas: failed });
});
