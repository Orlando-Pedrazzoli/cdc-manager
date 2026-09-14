// 📄 scripts/fix-invoice-index.ts
// =============================================================================
// CDC Manager — Correção one-off do índice `invoices.moloniDocumentId_1`
// -----------------------------------------------------------------------------
// O índice antigo (unique + sparse) rejeitava a 2.ª fatura sem Moloni
// (E11000 dup key { moloniDocumentId: null }). Este script apaga-o e cria
// o índice parcial declarado em src/models/Invoice.ts.
// Correr UMA vez contra cada base (dev e produção):
//   npx tsx --env-file=.env.local scripts/fix-invoice-index.ts
// Idempotente: se o índice antigo já não existir, só sincroniza.
// =============================================================================

import mongoose from 'mongoose';
import Invoice from '../src/models/Invoice';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('invoices');

  const existing = await col.indexes();
  const old = existing.find(i => i.name === 'moloniDocumentId_1');
  if (old && !old.partialFilterExpression) {
    await col.dropIndex('moloniDocumentId_1');
    console.log('✓ índice antigo moloniDocumentId_1 (sparse) apagado');
  } else {
    console.log('· índice antigo não encontrado ou já parcial — nada a apagar');
  }

  await Invoice.syncIndexes();
  const after = await col.indexes();
  const fixed = after.find(i => i.name === 'moloniDocumentId_1');
  console.log(
    fixed?.partialFilterExpression
      ? '✓ índice parcial criado: ' +
          JSON.stringify(fixed.partialFilterExpression)
      : '✗ índice parcial NÃO encontrado — verificar',
  );
  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
