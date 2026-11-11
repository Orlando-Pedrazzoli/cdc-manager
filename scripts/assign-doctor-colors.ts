// 📄 scripts/assign-doctor-colors.ts
// =============================================================================
// CDC Manager — Atribuir uma cor diferente a cada médico (one-off)
// -----------------------------------------------------------------------------
// 4.ª ronda (Victor, nov. 2026), ponto 04. Os médicos importados do Dentoral
// ficaram todos com a cor por omissão. Este script grava uma cor da paleta
// (src/lib/doctor-colors.ts) em cada médico que ainda a tem; quem já escolheu
// uma cor na ficha não é alterado. Médicos ativos primeiro, por ordem
// alfabética. Depois disto, cada cor pode ser mudada em Corpo Clínico → ficha
// do médico.
//
// Por omissão é SIMULAÇÃO. Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/assign-doctor-colors.ts
//   npx tsx --env-file=.env.local scripts/assign-doctor-colors.ts --apply
// =============================================================================

import mongoose from 'mongoose';
import Doctor from '../src/models/Doctor';
import { assignDistinctColors } from '../src/lib/doctor-colors';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri);

  const doctors = await Doctor.find({}).select('name color active').lean();
  doctors.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt'));
  const changes = assignDistinctColors(doctors.map(d => ({ id: String(d._id), color: d.color })));

  console.log(apply ? '⚠ MODO GRAVAÇÃO (--apply)' : 'SIMULAÇÃO — nada é gravado (usar --apply para gravar)');
  console.log(`médicos: ${doctors.length} · a receber cor nova: ${changes.size} · já com cor própria: ${doctors.length - changes.size}`);
  for (const d of doctors) {
    const next = changes.get(String(d._id));
    console.log(`  ${next ? next : (d.color ?? '—') + ' (mantém)'}  ${d.active ? '' : '[inativo] '}${d.name}`);
  }
  if (apply && changes.size > 0) {
    await Doctor.bulkWrite(
      [...changes].map(([id, color]) => ({ updateOne: { filter: { _id: id }, update: { $set: { color } } } })),
      { ordered: false },
    );
    console.log(`✓ ${changes.size} médicos atualizados`);
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
