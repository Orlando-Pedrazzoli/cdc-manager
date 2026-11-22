// 📄 scripts/backup-cloudinary.ts
// =============================================================================
// Backup de emergência Cloudinary → disco (migração para Cloudflare R2, passo 1)
// -----------------------------------------------------------------------------
// Descarrega os ficheiros que SÓ existem na Cloudinary — os criados dentro do
// CDC Manager — e salta os que vieram do Dentoral (têm original no MySQL local
// e são recarregados no passo 5 a partir de lá).
//
// O que conta como "só Cloudinary":
//   · documento-app ....... Document com legacyId = null (consentimentos RGPD
//                           e de RX, PDFs gerados, uploads manuais, anulados
//                           incluídos — never delete)
//   · foto-paciente ....... foto de paciente criado no CDC, ou foto carregada
//                           à mão (AuditLog "Foto do paciente atualizada")
//   · foto-stock .......... Product.imagePublicId
//   · logotipo ............ {root}/organizacao/logo (público)
//   · sem-registo ......... asset na Cloudinary sem nenhum registo na BD
//                           (uploads interrompidos, vídeos que a app não
//                           registou). Na dúvida guarda-se. --sem-orfaos salta.
// Saltados: dentoral-documento (Document com legacyId) e dentoral-foto.
//
// Correr na raiz do repo (PowerShell):
//   npx tsx --env-file=.env.local scripts/backup-cloudinary.ts              ← só conta
//   npx tsx --env-file=.env.local scripts/backup-cloudinary.ts --download   ← descarrega
// Flags:
//   --pasta C:\caminho     destino (por omissão C:\cdc\backup-cloudinary)
//   --sem-orfaos           não descarrega o grupo sem-registo
//   --sem-inventario       não lista a Cloudinary (usa só a BD; não deteta órfãos)
//   --paralelo N           downloads em simultâneo (por omissão 4, máx. 8)
//   --tudo                 descarrega TAMBÉM os ficheiros do Dentoral (cópia
//                          completa, ~41 mil ficheiros / 3,2 GB)
//   --reusar-inventario    usa o inventario.json da última corrida em vez de
//                          voltar a listar a Cloudinary (poupa a cota da API)
// Retomável: voltar a correr salta o que já está no disco com o tamanho certo.
// Se 40 downloads seguidos falharem, pára (Cloudinary provavelmente bloqueada).
//
// RGPD: a pasta de destino fica com dados de saúde. Não a pôr no OneDrive nem
// dentro do repo; o manifesto só tem IDs, nunca nomes de pacientes.
// =============================================================================

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

// -----------------------------------------------------------------------------
// Argumentos
// -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (f: string) => argv.includes(f);
const flagValue = (f: string): string | null => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const DOWNLOAD = hasFlag('--download');
const SKIP_ORPHANS = hasFlag('--sem-orfaos');
const SKIP_INVENTORY = hasFlag('--sem-inventario');
const EVERYTHING = hasFlag('--tudo');
const REUSE_INVENTORY = hasFlag('--reusar-inventario');
const MAX_CONSECUTIVE_FAILS = 40;
const PARALLEL = Math.max(1, Math.min(8, Number(flagValue('--paralelo') ?? 4) || 4));
const OUT_DIR =
  flagValue('--pasta') ??
  (process.platform === 'win32' ? 'C:\\cdc\\backup-cloudinary' : path.resolve('backup-cloudinary'));

const ROOT = process.env.CLOUDINARY_FOLDER || 'cdc-manager';
const LOGO_ID = `${ROOT}/organizacao/logo`;

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------
type ResourceType = 'image' | 'raw' | 'video';
type DeliveryType = 'authenticated' | 'upload';
type Group =
  | 'documento-app'
  | 'foto-paciente'
  | 'foto-stock'
  | 'logotipo'
  | 'sem-registo'
  | 'dentoral-documento'
  | 'dentoral-foto';

const DOWNLOAD_GROUPS: Group[] = [
  'documento-app', 'foto-paciente', 'foto-stock', 'logotipo', 'sem-registo',
  ...(EVERYTHING ? (['dentoral-documento', 'dentoral-foto'] as Group[]) : []),
];

interface CloudAsset {
  publicId: string;
  resourceType: ResourceType;
  type: DeliveryType;
  format: string | null;
  bytes: number;
  version: number | null;
}

interface DbRef {
  group: Group;
  collection: string;
  mongoId: string;
  resourceType: ResourceType | null;
  format: string | null;
  bytes: number;
  detail: string;
}

