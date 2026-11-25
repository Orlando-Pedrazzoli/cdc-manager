// 📄 scripts/remover-medico.ts
// =============================================================================
// CDC Manager — Remover um médico criado por engano / de teste (one-off)
// -----------------------------------------------------------------------------
// 25/11/2026: o médico ativo "Portugal" (dúvida F1 do Victor) era um registo
// de teste do Orlando, que mandou excluir. A aplicação só desativa médicos
// (não apaga), para não deixar marcações e registos clínicos sem médico.
// Este script segue a mesma regra:
//   · procura o médico pelo NOME EXATO (tem de dar um só);
//   · conta tudo o que aponta para ele (qualquer campo `doctorId`, em todas
//     as coleções: marcações, registos clínicos, planos, Raio-X, etc.);
//   · SEM referências → apaga o médico;
//   · COM referências → não apaga: fica INATIVO (sai da agenda) e a lista do
//     que existe é mostrada, para decidir à mão.
// Uma conta de acesso ligada ao médico nunca é apagada aqui: é só indicada.
//
// Por omissão é SIMULAÇÃO. Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/remover-medico.ts --nome="Portugal"
//   npx tsx --env-file=.env.local scripts/remover-medico.ts --nome="Portugal" --apply
// =============================================================================

import mongoose from 'mongoose';
import Doctor from '../src/models/Doctor';
import User from '../src/models/User';
import '../src/models/Appointment';
import '../src/models/ClinicalRecord';
import '../src/models/CommissionAdjustment';
import '../src/models/DoctorPayAdjustment';
import '../src/models/Employee';
import '../src/models/ExpiryItem';
import '../src/models/LabCase';
import '../src/models/LegacyInvoice';
import '../src/models/Procedure';
import '../src/models/Recall';
import '../src/models/RxRequest';
import '../src/models/SignatureRequest';
import '../src/models/TreatmentPlan';
import '../src/models/Waitlist';

function arg(flag: string): string | null {
  const raw = process.argv.find(a => a.startsWith(`--${flag}=`));
  return raw ? raw.slice(flag.length + 3).trim() : null;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  const name = arg('nome');
  if (!name) throw new Error('Falta --nome="…" (nome exato do médico).');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri);
  console.log(apply ? '⚠ MODO GRAVAÇÃO (--apply)' : 'SIMULAÇÃO — nada é gravado (usar --apply para gravar)');

  const matches = await Doctor.find({ name }).select('name active').lean();
  if (matches.length !== 1) {
    console.log(`Encontrados ${matches.length} médicos com o nome exato "${name}". Nada foi feito.`);
    await mongoose.disconnect();
    return;
  }
  const doctor = matches[0];
  const id = doctor._id;
  console.log(`médico: ${doctor.name} · ${doctor.active ? 'ativo' : 'inativo'} · ${String(id)}`);

  // tudo o que aponta para ele, em qualquer coleção
  let total = 0;
  for (const model of Object.values(mongoose.models)) {
    if (model.modelName === Doctor.modelName) continue;
    const paths: string[] = [];
    model.schema.eachPath(p => {
      if (p === 'doctorId' || p.endsWith('.doctorId')) paths.push(p);
    });
    for (const p of paths) {
      const n = await model.countDocuments({ [p]: id });
      if (n > 0) {
        total += n;
        console.log(`  ${model.modelName}.${p}: ${n}`);
      }
    }
  }
  const account = await User.findOne({ doctorId: id }).select('name email username role').lean();
  if (account) {
    console.log(
      `  conta de acesso ligada: ${account.name ?? ''} (${account.email ?? (account as { username?: string }).username ?? 'sem e-mail'}) — NÃO é apagada por este script`,
    );
  }
  console.log(`referências: ${total}`);

  if (total === 0) {
    console.log('→ sem referências: o médico é APAGADO.');
    if (apply) {
      await Doctor.deleteOne({ _id: id });
      console.log('✓ médico apagado');
    }
  } else {
    console.log('→ com referências: o médico NÃO é apagado; fica INATIVO (sai da agenda).');
    if (apply && doctor.active) {
      await Doctor.updateOne({ _id: id }, { $set: { active: false } });
      console.log('✓ médico desativado');
    } else if (apply) {
      console.log('já estava inativo: nada a gravar');
    }
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
