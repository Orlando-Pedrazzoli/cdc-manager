// 📄 scripts/import-precos.ts
// =============================================================================
// CDC Manager — Importação da matriz REAL de preços (Dentoral → MongoDB)
// -----------------------------------------------------------------------------
// Fonte: scripts/data/tab-precos-colombo.json — gerado a partir de
// Tab_preços_colombo.xls (report do Dentoral 6.7.11.5, Victor Ruiz, ago/2026).
// O JSON é a fonte canónica versionada: 749 atos, 22 categorias, preços já
// em CÊNTIMOS INTEIROS, entityCode limpo ('**********'/vazio → null).
//
// Uso:
//   npx tsx --env-file=.env.local scripts/import-precos.ts --dry-run
//   npx tsx --env-file=.env.local scripts/import-precos.ts
//
// Regras (alinhadas com as convenções do projeto):
//   · IDEMPOTENTE: upsert por dentoralCode (código interno 001-748, ÚNICO).
//     entityCode NÃO serve de chave — 78 nomenclaturas duplicadas na tabela
//     real (o mesmo ato existe em endo sessão única/múltipla/retratamentos).
//   · NUNCA APAGA nada: os 47 atos do seed (benchmark) ficam intactos — a
//     demo depende deles; o Victor decide no catálogo o que fica ativo.
//   · source='imported' → banner amarelo no catálogo até a clínica marcar
//     «confirmado». Re-execuções NÃO tocam em atos já 'clinic-confirmed'
//     (as edições do Victor vencem sempre o import).
//   · Duração default 30+10 min (o Excel não traz durações); recall null;
//     controlsTooth/requiresRxConsent false — o Victor define no catálogo.
//   · --dry-run: relatório completo (contagens por categoria têm de bater
//     749/22) sem escrever um único byte na base de dados.
// =============================================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dbConnect } from '@/lib/mongodb';
import TreatmentType from '@/models/TreatmentType';
import {
  SPECIALTIES,
  TREATMENT_CATEGORIES,
  type Specialty,
} from '@/lib/domain';

// --- Tipos do JSON canónico --------------------------------------------------

type ImportItem = {
  dentoralCode: string;
  slug: string;
  name: string;
  entityCode: string | null;
  category: string;
  // Garantido pertencer ao enum em loadAndValidate (aborta se não)
  specialty: Specialty;
  priceCents: number;
  // O Dentoral embutia o texto legal do consentimento RX NO NOME do ato
  // (31 atos de IMAGIOLOGIA, art. 101º do DL 108/2018). Na geração do JSON
  // o nome foi limpo, o texto legal preservado em notes, e a flag ligada.
  requiresRxConsent: boolean;
  notes: string | null;
};

type ImportFile = {
  source: string;
  count: number;
  items: ImportItem[];
};

const EXPECTED_COUNT = 749;
const EXPECTED_CATEGORIES = 22;
const DEFAULT_DURATION_MIN = 30;
const DEFAULT_BUFFER_MIN = 10;

const dryRun = process.argv.includes('--dry-run');

// --- Validação do dataset (falha cedo, antes de tocar na BD) -----------------

