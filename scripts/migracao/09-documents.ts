// 📄 scripts/migracao/09-documents.ts
// =============================================================================
// Passo 9 — documents (BLOB) + documentspac → Cloudinary + Document
//
// A tabela `documents` NÃO tem chave: a única ligação ao paciente é o FileName
// (documentspac.FileName). 10 966 ficheiros, 10 102 nomes distintos; 11 008
// ligações. Por isso o script trabalha POR NOME DE FICHEIRO (grupo):
//   · 1 BLOB ↔ 1 ligação                 → direto
//   · 1 BLOB (ou N idênticos por MD5) ↔ M → o mesmo documento para os M pacientes
//   · N BLOBs distintos ↔ N ligações     → emparelha pela ordem física
//                                           (legacyData.pairedByOrder = true)
//   · N ≠ M (ambíguo)                     → NÃO migra; sai em
//     C:\cdc\inventario\documentos-ambiguos.csv para classificar à mão no Dentoral
// Categoria: documentspac.ItemNumber 4 = RGPD → 'consent'; 3 = FICHA NOVA e
// restantes → 'other' (docitems: 1 fichas anteriores, 2 ficha antiga).
// Cloudinary: `{CLOUDINARY_FOLDER}/pacientes/<documentId>` (type authenticated),
// como a app. legacyId = documents:<FileName>:<Pac>:<k>. Idempotente/retomável.
// Flags: --limit N (grupos) · --since AAAA-MM-DD (DatePost) · --dry-run
// =============================================================================

import { writeFileSync } from 'node:fs';
import { Types } from 'mongoose';
import { runScript, q, str, lisbonDate, log, progress, loadLegacyMap, loadRefs } from './lib/common';
import { uploadBuffer, extOf, withRetry, errMsg, ROOT_FOLDER } from './lib/cloud';

type Meta = { FileName: string; FileSize: number; FileType: string; DatePost: string; OperatorPost: number; md5: string };
type Blob = Meta & { Document: Buffer | null };
type Link = { Espec: number; Pac: number; ItemNumber: number; FileName: string; SharePac: string; SharePacName: string | null; SharePacObs: string | null };

const ITEM_LABEL: Record<number, string> = { 1: 'Ficha anterior à informatização (Dentoral)', 2: 'Ficha antiga (Dentoral)', 3: 'Ficha de paciente (Dentoral)', 4: 'Consentimento RGPD (Dentoral)' };
const AMBIGUOUS_CSV = 'C:\\cdc\\inventario\\documentos-ambiguos.csv';

