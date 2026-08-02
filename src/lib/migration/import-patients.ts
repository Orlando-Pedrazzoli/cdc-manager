// 📄 src/lib/migration/import-patients.ts
// =============================================================================
// CDC Manager — Migração: Pacientes do Dentoral (Colombo + Buraca)
// -----------------------------------------------------------------------------
// Importa o export de UMA instalação Dentoral de cada vez:
//
//   npx tsx --env-file=.env.local src/lib/migration/import-patients.ts \
//       colombo ./exports/pacientes-colombo.csv --dry-run
//
//   argumentos:
//     1º  origem: 'colombo' | 'buraca'  (prefixo do legacyId)
//     2º  caminho do CSV exportado
//     --dry-run          valida e reporta SEM escrever nada na BD
//     --encoding=latin1  exports Dentoral antigos vêm em Windows-1252/latin1
//
// ORDEM RECOMENDADA: primeiro o Colombo (base grande, ~86.000 — números de
// processo PRESERVADOS), depois a Buraca (renumerada acima do máximo, para
// não colidir com a numeração do Colombo).
//
// DEDUPLICAÇÃO entre bases (pacientes que usam as duas clínicas):
//   1. legacyId já importado → skip (re-execução idempotente)
//   2. NIF igual a paciente existente → MERGE (preenche só campos vazios;
//      nunca sobrepõe dados já presentes)
//   3. telefone igual + mesmo nome normalizado → MERGE (mesma pessoa sem NIF)
//   4. caso contrário → CREATE
//
// RECONCILIAÇÃO FUTURA: escreve migration-map-{origem}.json com
// { legacyId → patientId } para TODAS as linhas (incluindo merged) — é este
// mapa que as migrações de marcações/faturas por clínica vão consumir.
// Linhas rejeitadas saem em migration-rejects-{origem}.csv com o motivo.
//
// ⚠️ COLUMN_MAP: os nomes das colunas abaixo são o PALPITE típico de um
// export Dentoral — ajustar SÓ este bloco quando o ficheiro real chegar.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { dbConnect } from '@/lib/mongodb';
import '@/models';
import Patient from '@/models/Patient';
import { isValidNif, normalizePhonePT } from '@/lib/validations/patient';

// -----------------------------------------------------------------------------
// ⚠️ AJUSTAR AQUI quando o export real chegar (e SÓ aqui)
// -----------------------------------------------------------------------------
// Mapeia o conceito → possíveis cabeçalhos no CSV (primeiro que existir ganha)
const COLUMN_MAP: Record<string, string[]> = {
  processNumber: ['NumProcesso', 'Processo', 'NProcesso', 'Numero', 'N.º'],
  name: ['Nome', 'NomeCompleto', 'Paciente'],
  birthDate: ['DataNascimento', 'DtNascimento', 'Nascimento'],
  nif: ['NIF', 'NContribuinte', 'Contribuinte'],
  phone: ['Telemovel', 'TelemÃ³vel', 'Telefone', 'Tel'],
  phoneAlt: ['Telefone2', 'TelefoneAlt', 'TelFixo'],
  email: ['Email', 'EMail', 'CorreioEletronico'],
  street: ['Morada', 'Endereco', 'EndereÃ§o'],
  postalCode: ['CodPostal', 'CodigoPostal', 'CP'],
  city: ['Localidade', 'Cidade'],
  profession: ['Profissao', 'ProfissÃ£o'],
  notes: ['Observacoes', 'ObservaÃ§Ãµes', 'Obs', 'Notas'],
};
// Datas do Dentoral: normalmente 'DD-MM-YYYY' ou 'DD/MM/YYYY'
const DATE_FORMATS_DDMMYYYY = true;

// -----------------------------------------------------------------------------
// CSV parser mínimo (aspas, separador ; ou , autodetectado) — sem dependências
// -----------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n'));
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Helpers de limpeza
// -----------------------------------------------------------------------------
const clean = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' || s === '-' || s === '—' ? null : s;
};

