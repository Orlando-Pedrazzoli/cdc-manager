// 📄 scripts/migracao/lib/common.ts
// =============================================================================
// Migração Dentoral → CDC Manager — utilitários partilhados
// -----------------------------------------------------------------------------
// Correr os scripts com:  npx tsx scripts/migracao/NN-nome.ts [flags]
// Flags comuns:
//   --dry-run        não escreve no Mongo (só lê, mapeia e conta)
//   --limit N        processa no máximo N registos (testes)
//   --batch N        tamanho dos lotes (default 2000)
//   --update         além de inserir, actualiza documentos já migrados
//                    (default: só insere os que não existem — nunca sobrepõe
//                    alterações feitas pela clínica no CDC)
// Variáveis (.env.local — correr com `npx tsx --env-file=.env.local ...`):
//   MONGODB_URI          cluster CDC (conta da clínica)
//   DENTORAL_MYSQL_URL   mysql://root@127.0.0.1:3308/drdata   (MySQL 5.5 local)
//   CLOUDINARY_URL       só para 09-documents / 10-photos
// =============================================================================

import mongoose, { type Model, Types } from 'mongoose';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------
export type Args = {
  dryRun: boolean;
  update: boolean;
  limit: number;
  batch: number;
  since: string | null;
  flags: Record<string, string | boolean>;
};

export function parseArgs(): Args {
  const flags: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return {
    dryRun: flags['dry-run'] === true,
    update: flags['update'] === true,
    limit: flags['limit'] ? Number(flags['limit']) : Infinity,
    batch: flags['batch'] ? Number(flags['batch']) : 2000,
    since: typeof flags['since'] === 'string' ? flags['since'] : null,
    flags,
  };
}

// -----------------------------------------------------------------------------
// Ligações
// -----------------------------------------------------------------------------
let pool: Pool | null = null;

export function getMysql(): Pool {
  if (pool) return pool;
  const url = process.env.DENTORAL_MYSQL_URL ?? 'mysql://root@127.0.0.1:3308/drdata';
  pool = mysql.createPool({
    uri: url,
    // O Dentoral guarda latin1 real (verificado: 'Ã' = 0xC3, um byte).
    // Com charset latin1 o driver devolve strings JS já correctas.
    charset: 'latin1',
    // DATE/TIME como strings: evita conversões de fuso pelo driver e deixa
    // passar '0000-00-00' (que tratamos como null em lisbonDate)
    dateStrings: true,
    decimalNumbers: false,
    waitForConnections: true,
    connectionLimit: 4,
    supportBigNumbers: true,
  });
  return pool;
}

export async function connectAll(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI em falta (.env.local)');
  if (!/\/cdc-manager(\?|$)/.test(uri)) {
    console.warn('⚠️  MONGODB_URI não aponta para a base "cdc-manager":', uri.replace(/:\/\/.*@/, '://***@'));
  }
  await mongoose.connect(uri, { maxPoolSize: 10 });
  // regista TODOS os models (populate / refs)
  await import('@/models');
  getMysql();
}

export async function closeAll(): Promise<void> {
  await mongoose.disconnect();
  if (pool) await pool.end();
}

export async function q<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getMysql().query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

/** Itera uma tabela por lotes com paginação por chave (keyset) */
export async function* pageByKey<T = RowDataPacket>(
  sqlBase: string, // SELECT ... FROM t WHERE <cond> AND key > ? ORDER BY key LIMIT ?
  key: (row: T) => number,
  batch: number,
  start = -1,
): AsyncGenerator<T[]> {
  let last = start;
  for (;;) {
    const rows = await q<T>(sqlBase, [last, batch]);
    if (rows.length === 0) return;
    yield rows;
    last = key(rows[rows.length - 1]);
    if (rows.length < batch) return;
  }
}

// -----------------------------------------------------------------------------
// Conversões
// -----------------------------------------------------------------------------
const lisbonFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Lisbon',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function lisbonOffsetMs(utcMs: number): number {
  const p = Object.fromEntries(lisbonFmt.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

export function isValidDateStr(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) return false;
  const y = Number(d.slice(0, 4));
  // Dentoral usa 0000-00-00 / 1900-01-01 como vazio e 9900-01-01 / 3529-12-31 como "a realizar"
  return y >= 1950 && y <= 2100;
}

