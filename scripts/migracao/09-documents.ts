// 📄 scripts/migracao/09-documents.ts
// =============================================================================
// Passo 9 — documents (BLOB) + documentspac → Cloudinary + Document
//
// · documentspac liga (Pac, ItemNumber, FileName) ao ficheiro em documents
//   (FileName). ItemNumber: 3 = FICHA NOVA (ficha de paciente digitalizada),
//   4 = RGPD (consentimento) — categoria 'consent'; resto → 'other'.
// · Cada BLOB sobe para o Cloudinary com publicId
//   `cdc/legacy/patients/<PMecano>/<slug-do-ficheiro>` (idempotente: se o
//   asset já existe e há Document com esse publicId, salta).
// · legacyId = `documents:<FileName>` (FileName é único na tabela documents).
// · Lento (2.2 GB) — corre com --limit primeiro; pode ser interrompido e
//   retomado (salta o que já existe).
// · Opcional: --since AAAA-MM-DD só migra DatePost >= data.
// =============================================================================

import { runScript, q, str, lisbonDate, log, progress, loadLegacyMap, loadRefs } from './lib/common';
import { uploadBuffer, existsInCloudinary, extOf, resourceTypeFor, withRetry } from './lib/cloud';

type Meta = { FileName: string; FileSize: number; FileEspec: number; FileType: string; DatePost: string; OperatorPost: number };
type Pac = { Espec: number; Pac: number; ItemNumber: number; FileName: string; SharePac: string; SharePacName: string | null; SharePacObs: string | null };

const ITEM_LABEL: Record<number, string> = { 3: 'Ficha de paciente (Dentoral)', 4: 'Consentimento RGPD (Dentoral)' };

function slugFile(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ficheiro';
}

void runScript('09-documents', async args => {
  const { Document, Patient } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const have = await loadLegacyMap(Document); // legacyId → _id
  const t0 = Date.now();

  const pacRows = await q<Pac>('SELECT Espec, Pac, ItemNumber, CONVERT(FileName USING latin1) AS FileName, SharePac, CONVERT(SharePacName USING latin1) AS SharePacName, CONVERT(SharePacObs USING latin1) AS SharePacObs FROM documentspac');
  const byFile = new Map<string, Pac>();
  for (const p of pacRows) byFile.set(p.FileName, p);
  log(`documentspac: ${pacRows.length} ligações`);

  const where = args.since ? 'WHERE DatePost >= ?' : '';
  const metas = await q<Meta>(`SELECT CONVERT(FileName USING latin1) AS FileName, FileSize, FileEspec, FileType, DatePost, OperatorPost FROM documents ${where} ORDER BY DatePost, FileName`, args.since ? [args.since] : []);
  log(`documents: ${metas.length} ficheiros`);

  let done = 0, uploaded = 0, skipped = 0, noPatient = 0, failed = 0;
  for (const m of metas) {
    if (done >= args.limit) break;
    done++;
    const legacyId = `documents:${m.FileName}`;
    if (have.has(legacyId)) { skipped++; continue; }
    const link = byFile.get(m.FileName);
    const pac = link ? Number(link.Pac) : 0;
    const patientId = pac ? patientMap.get(`dentoral:${pac}`) : null;
    if (!patientId) { noPatient++; continue; }

    const ext = extOf(m.FileName, m.FileType);
    const publicId = `cdc/legacy/patients/${pac}/${slugFile(m.FileName)}`;
    const resourceType = resourceTypeFor(ext);
    const category = link && Number(link.ItemNumber) === 4 ? 'consent' : 'other';
    const title = (link ? ITEM_LABEL[Number(link.ItemNumber)] : null) ?? str(m.FileName, 160) ?? 'Documento Dentoral';
    const note = [link?.SharePacName ? `Partilhado: ${str(link.SharePacName, 60)}` : null, str(link?.SharePacObs ?? null, 200)].filter(Boolean).join(' · ').slice(0, 300) || null;

    if (args.dryRun) { progress('documents', done, metas.length, t0); continue; }
    try {
      let up: { publicId: string; resourceType: 'image' | 'raw'; format: string | null; bytes: number };
      if (await existsInCloudinary(publicId, resourceType)) {
        up = { publicId, resourceType, format: ext, bytes: Number(m.FileSize) || 0 };
      } else {
        const [row] = await q<{ Document: Buffer | null }>('SELECT Document FROM documents WHERE FileName = ? LIMIT 1', [m.FileName]);
        if (!row?.Document?.length) { failed++; log(`BLOB vazio: ${m.FileName}`); continue; }
        up = await withRetry(() => uploadBuffer(row.Document!, publicId, ext));
        uploaded++;
      }
      await Document.updateOne(
        { publicId: up.publicId },
        { $setOnInsert: {
            legacyId, patientId, category, title, publicId: up.publicId, resourceType: up.resourceType, format: up.format, bytes: up.bytes,
            visibleToPatient: false, uploadedByUserId: refs.systemUserId, appointmentId: null, note, voidedAt: null, voidedByUserId: null, voidReason: null,
            legacyData: { fileEspec: m.FileEspec, fileType: m.FileType, operatorPost: m.OperatorPost, itemNumber: link?.ItemNumber ?? null, espec: link?.Espec ?? null, sharePac: link?.SharePac ?? null },
            createdAt: lisbonDate(m.DatePost) ?? new Date(), updatedAt: lisbonDate(m.DatePost) ?? new Date(),
        } },
        { upsert: true, timestamps: false },
      );
      have.set(legacyId, up as any);
    } catch (e: any) {
      failed++;
      log(`ERRO ${m.FileName}: ${e?.message ?? e}`);
    }
    progress('documents', done, metas.length, t0);
  }
  console.log();
  log('documents → cloudinary + documents', { lidos: done, enviados: uploaded, jaExistiam: skipped, semPaciente: noPatient, falhas: failed });
});
