// 📄 scripts/renomear-numero-paciente-modelos.ts
// =============================================================================
// CDC Manager — "N.º de processo" → "N.º do paciente" nos modelos (one-off)
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta B1). Os ecrãs já dizem "N.º do paciente"; os
// modelos de documentos (atestados, relatórios, orientações…) estão gravados
// na base e ainda têm a designação antiga no texto. Este script troca só a
// designação (regra em src/lib/template-labels.ts); o campo
// {{paciente.processo}} mantém-se e continua a preencher o número.
// Documentos já emitidos (PDF) não são alterados.
//
// Por omissão é SIMULAÇÃO. Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/renomear-numero-paciente-modelos.ts
//   npx tsx --env-file=.env.local scripts/renomear-numero-paciente-modelos.ts --apply
// =============================================================================

import mongoose from 'mongoose';
import DocumentTemplate from '../src/models/DocumentTemplate';
import { renamePatientNumberLabel } from '../src/lib/template-labels';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri);

  const templates = await DocumentTemplate.find({}).select('title body active').lean();
  console.log(apply ? '⚠ MODO GRAVAÇÃO (--apply)' : 'SIMULAÇÃO — nada é gravado (usar --apply para gravar)');
  const changes: { id: string; body: string }[] = [];
  for (const t of templates) {
    const body = String(t.body ?? '');
    const next = renamePatientNumberLabel(body);
    if (next === body) continue;
    changes.push({ id: String(t._id), body: next });
    console.log(`  ${t.active ? '' : '[inativo] '}${t.title}`);
    const before = body.split('\n');
    const after = next.split('\n');
    before.forEach((line, i) => {
      if (line !== after[i]) {
        console.log(`      - ${line.trim()}`);
        console.log(`      + ${(after[i] ?? '').trim()}`);
      }
    });
  }
  console.log(`\nmodelos: ${templates.length} · a alterar: ${changes.length}`);
  if (apply && changes.length > 0) {
    await DocumentTemplate.bulkWrite(
      changes.map(c => ({
        updateOne: { filter: { _id: c.id }, update: { $set: { body: c.body } } },
      })),
      { ordered: false },
    );
    console.log(`✓ ${changes.length} modelos atualizados`);
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
