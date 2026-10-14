// 📄 scripts/import-orientacoes.ts
// =============================================================================
// CDC Manager — Importa/atualiza as orientações pós-procedimento da clínica
// (3.ª reunião, 09/10/2026: documentos 06, 07 e 08 enviados por Victor Ruiz,
// "substituem as anteriores").
//
// · Upsert por `key`: correr de novo SUBSTITUI o texto pelo da versão no
//   código (é o ponto de verdade da clínica, não a edição manual).
// · Desativa o modelo antigo 'pos-operatorio-extracao' (fica no histórico
//   dos documentos já emitidos; não é apagado).
// · Seguro em produção: não toca em mais nenhum modelo.
//
// Uso (PowerShell, na raiz do projeto):
//   npx tsx --env-file=.env.local scripts/import-orientacoes.ts
// =============================================================================

import mongoose from 'mongoose';
import DocumentTemplate from '../src/models/DocumentTemplate';
import {
  ORIENTACOES_POS_PROCEDIMENTO,
  ORIENTACOES_SUBSTITUEM,
} from '../src/lib/data/orientacoes-pos-procedimento';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error('MONGODB_URI não definida (usa --env-file ou a env).');
  await mongoose.connect(uri);

  for (const t of ORIENTACOES_POS_PROCEDIMENTO) {
    const res = await DocumentTemplate.updateOne(
      { key: t.key },
      {
        $set: {
          kind: t.kind,
          title: t.title,
          body: t.body,
          active: true,
        },
        // Orientações: o médico entrega; a receção também pode imprimir.
        // Não exigem assinatura (não são consentimentos).
        $setOnInsert: { allowStaff: true, requiresSignature: false },
      },
      { upsert: true },
    );
    console.log(
      `${res.upsertedCount ? 'criado   ' : 'atualizado'}  ${t.key}  — ${t.title}`,
    );
  }

  const old = await DocumentTemplate.updateMany(
    { key: { $in: ORIENTACOES_SUBSTITUEM }, active: true },
    { $set: { active: false } },
  );
  if (old.modifiedCount)
    console.log(
      `desativado  ${ORIENTACOES_SUBSTITUEM.join(', ')}  (substituído)`,
    );

  const n = await DocumentTemplate.countDocuments({
    kind: 'pos-operatorio',
    active: true,
  });
  console.log(`\nOrientações pós-procedimento ativas: ${n}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
