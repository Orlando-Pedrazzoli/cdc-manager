// 📄 scripts/migracao/10-photos.ts
// =============================================================================
// Passo 10 — paciente.PFoto (BLOB) → Cloudinary → Patient.photoPublicId
//
// · publicId: `{CLOUDINARY_FOLDER}/pacientes-foto/<patientId>` (type authenticated) —
//   a mesma convenção de src/actions/patients.ts, para a app ler/substituir a foto.
// · Só pacientes migrados sem photoPublicId. Idempotente/retomável.
// · 77 220 fotos no Dentoral; por defeito só pacientes ativos nos últimos 5 anos
//   (RGPD — minimização). Flags: --since AAAA-MM-DD · --all · --limit N.
// · Deteta formato pelos magic bytes (JPEG/PNG/BMP/GIF); desconhecido → jpg.
// =============================================================================

import { runScript, q, log, progress, loadLegacyMap } from './lib/common';
import sharp from 'sharp';
import { uploadBuffer, withRetry, errMsg, ROOT_FOLDER } from './lib/cloud';

const ACTIVE_SINCE_DEFAULT = '2021-11-01';

/**
 * PFoto no Dentoral (perfil 6 nov 2026): 22 807 JPEG · 43 535 BMP completos ·
 * 10 878 BMP TRUNCADOS a 65 535 bytes (a coluna foi `blob` antes de `longblob`).
 * O BMP é guardado de baixo para cima → o que falta é a faixa de CIMA.
 * Reparação: reescreve a altura para as linhas que existem e corta o buffer;
 * depois converte tudo para JPEG (sharp) — 10× mais pequeno, upload mais rápido.
 */
async function prepare(buf: Buffer): Promise<{ data: Buffer; ext: string; repaired: boolean }> {
  if (buf[0] === 0x42 && buf[1] === 0x4d && buf.length > 54) {
    const offset = buf.readUInt32LE(10);
    const width = buf.readInt32LE(18);
    const heightRaw = buf.readInt32LE(22);
    const bpp = buf.readUInt16LE(28);
    const compression = buf.readUInt32LE(30);
    const rowSize = Math.floor((width * bpp + 31) / 32) * 4;
    const height = Math.abs(heightRaw);
    const avail = Math.min(height, Math.floor((buf.length - offset) / rowSize));
    const repaired = avail < height;
    if ((bpp === 24 || bpp === 32) && compression === 0 && width > 0 && avail > 0) {
      // descodifica BGR(A) bottom-up → RGB top-down (só as linhas que existem) e converte com sharp
      const px = bpp / 8;
      const rgb = Buffer.alloc(width * avail * 3);
      for (let y = 0; y < avail; y++) {
        const srcRow = offset + (heightRaw > 0 ? (avail - 1 - y) : y) * rowSize; // bottom-up: a linha 0 do ficheiro é a de baixo
        for (let x = 0; x < width; x++) {
          const si = srcRow + x * px, di = (y * width + x) * 3;
          rgb[di] = buf[si + 2]; rgb[di + 1] = buf[si + 1]; rgb[di + 2] = buf[si];
        }
      }
      const data = await sharp(rgb, { raw: { width, height: avail, channels: 3 } }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      return { data, ext: 'jpg', repaired };
    }
    // outros BMP (paleta/RLE): repara o cabeçalho se truncado e envia como BMP
    if (repaired && avail > 0) {
      buf = Buffer.from(buf.subarray(0, offset + avail * rowSize));
      buf.writeInt32LE(heightRaw < 0 ? -avail : avail, 22);
      buf.writeUInt32LE(buf.length, 2);
      buf.writeUInt32LE(avail * rowSize, 34);
    }
    return { data: buf, ext: 'bmp', repaired };
  }
  return { data: buf, ext: sniff(buf), repaired: false };
}

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
  // Minimização RGPD (decisão 6 nov 2026): só pacientes com atividade (consulta ou
  // ato) desde ACTIVE_SINCE — override com --since AAAA-MM-DD; --all migra todas.
  const all = process.argv.includes('--all');
  const activeSince = args.since ?? ACTIVE_SINCE_DEFAULT;
  const active = new Set<string>();
  if (!all) {
    const cut = new Date(`${activeSince}T00:00:00Z`);
    const { Appointment, Procedure } = await import('@/models');
    for (const r of await Appointment.aggregate([{ $match: { startAt: { $gte: cut }, status: { $nin: ['cancelled', 'no-show'] } } }, { $group: { _id: '$patientId' } }])) active.add(String(r._id));
    for (const r of await Procedure.aggregate([{ $match: { executedAt: { $gte: cut } } }, { $group: { _id: '$patientId' } }])) active.add(String(r._id));
    log(`pacientes com atividade desde ${activeSince}: ${active.size}`);
  }
  const idsAll = await q<{ PMecano: number }>('SELECT PMecano FROM paciente WHERE PFoto IS NOT NULL AND LENGTH(PFoto) > 0 ORDER BY PMecano');
  const ids = all ? idsAll : idsAll.filter(({ PMecano }) => { const pid = patientMap.get(`dentoral:${Number(PMecano)}`); return pid && active.has(String(pid)); });
  log(`fotos no Dentoral: ${idsAll.length} · a migrar: ${ids.length} · já com foto no CDC: ${withPhoto.size}`);
  const t0 = Date.now();
  let done = 0, uploaded = 0, skipped = 0, failed = 0, repaired = 0;
  for (const { PMecano } of ids) {
    if (done >= args.limit) break;
    done++;
    const legacyId = `dentoral:${Number(PMecano)}`;
    const patientId = patientMap.get(legacyId);
    if (!patientId || withPhoto.has(legacyId)) { skipped++; continue; }
    if (args.dryRun) { progress('fotos', done, ids.length, t0); continue; }
    const publicId = `${ROOT_FOLDER()}/pacientes-foto/${String(patientId)}`;
    try {
      // sem Admin API (limite 500/h): o upload com overwrite:false devolve o asset existente sem erro
      const [row] = await q<{ PFoto: Buffer | null }>('SELECT PFoto FROM paciente WHERE PMecano = ?', [PMecano]);
      if (!row?.PFoto?.length) { failed++; continue; }
      const img = await prepare(row.PFoto);
      if (img.repaired) repaired++;
      const up = await withRetry(() => uploadBuffer(img.data, publicId, img.ext));
      uploaded++;
      await Patient.updateOne({ _id: patientId, photoPublicId: null }, { $set: { photoPublicId: up.publicId } }, { timestamps: false });
    } catch (e: any) {
      failed++;
      log(`ERRO foto ${PMecano}: ${errMsg(e)}`);
      if (/rate limit|420/i.test(errMsg(e))) { log('Cloudinary em rate limit — a parar; relança mais tarde (retoma onde ficou)'); break; }
    }
    progress('fotos', done, ids.length, t0);
  }
  console.log();
  log('PFoto → cloudinary + patients.photoPublicId', { lidas: done, enviadas: uploaded, bmpReparados: repaired, saltadas: skipped, falhas: failed });
});
