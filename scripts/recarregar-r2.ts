// 📄 scripts/recarregar-r2.ts
// =============================================================================
// Recarga do backup da Cloudinary para o Cloudflare R2 (passo 5 da migração)
// -----------------------------------------------------------------------------
// Lê o manifesto do backup (scripts/backup-cloudinary.ts, removido depois da
// migração — ver o histórico do git) e, para cada
// ficheiro:
//   1. confirma no disco o SHA-256 registado no backup (integridade)
//   2. sobe-o para a MESMA chave (= publicId gravado na BD; nada muda no Mongo)
//   3. gera as miniaturas (imagens) — como faz o registo pela app
// Retomável: o que já está no R2 com o tamanho certo e com miniaturas é
// saltado. Não lê nem escreve no MongoDB.
//
// Correr na raiz do repo (PowerShell):
//   npx tsx --env-file=.env.local scripts/recarregar-r2.ts --limit 20   ← teste
//   npx tsx --env-file=.env.local scripts/recarregar-r2.ts              ← tudo
// Flags:
//   --pasta C:\caminho   pasta do backup (por omissão C:\cdc\backup-cloudinary)
//   --paralelo N         envios em simultâneo (por omissão 6, máx. 12)
//   --limit N            só os primeiros N ficheiros (teste)
// Relatório: recarga-r2.csv na pasta do backup (um registo por ficheiro).
// =============================================================================

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  contentTypeForFormat,
  derivativeKey,
  fetchObjectInfo,
  generateDerivatives,
  putObject,
} from '@/lib/storage';

// -----------------------------------------------------------------------------
// Argumentos
// -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flagValue = (f: string): string | null => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const BACKUP_DIR =
  flagValue('--pasta') ??
  (process.platform === 'win32' ? 'C:\\cdc\\backup-cloudinary' : path.resolve('backup-cloudinary'));
const PARALLEL = Math.max(1, Math.min(12, Number(flagValue('--paralelo') ?? 6) || 6));
const LIMIT = flagValue('--limit') ? Number(flagValue('--limit')) : Infinity;
const MAX_CONSECUTIVE_FAILS = 30;

// -----------------------------------------------------------------------------
// Tipos (subconjunto do manifesto do backup)
// -----------------------------------------------------------------------------
interface ManifestItem {
  group: string;
  status: string;
  publicId: string;
  resourceType: 'image' | 'raw' | 'video';
  format: string | null;
  bytesDisk: number;
  sha256: string;
  file: string;
}

type Outcome = 'enviado' | 'ja-estava' | 'falhou';
interface Row {
  publicId: string;
  group: string;
  outcome: Outcome;
  thumbs: 'gerados' | 'copia' | 'nenhuma' | 'ja-estavam' | '';
  bytes: number;
  error: string;
}

