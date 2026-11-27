// 📄 scripts/import-modelos-clinica.ts
// =============================================================================
// CDC Manager — Importa os modelos de documentos enviados por Victor Ruiz a
// 27/11/2026 (9.ª ronda (c)):
//   · 56 modelos clínicos — 28 consentimentos, 2 termos, 24 orientações
//     pós-procedimento, atestado médico e encaminhamento clínico
//     (src/lib/data/modelos-clinica.ts);
//   · 4 contratos + folha de modalidades de pagamento dos alinhadores
//     (src/lib/data/contratos-clinica.ts).
//
// POR OMISSÃO SÓ SIMULA: mostra o que criaria, o que substituiria e o que já
// está igual. Só escreve com --apply.
//
// · Upsert por `key`. Um modelo que já exista com a mesma chave (as
//   orientações 06, 07 e 08 de 09/10) fica com o texto novo; quem fez
//   alterações à mão nesses três perde-as — a simulação diz quais mudam.
// · Nunca apaga nem desativa nada, a não ser com --desativar-antigos, que
//   desativa os três modelos por omissão que os novos repetem
//   (consentimento-endodontia, consentimento-cirurgia, atestado-medico).
//   Ficam no histórico; os documentos já emitidos não mudam.
// · Em modelos NOVOS: consentimentos e termos pedem assinatura e são só do
//   médico; orientações podem ser emitidas pela receção; atestado e
//   encaminhamento são só do médico. Em modelos que já existem, estas
//   opções NÃO são mexidas (são da gestão).
// · CONTRATOS (Victor, 27/11): gestão e receção emitem; dos médicos, só
//   os indicados em --medicas (por omissão "Christina,Camila,Ana Paula").
//   Cada nome tem de corresponder a exatamente UM médico ativo; se não
//   corresponder a nenhum ou a vários, esse nome fica de fora e o script
//   avisa — a gestão acerta depois em Modelos de documentos. A lista só é
//   escrita ao CRIAR o contrato: correr de novo não desfaz o que a gestão
//   tiver alterado.
//
// Uso (PowerShell, na raiz do projeto):
//   npx tsx --env-file=.env.local scripts/import-modelos-clinica.ts
//   npx tsx --env-file=.env.local scripts/import-modelos-clinica.ts --apply
//   npx tsx --env-file=.env.local scripts/import-modelos-clinica.ts --apply --desativar-antigos
//   npx tsx --env-file=.env.local scripts/import-modelos-clinica.ts --medicas="Christina,Camila,Ana Paula"
// =============================================================================

import mongoose from 'mongoose';
import DocumentTemplate from '../src/models/DocumentTemplate';
import Doctor from '../src/models/Doctor';
import { MODELOS_CLINICA } from '../src/lib/data/modelos-clinica';
import { CONTRATOS_CLINICA } from '../src/lib/data/contratos-clinica';
import {
  importAction,
  matchDoctors,
  unambiguousIds,
} from '../src/lib/template-import';

const SUBSTITUIDOS = [
  'consentimento-endodontia',
  'consentimento-cirurgia',
  'atestado-medico',
];

function arg(name: string): string | null {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const deactivateOld = process.argv.includes('--desativar-antigos');
  const wanted = (arg('medicas') ?? 'Christina,Camila,Ana Paula').split(',');

  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error('MONGODB_URI não definida (usa --env-file ou a env).');
  await mongoose.connect(uri);
  console.log(apply ? '== A APLICAR ==' : '== SIMULAÇÃO (nada é escrito) ==');

  const all = [
    ...MODELOS_CLINICA.map(t => ({ ...t, contract: false as const })),
    ...CONTRATOS_CLINICA.map(t => ({ ...t, contract: true as const })),
  ];
  const keys = all.map(t => t.key);
  if (new Set(keys).size !== keys.length) throw new Error('Chaves repetidas.');
  const tooLong = all.filter(t => t.body.length > 20_000 || t.title.length > 120);
  if (tooLong.length)
    throw new Error(`Texto ou título demasiado longo: ${tooLong.map(t => t.key).join(', ')}`);

  // --- médicas com acesso aos contratos -------------------------------------
  const doctors = (
    await Doctor.find({ active: true }).select('name').lean()
  ).map(d => ({ id: String(d._id), name: d.name }));
  const matches = matchDoctors(wanted, doctors);
  console.log('\nAcesso dos médicos aos contratos (só ao criar):');
  for (const m of matches) {
    if (m.found.length === 1) console.log(`  ✓ ${m.wanted} → ${m.found[0].name}`);
    else if (m.found.length === 0)
      console.log(`  ✗ ${m.wanted} → NENHUM médico ativo com este nome (fica de fora)`);
    else
      console.log(
        `  ✗ ${m.wanted} → ${m.found.length} médicos (fica de fora): ${m.found.map(f => f.name).join(' | ')}`,
      );
  }
  const allowedDoctorIds = unambiguousIds(matches);

  // --- modelos ----------------------------------------------------------------
  const existing = new Map(
    (
      await DocumentTemplate.find({ key: { $in: keys } })
        .select('key title body kind folder')
        .lean()
    ).map(t => [t.key, t]),
  );
  const count = { criar: 0, igual: 0, substituir: 0 };
  console.log('\nModelos:');
  for (const t of all) {
    const action = importAction(existing.get(t.key) ?? null, t);
    count[action]++;
    if (action !== 'igual')
      console.log(`  ${action.padEnd(10)} ${t.key}  — ${t.title}`);
    if (!apply || action === 'igual') continue;

    const isConsent = t.kind === 'consentimento' || t.kind === 'termo';
    await DocumentTemplate.updateOne(
      { key: t.key },
      {
        $set: {
          kind: t.kind,
          folder: t.folder,
          title: t.title,
          body: t.body,
          active: true,
        },
        $setOnInsert: t.contract
          ? {
              allowStaff: true,
              requiresSignature: t.requiresSignature,
              restrictedToDoctors: true,
              allowedDoctorIds,
            }
          : {
              allowStaff: t.kind === 'pos-operatorio',
              requiresSignature: isConsent,
            },
      },
      { upsert: true },
    );
  }
  console.log(
    `\n${apply ? 'Criados' : 'A criar'}: ${count.criar} · ${apply ? 'substituídos' : 'a substituir'}: ${count.substituir} · já iguais: ${count.igual} · total: ${all.length}`,
  );

  // --- modelos por omissão que os novos repetem --------------------------------
  const old = await DocumentTemplate.find({
    key: { $in: SUBSTITUIDOS },
    active: true,
  })
    .select('key title')
    .lean();
  if (old.length) {
    console.log(
      `\nModelos antigos que os novos repetem (${deactivateOld ? (apply ? 'desativados' : 'seriam desativados') : 'NÃO mexidos — usar --desativar-antigos'}):`,
    );
    for (const o of old) console.log(`  ${o.key}  — ${o.title}`);
    if (apply && deactivateOld)
      await DocumentTemplate.updateMany(
        { key: { $in: SUBSTITUIDOS }, active: true },
        { $set: { active: false } },
      );
  }

  const n = await DocumentTemplate.countDocuments({ active: true });
  console.log(`\nModelos ativos na base: ${n}`);
  if (!apply) console.log('Nada foi escrito. Para aplicar: --apply');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