void runScript('09-documents', async args => {
  const { Document, Patient } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const t0 = Date.now();

  // limpeza da 1.ª tentativa (chave antiga documents:<FileName>, sem paciente/índice)
  if (!args.dryRun) {
    const old = await Document.deleteMany({ $and: [{ legacyId: /^documents:/ }, { legacyId: { $not: /:\d+:\d+$/ } }] });
    if (old.deletedCount) log(`removidos ${old.deletedCount} documentos da 1.ª tentativa (chave antiga)`);
  }
  const have = await loadLegacyMap(Document);

  const links = await q<Link>('SELECT Espec, Pac, ItemNumber, CONVERT(FileName USING latin1) AS FileName, SharePac, CONVERT(SharePacName USING latin1) AS SharePacName, CONVERT(SharePacObs USING latin1) AS SharePacObs FROM documentspac');
  const linksByName = new Map<string, Link[]>();
  for (const l of links) (linksByName.get(l.FileName) ?? linksByName.set(l.FileName, []).get(l.FileName)!).push(l);

  const where = args.since ? 'WHERE DatePost >= ?' : '';
  const metas = await q<Meta>(`SELECT CONVERT(FileName USING latin1) AS FileName, FileSize, FileType, DatePost, OperatorPost, MD5(Document) AS md5 FROM documents ${where}`, args.since ? [args.since] : []);
  const metaByName = new Map<string, Meta[]>();
  for (const m of metas) (metaByName.get(m.FileName) ?? metaByName.set(m.FileName, []).get(m.FileName)!).push(m);
  log(`documents: ${metas.length} ficheiros em ${metaByName.size} nomes · documentspac: ${links.length} ligações`);

  const stats = { grupos: 0, enviados: 0, jaExistiam: 0, semLigacao: 0, semPaciente: 0, partilhados: 0, porOrdem: 0, ambiguos: 0, falhas: 0 };
  const ambiguous: string[] = ['FileName;blobs;ligacoes;pacientes;tamanhos'];

  async function migrateOne(blobRow: Blob, link: Link, k: number, flags: Record<string, unknown>): Promise<void> {
    const pac = Number(link.Pac);
    const legacyId = `documents:${blobRow.FileName}:${pac}:${k}`;
    if (have.has(legacyId)) { stats.jaExistiam++; return; }
    const patientId = patientMap.get(`dentoral:${pac}`);
    if (!patientId) { stats.semPaciente++; return; }
    if (args.dryRun) return;
    const ext = extOf(blobRow.FileName, blobRow.FileType);
    const docId = new Types.ObjectId();
    const publicId = `${ROOT_FOLDER()}/pacientes/${docId.toHexString()}`;
    const item = Number(link.ItemNumber);
    const category = item === 4 ? 'consent' : 'other';
    const title = ITEM_LABEL[item] ?? str(blobRow.FileName, 160) ?? 'Documento Dentoral';
    const note = [link.SharePacName ? `Partilhado: ${str(link.SharePacName, 60)}` : null, str(link.SharePacObs, 200)].filter(Boolean).join(' · ').slice(0, 300) || null;
    try {
      const up = await withRetry(() => uploadBuffer(blobRow.Document!, publicId, ext));
      stats.enviados++;
      const when = lisbonDate(blobRow.DatePost) ?? new Date();
      await Document.updateOne(
        { publicId: up.publicId },
        { $setOnInsert: {
            _id: docId, legacyId, patientId, category, title, publicId: up.publicId, resourceType: up.resourceType, format: up.format, bytes: up.bytes,
            visibleToPatient: false, uploadedByUserId: refs.systemUserId, appointmentId: null, note, voidedAt: null, voidedByUserId: null, voidReason: null,
            legacyData: { fileName: blobRow.FileName, fileType: blobRow.FileType, md5: blobRow.md5, operatorPost: blobRow.OperatorPost, itemNumber: item, espec: link.Espec, sharePac: link.SharePac, ...flags },
            createdAt: when, updatedAt: when,
        } },
        { upsert: true, timestamps: false },
      );
      have.set(legacyId, docId);
    } catch (e: any) {
      stats.falhas++;
      log(`ERRO ${blobRow.FileName} (pac ${pac}): ${errMsg(e)}`);
      if (/rate limit|420/i.test(errMsg(e))) throw new Error('Cloudinary em rate limit — relança mais tarde (retoma onde ficou)');
    }
  }

  const names = [...metaByName.keys()].sort();
  for (const name of names) {
    if (stats.grupos >= args.limit) break;
    stats.grupos++;
    const ms = metaByName.get(name)!;
    const ls = linksByName.get(name) ?? [];
    if (!ls.length) { stats.semLigacao++; continue; }
    const distinctMd5 = new Set(ms.map(m => m.md5));
    // salta cedo se tudo deste grupo já existe
    const pendingKeys = ls.map((l, k) => `documents:${name}:${Number(l.Pac)}:${k}`).filter(key => !have.has(key));
    if (!pendingKeys.length) { stats.jaExistiam += ls.length; progress('grupos', stats.grupos, names.length, t0); continue; }

    if (args.dryRun) {
      // só classifica, sem ler BLOBs
      if (distinctMd5.size === 1) { if (ls.length > 1) stats.partilhados += ls.length; }
      else if (ms.length === ls.length) stats.porOrdem += ms.length;
      else { stats.ambiguos += ms.length; ambiguous.push(`${name};${ms.length};${ls.length};${[...new Set(ls.map(l => l.Pac))].join(' ')};${ms.map(m => m.FileSize).join(' ')}`); }
      for (const l of ls) if (!patientMap.has(`dentoral:${Number(l.Pac)}`)) stats.semPaciente++;
      progress('grupos', stats.grupos, names.length, t0);
      continue;
    }

    if (distinctMd5.size === 1) {
      // 1 conteúdo (1 BLOB ou cópias idênticas) → todas as ligações
      const [row] = await q<Blob>('SELECT CONVERT(FileName USING latin1) AS FileName, FileSize, FileType, DatePost, OperatorPost, MD5(Document) AS md5, Document FROM documents WHERE BINARY FileName = ? LIMIT 1', [name]);
      if (!row?.Document?.length) { stats.falhas++; log(`BLOB vazio: ${name}`); continue; }
      if (ls.length > 1) stats.partilhados += ls.length;
      for (let k = 0; k < ls.length; k++) await migrateOne(row, ls[k], k, ls.length > 1 ? { sharedBlob: true } : {});
    } else if (ms.length === ls.length) {
      // N BLOBs distintos ↔ N ligações → ordem física (auditável)
      const rows = await q<Blob>('SELECT CONVERT(FileName USING latin1) AS FileName, FileSize, FileType, DatePost, OperatorPost, MD5(Document) AS md5, Document FROM documents WHERE BINARY FileName = ?', [name]);
      if (rows.length !== ls.length) {
        // MySQL (latin1) ignora maiúsculas/espaços finais — se mesmo com BINARY não bater, é ambíguo
        stats.ambiguos += rows.length;
        ambiguous.push(`${name};${rows.length};${ls.length};${[...new Set(ls.map(l => l.Pac))].join(' ')};${rows.map(m => m.FileSize).join(' ')}`);
        progress('grupos', stats.grupos, names.length, t0);
        continue;
      }
      stats.porOrdem += rows.length;
      for (let k = 0; k < rows.length; k++) await migrateOne(rows[k], ls[k], k, { pairedByOrder: true });
    } else {
      stats.ambiguos += ms.length;
      ambiguous.push(`${name};${ms.length};${ls.length};${[...new Set(ls.map(l => l.Pac))].join(' ')};${ms.map(m => m.FileSize).join(' ')}`);
    }
    progress('grupos', stats.grupos, names.length, t0);
  }
  console.log();
  if (ambiguous.length > 1) {
    try { writeFileSync(AMBIGUOUS_CSV, ambiguous.join('\n'), 'utf8'); log(`ambíguos listados em ${AMBIGUOUS_CSV}`); } catch { log('ambíguos:\n' + ambiguous.join('\n')); }
  }
  log('documents → cloudinary + documents', stats);
});
