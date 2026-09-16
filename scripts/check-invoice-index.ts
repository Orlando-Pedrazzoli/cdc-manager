// 📄 scripts/check-invoice-index.ts
// =============================================================================
// CDC Manager — Verificação SÓ DE LEITURA do índice `invoices.moloniDocumentId_1`
// -----------------------------------------------------------------------------
// Responde à pergunta "já corri o fix-invoice-index.ts nesta base?".
// Não altera nada. Correr contra CADA base (dev e produção):
//   npx tsx --env-file=.env.local scripts/check-invoice-index.ts
//   MONGODB_URI="mongodb+srv://..." npx tsx scripts/check-invoice-index.ts
// Sai com código 0 se está certo, 1 se falta correr o fix.
// =============================================================================

import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error('MONGODB_URI não definida (usa --env-file ou a env).');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const host = uri.replace(/\/\/.*@/, '//***@').split('?')[0];
  console.log(`Base: ${db.databaseName}  (${host})\n`);

  const col = db.collection('invoices');
  const idx = (await col.indexes()).find(i => i.name === 'moloniDocumentId_1');
  const total = await col.countDocuments();
  const semMoloni = await col.countDocuments({ moloniDocumentId: null });

  console.log(`Faturas: ${total}  · sem documento Moloni: ${semMoloni}`);

  if (!idx) {
    console.log('\n⚠  Índice moloniDocumentId_1 NÃO existe.');
    console.log('   O Mongoose cria-o parcial no próximo arranque da app, mas');
    console.log('   corre o fix-invoice-index.ts para o criar já e confirmar.');
    process.exit(1);
  }

  console.log(`\nÍndice moloniDocumentId_1:`);
  console.log(`   unique: ${!!idx.unique}`);
  console.log(`   sparse: ${!!idx.sparse}`);
  console.log(
    `   partialFilterExpression: ${
      idx.partialFilterExpression
        ? JSON.stringify(idx.partialFilterExpression)
        : '(nenhum)'
    }`,
  );

  if (idx.partialFilterExpression) {
    console.log(
      '\n✓ CORRIGIDO — o fix já correu nesta base. A 2.ª fatura sem Moloni grava.',
    );
    process.exit(0);
  }

  console.log(
    '\n✗ ÍNDICE ANTIGO (unique + sparse) — o fix AINDA NÃO correu aqui.',
  );
  console.log(
    '   A 2.ª cobrança sem Moloni vai falhar com E11000 dup key { moloniDocumentId: null }.',
  );
  console.log('   Corre agora:');
  console.log('   npx tsx --env-file=.env.local scripts/fix-invoice-index.ts');
  process.exit(1);
}

main()
  .catch(e => {
    console.error('Erro:', e instanceof Error ? e.message : e);
    process.exit(2);
  })
  .finally(() => mongoose.disconnect());
