// 📄 scripts/migracao/13-chart-effects.ts
// =============================================================================
// Passo 13 — TreatmentType.chartEffect: como cada ato pinta o odontograma.
// Infere por palavras-chave (lib/odontogram-chart.ts) para TODOS os atos
// (atuais + legacy inativos), grava, e exporta um CSV para o Victor rever:
//   C:\cdc\inventario\atos-odontograma.csv  (código;nome;categoria;efeito)
// Só sobrepõe efeitos ainda não revistos à mão (--update força tudo).
// Idempotente. Correr antes do 14-odontogram.
// =============================================================================

import { writeFileSync } from 'node:fs';
import { runScript, log } from './lib/common';
import { inferChartEffect } from '@/lib/odontogram-chart';

const CSV = 'C:\\cdc\\inventario\\atos-odontograma.csv';

void runScript('13-chart-effects', async args => {
  const { TreatmentType } = await import('@/models');
  const types = await TreatmentType.find({}, { dentoralCode: 1, name: 1, category: 1, chartEffect: 1, chartEffectReviewed: 1, active: 1 }).lean();
  const ops: any[] = [];
  const counts = new Map<string, number>();
  const lines = ['codigo;nome;categoria;efeito;ativo'];
  for (const t of types) {
    const effect = inferChartEffect(String(t.name), t.category ?? null);
    counts.set(effect, (counts.get(effect) ?? 0) + 1);
    lines.push(`${t.dentoralCode ?? ''};${String(t.name).replace(/;/g, ',')};${t.category ?? ''};${effect};${t.active ? 'sim' : 'nao'}`);
    const current = (t as any).chartEffect ?? 'none';
    if (current !== effect && (args.update || !(t as any).chartEffectReviewed)) {
      ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { chartEffect: effect } } } });
    }
  }
  log(`atos: ${types.length} · a atualizar: ${ops.length}`, Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])));
  if (!args.dryRun && ops.length) for (let i = 0; i < ops.length; i += 500) await TreatmentType.bulkWrite(ops.slice(i, i + 500), { ordered: false, timestamps: false });
  try { writeFileSync(CSV, lines.join('\n'), 'utf8'); log(`CSV para revisão: ${CSV}`); } catch (e: any) { log(`não consegui escrever o CSV: ${e?.message}`); }
});