function loadAndValidate(): ImportItem[] {
  const filePath = path.join(
    process.cwd(),
    'scripts',
    'data',
    'tab-precos-colombo.json',
  );
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as ImportFile;
  const items = parsed.items;

  const problems: string[] = [];

  if (items.length !== EXPECTED_COUNT) {
    problems.push(`Contagem: ${items.length} ≠ ${EXPECTED_COUNT} esperados`);
  }

  const codes = new Set<string>();
  const slugs = new Set<string>();
  const categories = new Set<string>();
  const specialtySet = new Set<string>(SPECIALTIES);

  for (const it of items) {
    // '743-01' = sub-código real do Dentoral (variantes do mesmo ato);
    // hífenes soltos e '»' foram normalizados na geração do JSON
    if (!/^\d{3}(-\d{2})?$/.test(it.dentoralCode)) {
      problems.push(`dentoralCode inválido: '${it.dentoralCode}'`);
    }
    if (codes.has(it.dentoralCode)) {
      problems.push(`dentoralCode duplicado: ${it.dentoralCode}`);
    }
    codes.add(it.dentoralCode);

    if (slugs.has(it.slug)) problems.push(`slug duplicado: ${it.slug}`);
    slugs.add(it.slug);

    if (!it.name.trim()) problems.push(`nome vazio em ${it.dentoralCode}`);
    // Limites do model (maxlength 160/500) — falhar AQUI, não a meio do
    // import (lição do primeiro run: nome de 165 ch rebentou no doc ~687)
    if (it.name.length > 160) {
      problems.push(
        `nome >160 ch em ${it.dentoralCode} (${it.name.length} ch)`,
      );
    }
    if (it.notes !== null && it.notes.length > 500) {
      problems.push(`notes >500 ch em ${it.dentoralCode}`);
    }
    if (!Number.isInteger(it.priceCents) || it.priceCents < 0) {
      problems.push(
        `preço inválido em ${it.dentoralCode}: ${it.priceCents} cêntimos`,
      );
    }
    if (!specialtySet.has(it.specialty)) {
      problems.push(
        `especialidade fora do enum em ${it.dentoralCode}: '${it.specialty}'`,
      );
    }
    categories.add(it.category);
  }

  if (categories.size !== EXPECTED_CATEGORIES) {
    problems.push(
      `Categorias: ${categories.size} ≠ ${EXPECTED_CATEGORIES} esperadas`,
    );
  }
  const known = new Set<string>(TREATMENT_CATEGORIES);
  for (const c of categories) {
    if (!known.has(c)) problems.push(`categoria fora da lista canónica: ${c}`);
  }

  if (problems.length > 0) {
    console.error('❌ Dataset inválido — importação ABORTADA:');
    for (const p of problems) console.error('   ·', p);
    process.exit(1);
  }

  return items;
}

// --- Relatório (dry-run e pós-import) ----------------------------------------

function printReport(items: ImportItem[]) {
  const byCategory = new Map<string, number>();
  let zeroPrice = 0;
  let noEntityCode = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const it of items) {
    byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + 1);
    if (it.priceCents === 0) zeroPrice++;
    if (!it.entityCode) noEntityCode++;
    if (it.priceCents < min) min = it.priceCents;
    if (it.priceCents > max) max = it.priceCents;
  }

  console.log(`\n📊 Dataset: ${items.length} atos, ${byCategory.size} tipos`);
  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of sorted) {
    console.log(`   ${String(n).padStart(4)}  ${cat}`);
  }
  console.log(
    `\n   Preços: ${(min / 100).toFixed(2)} € — ${(max / 100).toFixed(2)} €`,
  );
  console.log(`   Atos a 0 €: ${zeroPrice} (importados ATIVOS — decisão`);
  console.log('   reversível: o Victor desativa no catálogo se preferir)');
  console.log(`   Sem código de nomenclatura: ${noEntityCode}`);
  const rxCount = items.filter(i => i.requiresRxConsent).length;
  console.log(
    `   Atos RX c/ consentimento embutido no nome (Dentoral) → flag: ${rxCount}`,
  );

  console.log('\n🔎 Amostras (conferir com o print do Dentoral):');
  const sampleIdx = [0, 99, 374, 599, items.length - 1];
  for (const i of sampleIdx) {
    const it = items[i];
    console.log(
      `   ${it.dentoralCode} | ${it.name.slice(0, 52).padEnd(52)} | ` +
        `${it.category.slice(0, 26).padEnd(26)} | ${(it.priceCents / 100).toFixed(2)} €`,
    );
  }
}

// --- Import (upsert idempotente) ----------------------------------------------