interface Item {
  group: Group;
  publicId: string;
  resourceType: ResourceType;
  type: DeliveryType;
  format: string | null;
  bytesExpected: number;
  collection: string;
  mongoId: string;
  detail: string;
  // resultado
  file: string;
  bytesDisk: number;
  sha256: string;
  status: 'pendente' | 'ok' | 'ja-existia' | 'falhou';
  error: string;
}

// -----------------------------------------------------------------------------
// Utilitários
// -----------------------------------------------------------------------------
const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString('pt-PT')}] ${msg}`);
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const errMsg = (e: unknown): string => {
  const x = e as { error?: { message?: string }; message?: string };
  return x?.error?.message ?? x?.message ?? String(e);
};

function configureCloudinary(): void {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
  } else {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error('CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET em falta no .env.local');
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

// -----------------------------------------------------------------------------
// 1. Registos na BD (o que é da app e o que veio do Dentoral)
// -----------------------------------------------------------------------------
async function loadDbRefs(): Promise<Map<string, DbRef>> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Sem ligação ao MongoDB');
  const refs = new Map<string, DbRef>();

  // Documentos
  const docs = db.collection('documents').find(
    {},
    { projection: { publicId: 1, legacyId: 1, resourceType: 1, format: 1, bytes: 1, category: 1, voidedAt: 1 } },
  );
  for await (const d of docs) {
    if (!d.publicId) continue;
    const fromDentoral = typeof d.legacyId === 'string' && d.legacyId.length > 0;
    refs.set(String(d.publicId), {
      group: fromDentoral ? 'dentoral-documento' : 'documento-app',
      collection: 'documents',
      mongoId: String(d._id),
      resourceType: (d.resourceType as ResourceType) ?? null,
      format: d.format ?? null,
      bytes: Number(d.bytes) || 0,
      detail: `${d.category ?? ''}${d.voidedAt ? ' (anulado)' : ''}`,
    });
  }

  // Fotos carregadas à mão (o ID é o mesmo das fotos do Dentoral, por isso
  // a única prova é o registo de auditoria da action setPatientPhotoAction)
  const manualPhoto = new Set<string>();
  const audits = db.collection('auditlogs').find(
    { entityType: 'Patient', changedFields: 'photoPublicId', summary: 'Foto do paciente atualizada' },
    { projection: { entityId: 1 } },
  );
  for await (const a of audits) if (a.entityId) manualPhoto.add(String(a.entityId));

  const patients = db.collection('patients').find(
    { photoPublicId: { $type: 'string' } },
    { projection: { photoPublicId: 1, legacyId: 1 } },
  );
  for await (const p of patients) {
    const createdInCdc = p.legacyId === null || p.legacyId === undefined || p.legacyId === '';
    const manual = createdInCdc || manualPhoto.has(String(p._id));
    refs.set(String(p.photoPublicId), {
      group: manual ? 'foto-paciente' : 'dentoral-foto',
      collection: 'patients',
      mongoId: String(p._id),
      resourceType: 'image',
      format: null,
      bytes: 0,
      detail: createdInCdc ? 'paciente criado no CDC' : manual ? 'foto substituída no CDC' : '',
    });
  }

  // Stock
  const products = db.collection('products').find(
    { imagePublicId: { $type: 'string' } },
    { projection: { imagePublicId: 1 } },
  );
  for await (const p of products) {
    refs.set(String(p.imagePublicId), {
      group: 'foto-stock',
      collection: 'products',
      mongoId: String(p._id),
      resourceType: 'image',
      format: null,
      bytes: 0,
      detail: '',
    });
  }

  // Logótipo (só se o logoUrl aponta para a Cloudinary)
  const org = await db.collection('organizations').findOne({ logoUrl: { $regex: '/organizacao/logo' } });
  if (org) {
    refs.set(LOGO_ID, {
      group: 'logotipo',
      collection: 'organizations',
      mongoId: String(org._id),
      resourceType: 'image',
      format: null,
      bytes: 0,
      detail: String(org.logoUrl),
    });
  }

  return refs;
}

// -----------------------------------------------------------------------------
// 2. Inventário da Cloudinary (Admin API, 500 por pedido)
// -----------------------------------------------------------------------------
async function listCloudinary(): Promise<{ assets: CloudAsset[]; calls: number }> {
  const assets: CloudAsset[] = [];
  let calls = 0;
  for (const resourceType of ['image', 'raw', 'video'] as const) {
    for (const type of ['authenticated', 'upload'] as const) {
      let cursor: string | undefined;
      do {
        const res = (await cloudinary.api.resources({
          resource_type: resourceType,
          type,
          prefix: `${ROOT}/`,
          max_results: 500,
          ...(cursor ? { next_cursor: cursor } : {}),
        })) as {
          resources: { public_id: string; format?: string; bytes?: number; version?: number }[];
          next_cursor?: string;
          rate_limit_remaining?: number;
        };
        calls++;
        for (const r of res.resources) {
          assets.push({
            publicId: r.public_id,
            resourceType,
            type,
            format: r.format ?? null,
            bytes: r.bytes ?? 0,
            version: r.version ?? null,
          });
        }
        cursor = res.next_cursor;
        process.stdout.write(
          `\r  inventário: ${assets.length} assets · ${calls} pedidos` +
            (res.rate_limit_remaining !== undefined ? ` · restam ${res.rate_limit_remaining}/h` : '') +
            '   ',
        );
      } while (cursor);
    }
  }
  process.stdout.write('\n');
  return { assets, calls };
}

// -----------------------------------------------------------------------------
// 3. Download
// -----------------------------------------------------------------------------
function extFor(it: Item): string {
  const f = (it.format ?? '').replace(/^\./, '').toLowerCase();
  if (f) return f;
  const fromId = it.publicId.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  return fromId ? '' : 'bin'; // raw com extensão no próprio ID não leva outra
}

function filePathFor(it: Item): string {
  const ext = extFor(it);
  const parts = it.publicId.split('/').filter(Boolean);
  return path.join(OUT_DIR, 'ficheiros', ...parts) + (ext ? `.${ext}` : '');
}

function candidateUrls(it: Item): string[] {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const urls: string[] = [];
  // a) API de download do original (a mesma que o botão "Transferir" da app usa)
  const apiUrl = (
    cloudinary.utils.private_download_url(it.publicId, it.resourceType === 'raw' ? '' : (it.format ?? ''), {
      resource_type: it.resourceType,
      type: it.type,
      expires_at: expiresAt,
    })
  );
  // b) URL de entrega sem transformações (assinada quando authenticated) —
  //    CDN, sem limite de pedidos da API; vai primeiro na cópia completa
  const cdnUrl = (
    cloudinary.url(it.publicId, {
      resource_type: it.resourceType,
      type: it.type,
      sign_url: it.type === 'authenticated',
      secure: true,
      ...(it.resourceType !== 'raw' && it.format ? { format: it.format } : {}),
    })
  );
  urls.push(...(EVERYTHING ? [cdnUrl, apiUrl] : [apiUrl, cdnUrl]));
  return urls;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    const hint = res.headers.get('x-cld-error') ?? (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`HTTP ${res.status} ${hint}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadOne(it: Item): Promise<void> {
  const target = filePathFor(it);
  it.file = path.relative(OUT_DIR, target);

  if (existsSync(target)) {
    const size = statSync(target).size;
    if (size > 0 && (it.bytesExpected === 0 || size === it.bytesExpected)) {
      it.status = 'ja-existia';
      it.bytesDisk = size;
      return;
    }
  }

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of candidateUrls(it)) {
      try {
        const buf = await fetchBytes(url);
        if (buf.length === 0) throw new Error('ficheiro vazio');
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(`${target}.part`, buf);
        renameSync(`${target}.part`, target);
        it.bytesDisk = buf.length;
        it.sha256 = createHash('sha256').update(buf).digest('hex');
        it.status = 'ok';
        it.error = it.bytesExpected && buf.length !== it.bytesExpected
          ? `tamanho difere (Cloudinary ${it.bytesExpected})`
          : '';
        return;
      } catch (e) {
        lastErr = errMsg(e);
      }
    }
    await sleep(3000 * attempt);
  }
  it.status = 'falhou';
  it.error = lastErr;
}