/** 'YYYY-MM-DD' + 'HH:MM:SS' em hora de parede de Lisboa → instante UTC */
export function lisbonDate(dateStr: unknown, timeStr: unknown = '00:00:00'): Date | null {
  if (!isValidDateStr(dateStr)) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const t = typeof timeStr === 'string' && /^\d{2}:\d{2}/.test(timeStr) ? timeStr : '00:00:00';
  const [h, mi, s] = t.split(':').map(Number);
  if (y < 1900 || y > 2100) return null;
  const guess = Date.UTC(y, m - 1, d, h, mi, s || 0);
  const off = lisbonOffsetMs(guess);
  let utc = guess - off;
  const off2 = lisbonOffsetMs(utc);
  if (off2 !== off) utc = guess - off2;
  return new Date(utc);
}

/** DATETIME 'YYYY-MM-DD HH:MM:SS' em Lisboa */
export function lisbonDateTime(dt: unknown): Date | null {
  if (typeof dt !== 'string') return null;
  return lisbonDate(dt.slice(0, 10), dt.slice(11, 19) || '00:00:00');
}

export function cents(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function str(v: unknown, max = 100000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\u0000/g, '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function yn(v: unknown): boolean {
  return String(v ?? '').trim().toLowerCase() === 'sim';
}

/** NIF português válido (9 dígitos + dígito de controlo mod 11); rejeita placeholders
 *  do Dentoral (999999990 "consumidor final", dígitos repetidos). */
export function nif(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  if (!/^\d{9}$/.test(s) || /^(\d)\1{8}$/.test(s) || s === '999999990' || s === '123456789') return null;
  const sum = s.slice(0, 8).split('').reduce((a, d, i) => a + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(s[8]) ? s : null;
}

export function postalCode(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{3}$/.test(s) ? s : null;
}

/** Telefone PT → E.164; devolve null se não reconhecer (fica em legacyData) */
export function phoneE164(v: unknown): string | null {
  let s = String(v ?? '').replace(/[\s\-.()]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (/^351\d{9}$/.test(s)) return '+' + s;
  if (/^[29]\d{8}$/.test(s)) return '+351' + s;
  return null;
}

export function email(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

const FDI = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;
export function tooth(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return FDI.test(s) ? s : null;
}

/** Faces do Dentoral (bitmask em tratexec.Face / doclin.Faces) → texto.
 *  ASSUNÇÃO a validar com o Victor: bit1=O, bit2=M, bit4=D, bit16=V, bit32=L */
export function facesText(mask: unknown): string | null {
  const m = Number(mask) || 0;
  if (!m) return null;
  const f: string[] = [];
  if (m & 1) f.push('O');
  if (m & 2) f.push('M');
  if (m & 4) f.push('D');
  if (m & 16) f.push('V');
  if (m & 32) f.push('L');
  if (m & 8) f.push('?8');
  return f.length ? f.join('') : null;
}

export function oid(v: unknown): Types.ObjectId {
  return v instanceof Types.ObjectId ? v : new Types.ObjectId(String(v));
}

// -----------------------------------------------------------------------------
// Mapas legacyId → _id (carregados do Mongo)
// -----------------------------------------------------------------------------
export async function loadLegacyMap(model: Model<any>, field = 'legacyId'): Promise<Map<string, Types.ObjectId>> {
  const map = new Map<string, Types.ObjectId>();
  const cursor = model.find({ [field]: { $type: 'string' } }, { [field]: 1 }).lean().cursor();
  for await (const doc of cursor) {
    map.set(String((doc as any)[field]), (doc as any)._id);
  }
  return map;
}

// -----------------------------------------------------------------------------
// Escrita em lote, idempotente por legacyId
// -----------------------------------------------------------------------------
export type UpsertStats = { inserted: number; updated: number; skipped: number };

export async function upsertByLegacyId(
  model: Model<any>,
  docs: Record<string, any>[],
  args: Args,
  stats: UpsertStats,
  keyField = 'legacyId',
): Promise<void> {
  if (docs.length === 0) return;
  if (args.dryRun) {
    stats.skipped += docs.length;
    return;
  }
  const ops = docs.map(doc => {
    const { [keyField]: key, ...rest } = doc;
    const createdAt = rest.createdAt ?? new Date();
    const updatedAt = rest.updatedAt ?? createdAt;
    delete rest.createdAt;
    delete rest.updatedAt;
    if (args.update) {
      return {
        updateOne: {
          filter: { [keyField]: key },
          update: { $set: { ...rest, updatedAt }, $setOnInsert: { [keyField]: key, createdAt } },
          upsert: true,
        },
      };
    }
    return {
      updateOne: {
        filter: { [keyField]: key },
        update: { $setOnInsert: { [keyField]: key, ...rest, createdAt, updatedAt } },
        upsert: true,
      },
    };
  });
  const res = await model.bulkWrite(ops, { ordered: false, timestamps: false });
  stats.inserted += res.upsertedCount;
  stats.updated += res.modifiedCount;
  stats.skipped += docs.length - res.upsertedCount - res.modifiedCount;
}

// -----------------------------------------------------------------------------
// Referências fixas (criadas em 00-setup)
// -----------------------------------------------------------------------------
export const SYSTEM_USER_EMAIL = 'migracao@cdcclinicas.com';
export const PLACEHOLDER_DOCTOR_LEGACY = 'dentoral:0';
export const LEGACY_APPOINTMENT_TT_CODE = 'DENTORAL-AGENDA';
export const LEGACY_FREE_BUDGET_TT_CODE = 'DENTORAL-ORCLIVRE';

export type Refs = {
  clinicId: Types.ObjectId;
  systemUserId: Types.ObjectId;
  placeholderDoctorId: Types.ObjectId;
  legacyAppointmentTypeId: Types.ObjectId;
  legacyFreeBudgetTypeId: Types.ObjectId;
};

export async function loadRefs(): Promise<Refs> {
  const { Clinic, User, Doctor, TreatmentType } = await import('@/models');
  const clinic = await Clinic.findOne({ slug: 'colombo' }).lean();
  if (!clinic) throw new Error("Clínica 'colombo' não existe — correr o seed do CDC primeiro");
  const user = await User.findOne({ email: SYSTEM_USER_EMAIL }).lean();
  const doc = await Doctor.findOne({ legacyId: PLACEHOLDER_DOCTOR_LEGACY }).lean();
  const tt = await TreatmentType.findOne({ dentoralCode: LEGACY_APPOINTMENT_TT_CODE }).lean();
  const tt2 = await TreatmentType.findOne({ dentoralCode: LEGACY_FREE_BUDGET_TT_CODE }).lean();
  if (!user || !doc || !tt || !tt2) throw new Error('Referências em falta — correr 00-setup.ts primeiro');
  return {
    clinicId: clinic._id as Types.ObjectId,
    systemUserId: user._id as Types.ObjectId,
    placeholderDoctorId: doc._id as Types.ObjectId,
    legacyAppointmentTypeId: tt._id as Types.ObjectId,
    legacyFreeBudgetTypeId: tt2._id as Types.ObjectId,
  };
}

// -----------------------------------------------------------------------------
// Log
// -----------------------------------------------------------------------------
export function log(msg: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`, extra ? JSON.stringify(extra) : '');
}

export function progress(label: string, done: number, total: number | null, t0: number): void {
  const secs = (Date.now() - t0) / 1000;
  const rate = secs > 0 ? Math.round(done / secs) : 0;
  const pct = total ? ` ${((done / total) * 100).toFixed(1)}%` : '';
  process.stdout.write(`\r  ${label}: ${done}${total ? '/' + total : ''}${pct}  (${rate}/s)      `);
}

export async function runScript(name: string, fn: (args: Args) => Promise<void>): Promise<void> {
  process.on('unhandledRejection', e => { console.error('✖ unhandledRejection:', e); process.exitCode = 1; });
  process.on('exit', code => { if (code === 0 && !finished) console.error(`✖ ${name}: processo terminou antes de concluir (event loop vazio)`); });
  let finished = false;
  const args = parseArgs();
  const t0 = Date.now();
  log(`▶ ${name}`, { dryRun: args.dryRun, update: args.update, limit: args.limit === Infinity ? 'all' : args.limit });
  try {
    await connectAll();
    await fn(args);
    log(`✔ ${name} concluído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    finished = true;
  } catch (err) {
    console.error(`\n✖ ${name} falhou:`, err);
    process.exitCode = 1;
    finished = true;
  } finally {
    await closeAll();
  }
}