const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString('pt-PT')}] ${msg}`);
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const errMsg = (e: unknown) => (e as Error)?.message ?? String(e);

function contentTypeFor(it: ManifestItem): string {
  const fmt = it.format ?? it.file.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? null;
  return contentTypeForFormat(fmt === 'bin' ? null : fmt);
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

async function processOne(it: ManifestItem): Promise<Row> {
  const row: Row = { publicId: it.publicId, group: it.group, outcome: 'falhou', thumbs: '', bytes: 0, error: '' };
  const file = path.join(BACKUP_DIR, it.file);
  const contentType = contentTypeFor(it);
  const wantsThumbs = contentType.startsWith('image/');

  // Já no R2 com o tamanho certo (e miniaturas, se for imagem)? → saltar
  const existing = await withRetry(() => fetchObjectInfo(it.publicId));
  if (existing && existing.bytes === it.bytesDisk) {
    const thumbOk = !wantsThumbs || (await withRetry(() => fetchObjectInfo(derivativeKey(it.publicId, 'thumb')))) !== null;
    if (thumbOk) {
      row.outcome = 'ja-estava';
      row.thumbs = wantsThumbs ? 'ja-estavam' : 'nenhuma';
      row.bytes = existing.bytes;
      return row;
    }
  }

  const body = await readFile(file);
  const sha = createHash('sha256').update(body).digest('hex');
  if (it.sha256 && sha !== it.sha256) {
    row.error = 'SHA-256 do ficheiro no disco não bate com o do backup';
    return row;
  }

  await withRetry(() => putObject(it.publicId, body, contentType));
  row.bytes = body.length;
  row.outcome = 'enviado';
  try {
    const d = await withRetry(() => generateDerivatives(it.publicId, { body, contentType }));
    row.thumbs = d === false ? 'nenhuma' : d;
  } catch (e) {
    row.thumbs = 'nenhuma';
    row.error = `miniaturas: ${errMsg(e)}`;
  }
  return row;
}

function writeReport(rows: Row[]): void {
  const cols: (keyof Row)[] = ['outcome', 'group', 'publicId', 'thumbs', 'bytes', 'error'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\r\n');
  writeFileSync(path.join(BACKUP_DIR, 'recarga-r2.csv'), '\uFEFF' + csv, 'utf8');
}

async function main(): Promise<void> {
  const manifestFile = path.join(BACKUP_DIR, 'manifesto.json');
  if (!existsSync(manifestFile)) throw new Error(`Manifesto não encontrado: ${manifestFile}`);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as ManifestItem[];

  const usable = manifest.filter(
    m => (m.status === 'ok' || m.status === 'ja-existia') && m.file && existsSync(path.join(BACKUP_DIR, m.file)),
  );
  const missing = manifest.length - usable.length;
  const queue = usable.slice(0, LIMIT);
  const totalBytes = queue.reduce((s, m) => s + (m.bytesDisk || 0), 0);

  log(`R2: bucket "${process.env.R2_BUCKET}" em ${(process.env.R2_ENDPOINT ?? '').replace(/^https?:\/\//, '')}`);
  if (!(process.env.R2_ENDPOINT ?? '').includes('.eu.') && process.env.R2_FORCE_PATH_STYLE !== '1') {
    throw new Error('R2_ENDPOINT sem ".eu." — o bucket tem jurisdição UE (ver .env.local)');
  }
  log(`Manifesto: ${manifest.length} ficheiros · utilizáveis ${usable.length}${missing ? ` · ⚠️ ${missing} sem ficheiro no disco` : ''}`);
  log(`A recarregar ${queue.length} ficheiros (${mb(totalBytes)}), ${PARALLEL} em paralelo`);

  const rows: Row[] = [];
  let next = 0;
  let done = 0;
  let consecutiveFails = 0;
  let aborted = false;
  const t0 = Date.now();
  const onExit = () => { writeReport(rows); process.exit(130); };
  process.on('SIGINT', onExit);

  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < queue.length && !aborted) {
        const it = queue[next++];
        let row: Row;
        try {
          row = await processOne(it);
        } catch (e) {
          row = { publicId: it.publicId, group: it.group, outcome: 'falhou', thumbs: '', bytes: 0, error: errMsg(e) };
        }
        rows.push(row);
        done++;
        if (row.outcome === 'falhou') {
          consecutiveFails++;
          if (consecutiveFails >= MAX_CONSECUTIVE_FAILS && !aborted) {
            aborted = true;
            process.stdout.write('\n');
            log(`✖ ${MAX_CONSECUTIVE_FAILS} falhas seguidas (última: ${row.error}). A parar.`);
          }
        } else {
          consecutiveFails = 0;
        }
        if (done % 10 === 0 || done === queue.length) {
          const secs = (Date.now() - t0) / 1000;
          const eta = ((queue.length - done) * secs) / done;
          const fails = rows.filter(r => r.outcome === 'falhou').length;
          process.stdout.write(`\r  ${done}/${queue.length} · falhas ${fails} · ${secs.toFixed(0)}s · faltam ~${Math.ceil(eta / 60)} min   `);
        }
        if (done % 500 === 0) writeReport(rows);
      }
    }),
  );
  process.stdout.write('\n');
  process.off('SIGINT', onExit);
  writeReport(rows);

  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const failed = rows.filter(r => r.outcome === 'falhou');
  log(
    `Concluído: ${count(r => r.outcome === 'enviado')} enviados · ${count(r => r.outcome === 'ja-estava')} já estavam · ${failed.length} falharam`,
  );
  log(
    `Miniaturas: ${count(r => r.thumbs === 'gerados')} geradas · ${count(r => r.thumbs === 'copia')} cópia do original (BMP…) · ${count(r => r.thumbs === 'ja-estavam')} já estavam · ${count(r => r.thumbs === 'nenhuma')} sem miniatura (PDF, DICOM…)`,
  );
  if (failed.length) {
    log('Falhas (primeiras 10) — voltar a correr o mesmo comando tenta só estas:');
    for (const f of failed.slice(0, 10)) console.log(`   ${f.publicId} → ${f.error}`);
    process.exitCode = 2;
  }
  if (aborted) log('Interrompido. Voltar a correr o mesmo comando retoma onde ficou.');
  log(`Relatório: ${path.join(BACKUP_DIR, 'recarga-r2.csv')}`);
}

main().catch(e => {
  console.error('\n✖ recarga falhou:', e);
  process.exitCode = 1;
});