// -----------------------------------------------------------------------------
// 4. Manifesto
// -----------------------------------------------------------------------------
function writeManifest(items: Item[]): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const cols: (keyof Item)[] = [
    'group', 'status', 'publicId', 'resourceType', 'type', 'format', 'bytesExpected',
    'bytesDisk', 'sha256', 'file', 'collection', 'mongoId', 'detail', 'error',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(';'), ...items.map(it => cols.map(c => esc(it[c])).join(';'))].join('\r\n');
  writeFileSync(path.join(OUT_DIR, 'manifesto.csv'), '\uFEFF' + csv, 'utf8');
  writeFileSync(path.join(OUT_DIR, 'manifesto.json'), JSON.stringify(items, null, 1), 'utf8');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI em falta no .env.local');
  configureCloudinary();
  log(`cloud: ${cloudinary.config().cloud_name} · pasta raiz: ${ROOT}/ · destino: ${OUT_DIR}`);

  await mongoose.connect(uri, { maxPoolSize: 5 });
  log(`MongoDB ligado (base "${mongoose.connection.db?.databaseName}")`);
  const refs = await loadDbRefs();

  // Inventário
  let assets: CloudAsset[] | null = null;
  const inventoryFile = path.join(OUT_DIR, 'inventario.json');
  if (!SKIP_INVENTORY && REUSE_INVENTORY && existsSync(inventoryFile)) {
    assets = JSON.parse(readFileSync(inventoryFile, 'utf8')) as CloudAsset[];
    log(`Inventário reutilizado de ${inventoryFile}: ${assets.length} assets`);
  } else if (!SKIP_INVENTORY) {
    log('A listar a Cloudinary (Admin API)…');
    try {
      const r = await listCloudinary();
      assets = r.assets;
      log(`Inventário: ${assets.length} assets em ${r.calls} pedidos`);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(inventoryFile, JSON.stringify(assets), 'utf8');
    } catch (e) {
      log(`⚠️  Inventário falhou (${errMsg(e)}). Continuo só com a BD — órfãos não detetados.`);
    }
  }

  // Juntar BD + Cloudinary
  const items: Item[] = [];
  const seen = new Set<string>();
  const mk = (a: Omit<Item, 'file' | 'bytesDisk' | 'sha256' | 'status' | 'error'>): Item => ({
    ...a, file: '', bytesDisk: 0, sha256: '', status: 'pendente', error: '',
  });

  if (assets) {
    for (const a of assets) {
      const ref = refs.get(a.publicId);
      seen.add(a.publicId);
      items.push(mk({
        group: ref?.group ?? 'sem-registo',
        publicId: a.publicId,
        resourceType: a.resourceType,
        type: a.type,
        format: a.format ?? ref?.format ?? null,
        bytesExpected: a.bytes,
        collection: ref?.collection ?? '',
        mongoId: ref?.mongoId ?? '',
        detail: ref?.detail ?? `${a.resourceType}/${a.type}`,
      }));
    }
  } else {
    for (const [publicId, ref] of refs) {
      seen.add(publicId);
      items.push(mk({
        group: ref.group,
        publicId,
        resourceType: ref.resourceType ?? 'image',
        type: ref.group === 'logotipo' ? 'upload' : 'authenticated',
        format: ref.format,
        bytesExpected: ref.bytes,
        collection: ref.collection,
        mongoId: ref.mongoId,
        detail: ref.detail,
      }));
    }
  }

  // Registos da app que não aparecem no inventário
  const missing = assets
    ? [...refs.entries()].filter(([id, r]) => !seen.has(id) && DOWNLOAD_GROUPS.includes(r.group))
    : [];

  // Contagem
  const groups: Group[] = [...new Set<Group>([...DOWNLOAD_GROUPS, 'dentoral-documento', 'dentoral-foto'])];
  console.log('\n  Grupo                 Ficheiros     Tamanho   Ação');
  console.log('  ────────────────────  ─────────  ──────────  ──────────────');
  let dlCount = 0;
  let dlBytes = 0;
  for (const g of groups) {
    const list = items.filter(i => i.group === g);
    const bytes = list.reduce((s, i) => s + i.bytesExpected, 0);
    const willDownload = DOWNLOAD_GROUPS.includes(g) && !(g === 'sem-registo' && SKIP_ORPHANS);
    if (willDownload) { dlCount += list.length; dlBytes += bytes; }
    console.log(
      `  ${g.padEnd(20)}  ${String(list.length).padStart(9)}  ${(bytes ? mb(bytes) : '—').padStart(10)}  ${willDownload ? 'DESCARREGAR' : 'saltar'}`,
    );
  }
  console.log('  ────────────────────  ─────────  ──────────');
  console.log(`  ${'A descarregar'.padEnd(20)}  ${String(dlCount).padStart(9)}  ${(dlBytes ? mb(dlBytes) : '—').padStart(10)}\n`);

  // Detalhe útil
  const appDocs = items.filter(i => i.group === 'documento-app');
  if (appDocs.length) {
    const byCat = new Map<string, number>();
    for (const d of appDocs) byCat.set(d.detail || '(sem categoria)', (byCat.get(d.detail || '(sem categoria)') ?? 0) + 1);
    console.log('  documento-app por categoria:', Object.fromEntries(byCat));
  }
  const orphans = items.filter(i => i.group === 'sem-registo');
  if (orphans.length) {
    const byFolder = new Map<string, number>();
    for (const o of orphans) {
      const k = `${o.publicId.split('/').slice(0, -1).join('/')} [${o.resourceType}/${o.type}]`;
      byFolder.set(k, (byFolder.get(k) ?? 0) + 1);
    }
    console.log('  sem-registo por pasta:', Object.fromEntries(byFolder));
  }
  if (missing.length) {
    console.log(`  ⚠️  ${missing.length} registo(s) da app apontam para ficheiros que NÃO estão na Cloudinary:`);
    for (const [id, r] of missing.slice(0, 10)) console.log(`     ${r.group} ${r.collection}/${r.mongoId} → ${id}`);
    if (missing.length > 10) console.log(`     … e mais ${missing.length - 10}`);
  }

  if (!DOWNLOAD) {
    log('Só contagem. Para descarregar, voltar a correr com --download');
    return;
  }

  // Download
  const queue = items.filter(
    i => DOWNLOAD_GROUPS.includes(i.group) && !(i.group === 'sem-registo' && SKIP_ORPHANS),
  );
  mkdirSync(OUT_DIR, { recursive: true });
  log(`A descarregar ${queue.length} ficheiros (${PARALLEL} em paralelo) para ${OUT_DIR}`);

  let done = 0;
  let next = 0;
  let fails = 0;
  let consecutiveFails = 0;
  let aborted = false;
  const t0 = Date.now();
  const manifestEvery = Math.max(25, Math.ceil(queue.length / 100));
  const onExit = () => { writeManifest(queue); process.exit(130); };
  process.on('SIGINT', onExit);

  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < queue.length && !aborted) {
        const it = queue[next++];
        await downloadOne(it);
        done++;
        if (it.status === 'falhou') {
          fails++;
          consecutiveFails++;
          if (consecutiveFails >= MAX_CONSECUTIVE_FAILS && !aborted) {
            aborted = true;
            process.stdout.write('\n');
            log(`✖ ${MAX_CONSECUTIVE_FAILS} falhas seguidas (última: ${it.error}). A Cloudinary parece estar a bloquear — a parar.`);
          }
        } else {
          consecutiveFails = 0;
        }
        if (done % 10 === 0 || done === queue.length) {
          const secs = (Date.now() - t0) / 1000;
          const eta = done ? ((queue.length - done) * secs) / done : 0;
          process.stdout.write(
            `\r  ${done}/${queue.length} · falhas ${fails} · ${secs.toFixed(0)}s · faltam ~${Math.ceil(eta / 60)} min   `,
          );
        }
        if (done % manifestEvery === 0) writeManifest(queue);
      }
    }),
  );
  process.stdout.write('\n');
  process.off('SIGINT', onExit);
  writeManifest(queue);
  if (aborted) {
    log('Interrompido. O que já foi descarregado está no disco; voltar a correr o mesmo comando (com --reusar-inventario) retoma.');
  }

  const ok = queue.filter(q => q.status === 'ok').length;
  const had = queue.filter(q => q.status === 'ja-existia').length;
  const failed = queue.filter(q => q.status === 'falhou' || q.status === 'pendente');
  const sizeWarn = queue.filter(q => q.status === 'ok' && q.error).length;
  const diskBytes = queue.reduce((s, q) => s + q.bytesDisk, 0);
  log(`Concluído: ${ok} descarregados · ${had} já existiam · ${failed.length} falharam · ${mb(diskBytes)} em disco`);
  if (sizeWarn) log(`ℹ️  ${sizeWarn} com tamanho diferente do registado (ver coluna error no manifesto)`);
  if (failed.length) {
    log('Falhas (primeiras 10) — voltar a correr o mesmo comando tenta só estas:');
    for (const f of failed.slice(0, 10)) console.log(`   ${f.group} ${f.publicId} → ${f.error}`);
    process.exitCode = 2;
  }
  log(`Manifesto: ${path.join(OUT_DIR, 'manifesto.csv')}`);
}

main()
  .catch(e => {
    console.error('\n✖ backup falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
