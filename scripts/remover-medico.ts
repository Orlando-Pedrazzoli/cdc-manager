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
// A conta de acesso ligada ao médico não conta como referência (não é dado
// clínico). Só é apagada, junto com o médico, se for pedido com --com-conta;
// sem isso, o médico com conta ligada não é apagado.
//
// Por omissão é SIMULAÇÃO. Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/remover-medico.ts --nome="Portugal"
//   npx tsx --env-file=.env.local scripts/remover-medico.ts --nome="Portugal" --apply
// Para apagar também a conta de acesso desse médico:
//   npx tsx --env-file=.env.local scripts/remover-medico.ts --nome="Portugal" --com-conta --apply
// =============================================================================

import mongoose from 'mongoose';
import Doctor from '../src/models/Doctor';
import User from '../src/models/User';
import ActivationCode from '../src/models/ActivationCode';
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
  const withAccount = process.argv.includes('--com-conta');
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
    // a conta de acesso é tratada à parte, mais abaixo
    if (model.modelName === User.modelName) continue;
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
  const accounts = await User.find({ doctorId: id }).select('name email role').lean();
  for (const a of accounts) {
    console.log(`  conta de acesso ligada: ${a.name ?? ''} (${a.email ?? 'sem e-mail'}) · perfil ${a.role}`);
  }
  console.log(`referências clínicas e de agenda: ${total} · contas de acesso: ${accounts.length}`);

  // só se apaga uma conta de MÉDICO; outra coisa ligada a este registo é sinal
  // de que algo não é o que parece
  const foreign = accounts.filter(a => a.role !== 'doctor');
  if (total > 0) {
    console.log('→ com referências: o médico NÃO é apagado; fica INATIVO (sai da agenda).');
    if (apply && doctor.active) {
      await Doctor.updateOne({ _id: id }, { $set: { active: false } });
      console.log('✓ médico desativado');
    } else if (apply) {
      console.log('já estava inativo: nada a gravar');
    }
  } else if (foreign.length > 0) {
    console.log('→ há uma conta ligada que não é de médico: nada é apagado. Ver à mão.');
  } else if (accounts.length > 0 && !withAccount) {
    console.log('→ sem dados clínicos, mas com conta de acesso ligada: nada é apagado.');
    console.log('  Para apagar o médico E essa conta, repetir com --com-conta.');
  } else {
    console.log(
      accounts.length > 0
        ? '→ sem referências: o médico e a conta de acesso dele são APAGADOS.'
        : '→ sem referências: o médico é APAGADO.',
    );
    if (apply) {
      const userIds = accounts.map(a => a._id);
      if (userIds.length > 0) {
        await ActivationCode.deleteMany({ userId: { $in: userIds } });
        await User.deleteMany({ _id: { $in: userIds }, role: 'doctor', doctorId: id });
        console.log(`✓ ${userIds.length} conta(s) de acesso apagada(s)`);
      }
      await Doctor.deleteOne({ _id: id });
      console.log('✓ médico apagado');
    }
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
