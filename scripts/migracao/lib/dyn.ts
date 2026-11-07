// 📄 scripts/migracao/lib/dyn.ts
// =============================================================================
// Acesso "tolerante" a tabelas do Dentoral cujo esquema varia entre versões
// (obsdent, anmtexto, anmtitulo, defdocs, ccconcilia, docitems).
// Em vez de assumir nomes de colunas, lê SHOW COLUMNS e escolhe por padrão.
// Tudo o que não for mapeado fica em legacyData.
// =============================================================================

import { q, log } from './common';

export type ColInfo = { name: string; type: string };

const cache = new Map<string, ColInfo[]>();

export async function columns(table: string): Promise<ColInfo[]> {
  if (cache.has(table)) return cache.get(table)!;
  const rows = await q<{ Field: string; Type: string }>(`SHOW COLUMNS FROM \`${table}\``);
  const cols = rows.map(r => ({ name: r.Field, type: String(r.Type).toLowerCase() }));
  cache.set(table, cols);
  return cols;
}

export async function tableExists(table: string): Promise<boolean> {
  const rows = await q<any>('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

/** Devolve o nome da 1.ª coluna cujo nome bate com um dos padrões (por ordem). */
export function pick(cols: ColInfo[], patterns: (RegExp | string)[], typeFilter?: RegExp): string | null {
  for (const p of patterns) {
    const re = typeof p === 'string' ? new RegExp(`^${p}$`, 'i') : p;
    const c = cols.find(c => re.test(c.name) && (!typeFilter || typeFilter.test(c.type)));
    if (c) return c.name;
  }
  return null;
}

export function pickAll(cols: ColInfo[], pattern: RegExp): string[] {
  return cols.filter(c => pattern.test(c.name)).map(c => c.name);
}

/** SELECT * com colunas text/blob convertidas para latin1 explícito. */
export function selectAll(table: string, cols: ColInfo[]): string {
  return cols.map(c => (/text|char|enum/.test(c.type) ? `CONVERT(\`${c.name}\` USING latin1) AS \`${c.name}\`` : `\`${c.name}\``)).join(', ');
}

export function describeMapping(table: string, mapping: Record<string, string | null | string[]>): void {
  log(`${table}: mapeamento de colunas`, mapping);
}