function parseDentoralDate(v: string | null): Date | null {
  if (!v) return null;
  let y: number, m: number, d: number;
  const parts = v.split(/[-/.]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  if (DATE_FORMATS_DDMMYYYY && parts[2] > 31) {
    [d, m, y] = parts;
  } else if (parts[0] > 31) {
    [y, m, d] = parts;
  } else {
    [d, m, y] = parts;
  }
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) || date > new Date() ? null : date;
}

/** Nome normalizado para comparação (minúsculas, sem acentos, espaços únicos) */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------
type Origin = 'colombo' | 'buraca';

interface CleanRow {
  legacyId: string;
  legacyProcessNumber: number | null;
  name: string;
  nameKey: string;
  birthDate: Date | null;
  nif: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  profession: string | null;
  notes: string | null;
}

interface Reject {
  line: number;
  reason: string;
  raw: string;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const origin = args[0] as Origin;
  const filePath = args[1];
  const dryRun = args.includes('--dry-run');
  const encoding = args
    .find(a => a.startsWith('--encoding='))
    ?.split('=')[1] as BufferEncoding | undefined;

  if (!['colombo', 'buraca'].includes(origin) || !filePath) {
    console.error(
      'Uso: npx tsx --env-file=.env.local src/lib/migration/import-patients.ts <colombo|buraca> <ficheiro.csv> [--dry-run] [--encoding=latin1]',
    );
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`Ficheiro não encontrado: ${filePath}`);
    process.exit(1);
  }

  // Colombo preserva números de processo; Buraca é renumerada
  const preserveProcessNumbers = origin === 'colombo';

  console.log(`\n=== Migração de pacientes — ${origin.toUpperCase()} ===`);
  console.log(dryRun ? '(DRY-RUN: nada será escrito)\n' : '');

  // --- 1. Ler e parsear ------------------------------------------------------
  const raw = fs.readFileSync(filePath, encoding ?? 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.error('CSV sem dados (só cabeçalho ou vazio).');
    process.exit(1);
  }
  const header = rows[0].map(h => h.trim());
  const col = (concept: keyof typeof COLUMN_MAP): number => {
    for (const candidate of COLUMN_MAP[concept]) {
      const idx = header.indexOf(candidate);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const idx = {
    processNumber: col('processNumber'),
    name: col('name'),
    birthDate: col('birthDate'),
    nif: col('nif'),
    phone: col('phone'),
    phoneAlt: col('phoneAlt'),
    email: col('email'),
    street: col('street'),
    postalCode: col('postalCode'),
    city: col('city'),
    profession: col('profession'),
    notes: col('notes'),
  };
  if (idx.name === -1) {
    console.error(
      `Coluna do NOME não encontrada. Cabeçalhos no ficheiro: ${header.join(' | ')}\n→ Ajustar COLUMN_MAP no topo do script.`,
    );
    process.exit(1);
  }
  console.log(`Linhas de dados: ${rows.length - 1}`);
  console.log(
    `Colunas mapeadas: ${Object.entries(idx)
      .filter(([, i]) => i !== -1)
      .map(([k]) => k)
      .join(', ')}\n`,
  );

  // --- 2. Limpar e validar ---------------------------------------------------
  const rejects: Reject[] = [];
  const cleanRows: CleanRow[] = [];
  const seenLegacy = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (i: number) => (i === -1 ? null : clean(cells[i]));

    const name = get(idx.name);
    if (!name || name.length < 3) {
      rejects.push({
        line: r + 1,
        reason: 'nome em falta/curto',
        raw: cells.join(';'),
      });
      continue;
    }

    const legacyProcRaw = get(idx.processNumber);
    const legacyProcessNumber = legacyProcRaw
      ? Number(legacyProcRaw.replace(/\D/g, ''))
      : null;
    // legacyId: nº de processo Dentoral se existir; senão a linha do ficheiro
    const legacyId = `${origin}:${legacyProcessNumber ?? `row${r + 1}`}`;
    if (seenLegacy.has(legacyId)) {
      rejects.push({
        line: r + 1,
        reason: `legacyId duplicado no ficheiro (${legacyId})`,
        raw: cells.join(';'),
      });
      continue;
    }
    seenLegacy.add(legacyId);

    // NIF: inválido NÃO rejeita a linha — importa sem NIF e regista o motivo
    let nif = get(idx.nif)?.replace(/\D/g, '') ?? null;
    if (nif && !isValidNif(nif)) {
      rejects.push({
        line: r + 1,
        reason: `NIF inválido descartado (${nif}) — paciente importado sem NIF`,
        raw: name,
      });
      nif = null;
    }

    // Telefone: tenta o principal, depois o alternativo
    let phone: string | null = null;
    for (const i of [idx.phone, idx.phoneAlt]) {
      const candidate = get(i);
      if (candidate) {
        phone = normalizePhonePT(candidate);
        if (phone) break;
      }
    }

    const emailRaw = get(idx.email)?.toLowerCase() ?? null;
    const email = emailRaw && /^\S+@\S+\.\S+$/.test(emailRaw) ? emailRaw : null;

    cleanRows.push({
      legacyId,
      legacyProcessNumber,
      name,
      nameKey: normalizeName(name),
      birthDate: parseDentoralDate(get(idx.birthDate)),
      nif,
      phone,
      email,
      street: get(idx.street),
      postalCode: get(idx.postalCode),
      city: get(idx.city),
      profession: get(idx.profession),
      notes: get(idx.notes),
    });
  }
  console.log(
    `Válidas: ${cleanRows.length} · Avisos/rejeições: ${rejects.length}`,
  );

  // --- 3. Dedupe contra a BD -------------------------------------------------
  await dbConnect();

  const existingLegacy = new Set<string>(
    (
      await Patient.find({ legacyId: { $ne: null } })
        .select('legacyId')
        .lean()
    ).map(p => p.legacyId as string),
  );
  // Índices em memória para merge (NIF e telefone+nome)
  const existingByNif = new Map<string, { _id: unknown }>();
  const existingByPhoneName = new Map<string, { _id: unknown }>();
  const existing = await Patient.find({ status: { $ne: 'anonymized' } })
    .select('nif phone name')
    .lean();
  for (const p of existing) {
    if (p.nif) existingByNif.set(p.nif, p);
    if (p.phone)
      existingByPhoneName.set(`${p.phone}|${normalizeName(p.name)}`, p);
  }

  let maxProcess =
    (
      await Patient.findOne()
        .sort({ processNumber: -1 })
        .select('processNumber')
    )?.processNumber ?? 0;
  const usedProcess = new Set<number>(
    (await Patient.find().select('processNumber').lean()).map(
      p => p.processNumber,
    ),
  );

  type Op =
    | { kind: 'create'; row: CleanRow; processNumber: number }
    | { kind: 'merge'; row: CleanRow; targetId: string };
  const ops: Op[] = [];
  let skipped = 0;

  for (const row of cleanRows) {
    if (existingLegacy.has(row.legacyId)) {
      skipped++;
      continue; // já importado numa execução anterior
    }
    const byNif = row.nif ? existingByNif.get(row.nif) : undefined;
    const byPhone = row.phone
      ? existingByPhoneName.get(`${row.phone}|${row.nameKey}`)
      : undefined;
    const target = byNif ?? byPhone;

    if (target) {
      ops.push({ kind: 'merge', row, targetId: String(target._id) });
      continue;
    }

    // CREATE — número de processo
    let processNumber: number;
    if (
      preserveProcessNumbers &&
      row.legacyProcessNumber &&
      !usedProcess.has(row.legacyProcessNumber)
    ) {
      processNumber = row.legacyProcessNumber;
    } else {
      processNumber = ++maxProcess;
      if (preserveProcessNumbers && row.legacyProcessNumber) {
        rejects.push({
          line: 0,
          reason: `nº processo ${row.legacyProcessNumber} já ocupado → atribuído ${processNumber} (${row.legacyId})`,
          raw: row.name,
        });
      }
    }
    usedProcess.add(processNumber);
    if (processNumber > maxProcess) maxProcess = processNumber;
    ops.push({ kind: 'create', row, processNumber });

    // O novo entra nos índices de merge (dedupe dentro do próprio ficheiro)
    if (row.nif) existingByNif.set(row.nif, { _id: row.legacyId });
  }

  const creates = ops.filter(o => o.kind === 'create');
  const merges = ops.filter(o => o.kind === 'merge');
  console.log(
    `\nPlano: ${creates.length} novos · ${merges.length} fundidos com fichas existentes · ${skipped} já importados (skip)`,
  );

  // --- 4. Escrita (bulkWrite em lotes de 500) --------------------------------
  const legacyMap: Record<string, string> = {};

  if (!dryRun) {
    const BATCH = 500;
    for (let i = 0; i < creates.length; i += BATCH) {
      const slice = creates.slice(i, i + BATCH);
      const result = await Patient.bulkWrite(
        slice.map(op => ({
          insertOne: {
            document: {
              processNumber: (op as Extract<Op, { kind: 'create' }>)
                .processNumber,
              name: op.row.name,
              birthDate: op.row.birthDate,
              nif: op.row.nif,
              phone: op.row.phone,
              email: op.row.email,
              address: {
                street: op.row.street,
                postalCode: op.row.postalCode,
                city: op.row.city,
              },
              profession: op.row.profession,
              notes: op.row.notes,
              preferredChannel: 'whatsapp',
              status: 'active',
              legacyId: op.row.legacyId,
              consents: {
                dataProcessingAt: null,
                remindersAt: null,
                marketingAt: null,
              },
            },
          },
        })),
        { ordered: false },
      );
      // ids inseridos → mapa de reconciliação
      const insertedIds = result.insertedIds as Record<number, unknown>;
      slice.forEach((op, j) => {
        legacyMap[op.row.legacyId] = String(insertedIds[j]);
      });
      console.log(
        `  criados ${Math.min(i + BATCH, creates.length)}/${creates.length}`,
      );
    }

    // Merges: um a um (poucos, e cada um preenche só campos vazios)
    for (const op of merges) {
      const m = op as Extract<Op, { kind: 'merge' }>;
      const target = await Patient.findById(m.targetId);
      if (!target) continue;
      const $set: Record<string, unknown> = {};
      if (!target.nif && m.row.nif) $set.nif = m.row.nif;
      if (!target.phone && m.row.phone) $set.phone = m.row.phone;
      if (!target.email && m.row.email) $set.email = m.row.email;
      if (!target.birthDate && m.row.birthDate)
        $set.birthDate = m.row.birthDate;
      if (!target.address?.street && m.row.street)
        $set['address.street'] = m.row.street;
      if (!target.address?.postalCode && m.row.postalCode)
        $set['address.postalCode'] = m.row.postalCode;
      if (!target.address?.city && m.row.city)
        $set['address.city'] = m.row.city;
      if (!target.profession && m.row.profession)
        $set.profession = m.row.profession;
      if (m.row.notes) {
        $set.notes = target.notes
          ? `${target.notes}\n[${origin}] ${m.row.notes}`
          : m.row.notes;
      }
      if (Object.keys($set).length > 0) {
        await Patient.updateOne({ _id: target._id }, { $set });
      }
      legacyMap[m.row.legacyId] = String(target._id);
    }
  } else {
    // Dry-run: mapa aponta para placeholders
    for (const op of ops) {
      legacyMap[op.row.legacyId] =
        op.kind === 'merge' ? `MERGE→${op.targetId}` : 'CREATE';
    }
  }

  // --- 5. Relatórios em ficheiro --------------------------------------------
  const outDir = path.dirname(filePath);
  const mapFile = path.join(
    outDir,
    `migration-map-${origin}${dryRun ? '.dry' : ''}.json`,
  );
  fs.writeFileSync(mapFile, JSON.stringify(legacyMap, null, 2), 'utf8');

  const rejFile = path.join(
    outDir,
    `migration-rejects-${origin}${dryRun ? '.dry' : ''}.csv`,
  );
  fs.writeFileSync(
    rejFile,
    [
      'linha;motivo;dados',
      ...rejects.map(x => `${x.line};${x.reason};${x.raw.slice(0, 120)}`),
    ].join('\n'),
    'utf8',
  );

  console.log(`\nMapa de reconciliação: ${mapFile}`);
  console.log(`Avisos/rejeições:      ${rejFile}`);
  console.log(
    `\n${dryRun ? 'DRY-RUN concluído — nada foi escrito.' : 'Migração concluída.'}\n`,
  );
  process.exit(0);
}

main().catch(err => {
  console.error('Migração falhou:', err);
  process.exit(1);
});
