// 📄 scripts/fix-process-number-index.ts
// =============================================================================
// CDC Manager — 6.ª ronda/01: nº de processo só com a ficha criada
// -----------------------------------------------------------------------------
// As pré-marcações deixaram de ter nº de processo (processNumber = null). O
// índice único antigo `processNumber_1` não é parcial: com ele, a 2.ª
// pré-marcação falharia com E11000 dup key { processNumber: null }.
//
// O que este script faz (correr UMA vez em cada base, ANTES de usar a nova
// versão; idempotente):
//   1. apaga o índice único antigo, se ainda não for parcial;
//   2. cria o índice parcial declarado em src/models/Patient.ts;
//   3. com --release: retira o nº às pré-marcações que ainda estão por
//      completar (fichas `provisional`), libertando esses números.
//
//   npx tsx --env-file=.env.local scripts/fix-process-number-index.ts
//   npx tsx --env-file=.env.local scripts/fix-process-number-index.ts --release
// =============================================================================

import mongoose from 'mongoose';
import Patient from '../src/models/Patient';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  const release = process.argv.includes('--release');
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('patients');

  const existing = await col.indexes();
  const old = existing.find(i => i.name === 'processNumber_1');
  if (old && !old.partialFilterExpression) {
    await col.dropIndex('processNumber_1');
    console.log('✓ índice único antigo processNumber_1 apagado');
  } else {
    console.log('· índice antigo não encontrado ou já parcial — nada a apagar');
  }

  await col.createIndex(
    { processNumber: 1 },
    {
      name: 'processNumber_1',
      unique: true,
      partialFilterExpression: { processNumber: { $type: 'number' } },
    },
  );
  const fixed = (await col.indexes()).find(i => i.name === 'processNumber_1');
  console.log(
    fixed?.partialFilterExpression
      ? '✓ índice parcial criado: ' +
          JSON.stringify(fixed.partialFilterExpression)
      : '✗ índice parcial NÃO encontrado — verificar',
  );

  const pending = await Patient.find({
    provisional: true,
    processNumber: { $ne: null },
  })
    .select('name processNumber')
    .lean();
  console.log(`\nPré-marcações por completar com nº atribuído: ${pending.length}`);
  for (const p of pending) console.log(`  · ${p.processNumber} — ${p.name}`);
  if (pending.length > 0) {
    if (release) {
      const res = await Patient.updateMany(
        { provisional: true, processNumber: { $ne: null } },
        { $set: { processNumber: null } },
      );
      console.log(`✓ nº retirado a ${res.modifiedCount} pré-marcação(ões)`);
    } else {
      console.log('  (mantidos — correr com --release para libertar os números)');
    }
  }

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
