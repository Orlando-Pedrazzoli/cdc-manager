// 📄 scripts/padronizar-titulos-medicos.ts
// =============================================================================
// CDC Manager — Padronizar os nomes dos médicos com "Dr." / "Dra." (one-off)
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta F3): "Sim, padroniza todos com Dr./Dra."
// Regras em src/lib/doctor-title.ts:
//   · título já existente noutra forma ("Dra", "DR.", "Drª") → "Dr." / "Dra."
//   · sem título → acrescenta pelo primeiro nome, só quando não há dúvida
//   · sem certeza (ex.: a coluna "Portugal") → NÃO altera; fica na lista
//     "por decidir" e resolve-se na ficha do médico ou com --dr / --dra
// Só mexe em Doctor.name (o nome das agendas). O "Nome completo
// (documentos)" não é alterado.
//
// Por omissão é SIMULAÇÃO. Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/padronizar-titulos-medicos.ts
//   npx tsx --env-file=.env.local scripts/padronizar-titulos-medicos.ts --apply
// Para os casos por decidir (parte do nome, separados por vírgula):
//   npx tsx --env-file=.env.local scripts/padronizar-titulos-medicos.ts --dra="Geane,Lays" --dr="Eder" --apply
// =============================================================================

import mongoose from 'mongoose';
import Doctor from '../src/models/Doctor';
import { standardDoctorName, type DoctorTitle } from '../src/lib/doctor-title';

const plain = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function listArg(flag: string): string[] {
  const raw = process.argv.find(a => a.startsWith(`--${flag}=`));
  if (!raw) return [];
  return raw
    .slice(flag.length + 3)
    .split(',')
    .map(s => plain(s.trim()))
    .filter(Boolean);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  const apply = process.argv.includes('--apply');
  const forceDr = listArg('dr');
  const forceDra = listArg('dra');
  await mongoose.connect(uri);

  const doctors = await Doctor.find({}).select('name active').lean();
  doctors.sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt'),
  );

  console.log(apply ? '⚠ MODO GRAVAÇÃO (--apply)' : 'SIMULAÇÃO — nada é gravado (usar --apply para gravar)');
  const changes: { id: string; name: string }[] = [];
  const pending: string[] = [];
  for (const d of doctors) {
    const key = plain(d.name);
    const forced: DoctorTitle | null = forceDra.some(f => key.includes(f))
      ? 'Dra.'
      : forceDr.some(f => key.includes(f))
        ? 'Dr.'
        : null;
    const r = standardDoctorName(d.name, forced);
    const tag = d.active ? '' : ' [inativo]';
    if (r.outcome === 'unknown') {
      pending.push(`${d.name}${tag}`);
    } else if (r.name !== d.name) {
      changes.push({ id: String(d._id), name: r.name });
      console.log(`  ${d.name}  →  ${r.name}${tag}`);
    } else {
      console.log(`  ${d.name}  (mantém)${tag}`);
    }
  }
  console.log(`\nmédicos: ${doctors.length} · a alterar: ${changes.length} · por decidir: ${pending.length}`);
  if (pending.length > 0) {
    console.log('POR DECIDIR (não alterados — usar --dr="…" / --dra="…" ou corrigir na ficha):');
    for (const p of pending) console.log(`  ? ${p}`);
  }
  if (apply && changes.length > 0) {
    await Doctor.bulkWrite(
      changes.map(c => ({
        updateOne: { filter: { _id: c.id }, update: { $set: { name: c.name } } },
      })),
      { ordered: false },
    );
    console.log(`✓ ${changes.length} médicos atualizados`);
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
