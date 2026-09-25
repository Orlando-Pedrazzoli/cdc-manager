// 📄 scripts/fix-confirm-token-index.ts
// =============================================================================
// CDC Manager — Correção one-off do índice `appointments.confirmToken_1`
// -----------------------------------------------------------------------------
// O índice antigo (unique + sparse) rejeitava a 2.ª marcação sem token —
// urgências/walk-in e marcações do seed — com E11000 dup key
// { confirmToken: null }: o schema grava `null` explicitamente e um índice
// sparse inclui documentos com null (só exclui os que NÃO têm o campo).
// Este script apaga-o e cria o índice parcial declarado em
// src/models/Appointment.ts (só docs cujo confirmToken é string).
// Correr UMA vez contra cada base (dev e produção):
//   npx tsx --env-file=.env.local scripts/fix-confirm-token-index.ts
// Idempotente: se o índice antigo já não existir, só sincroniza.
// =============================================================================

import mongoose from 'mongoose';
import Appointment from '../src/models/Appointment';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('appointments');

  const existing = await col.indexes();
  const old = existing.find(i => i.name === 'confirmToken_1');
  if (old && !old.partialFilterExpression) {
    await col.dropIndex('confirmToken_1');
    console.log('✓ índice antigo confirmToken_1 (sparse) apagado');
  } else {
    console.log('· índice antigo não encontrado ou já parcial — nada a apagar');
  }

  await Appointment.syncIndexes();
  const after = await col.indexes();
  const fixed = after.find(i => i.name === 'confirmToken_1');
  console.log(
    fixed?.partialFilterExpression
      ? '✓ índice parcial criado: ' +
          JSON.stringify(fixed.partialFilterExpression)
      : '✗ índice parcial NÃO encontrado — verificar',
  );

  const withoutToken = await col.countDocuments({ confirmToken: null });
  console.log(`· marcações sem token na base: ${withoutToken}`);

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