async function runImport(items: ImportItem[]) {
  await dbConnect();

  let created = 0;
  let updated = 0;
  let skippedConfirmed = 0;
  let unchanged = 0;

  for (const it of items) {
    const existing = await TreatmentType.findOne({
      dentoralCode: it.dentoralCode,
    });

    if (!existing) {
      await TreatmentType.create({
        slug: it.slug,
        name: it.name,
        specialty: it.specialty,
        category: it.category,
        entityCode: it.entityCode,
        dentoralCode: it.dentoralCode,
        durationMin: DEFAULT_DURATION_MIN,
        bufferMin: DEFAULT_BUFFER_MIN,
        // Conservador: nada de importado aparece no formulário público
        // até o Victor rever (durações são defaults, não reais)
        bookableOnline: false,
        requiresEvaluation: true,
        priceCents: it.priceCents,
        costCents: 0,
        controlsTooth: false,
        requiresRxConsent: it.requiresRxConsent,
        recallIntervalMonths: null,
        source: 'imported',
        notes: it.notes,
        active: true,
      });
      created++;
      continue;
    }

    // Edições da clínica vencem SEMPRE o re-import
    if (existing.source === 'clinic-confirmed') {
      skippedConfirmed++;
      continue;
    }

    // Re-execução: atualiza os campos que VÊM DO EXCEL/JSON (nunca duração
    // nem flags manuais como controlsTooth — podem ter sido mexidas pelo
    // Victor sem confirmar). requiresRxConsent e notes ENTRAM aqui porque
    // no dataset são dados de origem (consentimento RX que o Dentoral
    // embutia no nome) — necessário para reparar os docs criados no
    // primeiro run interrompido, que ficaram com o nome sujo e sem flag.
    const changes: Record<string, unknown> = {};
    if (existing.name !== it.name) changes.name = it.name;
    if (existing.priceCents !== it.priceCents)
      changes.priceCents = it.priceCents;
    if (existing.category !== it.category) changes.category = it.category;
    if (existing.entityCode !== it.entityCode)
      changes.entityCode = it.entityCode;
    if (existing.requiresRxConsent !== it.requiresRxConsent)
      changes.requiresRxConsent = it.requiresRxConsent;
    if ((existing.notes ?? null) !== it.notes) changes.notes = it.notes;

    if (Object.keys(changes).length === 0) {
      unchanged++;
      continue;
    }
    existing.set(changes);
    await existing.save();
    updated++;
  }

  const total = await TreatmentType.countDocuments({});
  const imported = await TreatmentType.countDocuments({
    dentoralCode: { $ne: null },
  });

  console.log('\n✅ Importação concluída:');
  console.log(`   Criados:                 ${created}`);
  console.log(`   Atualizados:             ${updated}`);
  console.log(`   Inalterados:             ${unchanged}`);
  console.log(`   Protegidos (confirmados): ${skippedConfirmed}`);
  console.log(`   Total com dentoralCode:  ${imported} (esperado 749)`);
  console.log(`   Total na coleção:        ${total} (749 + seed/manuais)`);

  if (imported !== EXPECTED_COUNT) {
    console.error('\n⚠️  CONTAGEM NÃO BATE — investigar antes de prosseguir!');
    process.exit(1);
  }
}

// --- Main ---------------------------------------------------------------------

async function main() {
  console.log(
    `CDC Manager — importação da matriz de preços ${dryRun ? '(DRY-RUN — nada será gravado)' : ''}`,
  );

  const items = loadAndValidate();
  printReport(items);

  if (dryRun) {
    console.log('\n🏁 Dry-run terminado. Nenhuma escrita na base de dados.');
    console.log(
      '   Se as contagens e amostras batem com o Dentoral, correr sem --dry-run.',
    );
    process.exit(0);
  }

  await runImport(items);
  process.exit(0);
}

main().catch(err => {
  console.error('Importação falhou:', err);
  process.exit(1);
});
