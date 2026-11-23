// 📄 scripts/verificar-r2.ts
// =============================================================================
// Verificação final da migração para o R2 (passo 6) — SÓ LEITURA
// -----------------------------------------------------------------------------
// Percorre TODOS os ficheiros que a base de dados referencia e confirma que
// existem no R2 (e, nas imagens, que existe a miniatura):
//   · Document.publicId          (anulados incluídos — never delete)
//   · Patient.photoPublicId
//   · Product.imagePublicId
//   · logótipo da organização    (se o logoUrl aponta para /api/organizacao/logo)
// Não escreve nada no MongoDB nem no R2.
//
// Correr na raiz do repo (PowerShell):
//   npx tsx --env-file=.env.local scripts/verificar-r2.ts
// Flags:
//   --pasta C:\caminho   onde gravar o relatório (por omissão C:\cdc\backup-cloudinary)
//   --paralelo N         verificações em simultâneo (por omissão 16)
// Relatório: verificacao-r2.csv — só as linhas com problema.
// =============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { derivativeKey, fetchObjectInfo, organizationLogoKey } from '@/lib/storage';

const argv = process.argv.slice(2);
const flagValue = (f: string): string | null => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const OUT_DIR =
  flagValue('--pasta') ??
  (process.platform === 'win32' ? 'C:\\cdc\\backup-cloudinary' : path.resolve('backup-cloudinary'));
const PARALLEL = Math.max(1, Math.min(32, Number(flagValue('--paralelo') ?? 16) || 16));

type Group = 'documento' | 'foto-paciente' | 'foto-stock' | 'logotipo';
interface Ref {
  group: Group;
  key: string;
  mongoId: string;
  needsThumb: boolean;
  detail: string;
}
interface Problem extends Ref {
  problem: 'ficheiro em falta' | 'miniatura em falta' | 'erro';
  error: string;
}

const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString('pt-PT')}] ${msg}`);

async function loadRefs(): Promise<Ref[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Sem ligação ao MongoDB');
  const refs: Ref[] = [];

  for await (const d of db.collection('documents').find(
    {},
    { projection: { publicId: 1, resourceType: 1, format: 1, category: 1, voidedAt: 1, legacyId: 1 } },
  )) {
    if (!d.publicId) continue;
    const isPdf = String(d.format ?? '').toLowerCase() === 'pdf';
    refs.push({
      group: 'documento',
      key: String(d.publicId),
      mongoId: String(d._id),
      needsThumb: d.resourceType === 'image' && !isPdf,
      detail: `${d.category ?? ''}${d.voidedAt ? ' (anulado)' : ''}${d.legacyId ? ' · Dentoral' : ' · CDC'}`,
    });
  }
  for await (const p of db.collection('patients').find(
    { photoPublicId: { $type: 'string' } },
    { projection: { photoPublicId: 1 } },
  )) {
    refs.push({ group: 'foto-paciente', key: String(p.photoPublicId), mongoId: String(p._id), needsThumb: true, detail: '' });
  }
  for await (const p of db.collection('products').find(
    { imagePublicId: { $type: 'string' } },
    { projection: { imagePublicId: 1 } },
  )) {
    refs.push({ group: 'foto-stock', key: String(p.imagePublicId), mongoId: String(p._id), needsThumb: true, detail: '' });
  }
  const org = await db.collection('organizations').findOne({}, { projection: { logoUrl: 1 } });
  if (org?.logoUrl && String(org.logoUrl).startsWith('/api/organizacao/logo')) {
    refs.push({ group: 'logotipo', key: organizationLogoKey(), mongoId: String(org._id), needsThumb: false, detail: String(org.logoUrl) });
  } else {
    log(`Logótipo: ${org?.logoUrl ?? '(nenhum)'} — não está no R2, não se verifica`);
  }
  return refs;
}

async function checkOne(r: Ref): Promise<Problem | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (!(await fetchObjectInfo(r.key))) return { ...r, problem: 'ficheiro em falta', error: '' };
      if (r.needsThumb && !(await fetchObjectInfo(derivativeKey(r.key, 'thumb')))) {
        return { ...r, problem: 'miniatura em falta', error: '' };
      }
      return null;
    } catch (e) {
      if (attempt === 3) return { ...r, problem: 'erro', error: (e as Error).message };
      await new Promise(res => setTimeout(res, 1500 * attempt));
    }
  }
  return null;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI em falta no .env.local');
  await mongoose.connect(uri, { maxPoolSize: 5 });
  log(`MongoDB ligado (base "${mongoose.connection.db?.databaseName}") · R2 bucket "${process.env.R2_BUCKET}"`);

  const refs = await loadRefs();
  log(`A verificar ${refs.length} ficheiros referenciados na BD (${PARALLEL} em paralelo)…`);

  const problems: Problem[] = [];
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < refs.length) {
        const r = refs[next++];
        const p = await checkOne(r);
        if (p) problems.push(p);
        done++;
        if (done % 200 === 0 || done === refs.length) {
          process.stdout.write(`\r  ${done}/${refs.length} · problemas ${problems.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
        }
      }
    }),
  );
  process.stdout.write('\n');

  console.log('\n  Grupo           Referências  Em falta  Sem miniatura  Erros');
  console.log('  ──────────────  ───────────  ────────  ─────────────  ─────');
  for (const g of ['documento', 'foto-paciente', 'foto-stock', 'logotipo'] as Group[]) {
    const total = refs.filter(r => r.group === g).length;
    const ps = problems.filter(p => p.group === g);
    const c = (k: Problem['problem']) => ps.filter(p => p.problem === k).length;
    console.log(
      `  ${g.padEnd(14)}  ${String(total).padStart(11)}  ${String(c('ficheiro em falta')).padStart(8)}  ${String(c('miniatura em falta')).padStart(13)}  ${String(c('erro')).padStart(5)}`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'verificacao-r2.csv');
  const cols: (keyof Problem)[] = ['problem', 'group', 'key', 'mongoId', 'detail', 'error'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(file, '\uFEFF' + [cols.join(';'), ...problems.map(p => cols.map(c => esc(p[c])).join(';'))].join('\r\n'), 'utf8');

  if (problems.length === 0) {
    log('✔ Todos os ficheiros referenciados na BD estão no R2 (com miniaturas nas imagens).');
  } else {
    log(`✖ ${problems.length} problema(s). Primeiros 10:`);
    for (const p of problems.slice(0, 10)) console.log(`   ${p.problem} · ${p.group} · ${p.key} ${p.detail}`);
    log(`Lista completa: ${file}`);
    process.exitCode = 2;
  }
}

main()
  .catch(e => {
    console.error('\n✖ verificação falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
