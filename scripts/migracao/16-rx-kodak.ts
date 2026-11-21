// 📄 scripts/migracao/16-rx-kodak.ts
// =============================================================================
// Passo 16 — rx_kodak → Patient.kodakFolder (pasta do paciente no Kodak)
//
// O Kodak / CS Imaging identifica o paciente pela PASTA de imagens
// (<raiz>\<inicial>.RVG\<código>), não pelo n.º de processo. A ligação
// paciente → pasta só existe na tabela rx_kodak do Dentoral:
//
//   rx_kodak(refclinica, pac, folder)   pac = paciente.PMecano
//
// Este passo copia o código para Patient.kodakFolder — é o que faz aparecer
// o botão "Abrir no Kodak" na ficha e na consulta (src/lib/rx-launch.ts).
//
// · SIMULAÇÃO por omissão: só lê e conta. `--apply` grava.
// · Só preenche fichas SEM pasta; com `--update` corrige as que diferem.
//   Nunca apaga uma pasta já atribuída.
// · Pastas PARTILHADAS (o mesmo código em mais de um paciente no Dentoral)
//   ficam DE FORA por omissão: abrir o Kodak nessas fichas mostraria as
//   radiografias de outra pessoa. O relatório lista-as (código × n.º de
//   pacientes) para a clínica decidir; `--partilhadas` inclui-as.
// · `--clinica N` escolhe o refclinica (por omissão 1 = Colombo). O arquivo
//   Kodak da Buraca é outro (\\192.30.20.1\nntburaca\raiox) e não entra aqui.
// · `--pastas <rx-pastas.csv>` (opcional): cruza com o inventário tirado no
//   PC RAIOX (colunas Inicial,Pasta,…) e diz quantos códigos não têm pasta
//   no disco. Informativo — não impede a migração (o Dentoral atribui o
//   código antes de a pasta existir).
// · No fim, relatório do PRXLink (código do iRYS): confirma que é sempre
//   "P" + n.º de processo com 7 dígitos, que é o que o botão do iRYS envia.
//
// Correr (MySQL local do Dentoral a correr, .env.local com as duas ligações):
//   npx tsx --env-file=.env.local scripts/migracao/16-rx-kodak.ts
//   npx tsx --env-file=.env.local scripts/migracao/16-rx-kodak.ts --apply
//
// A cópia do Dentoral é de 03/11/2026 e a clínica continua a criar pastas:
// voltar a correr (é idempotente) com a extração final, no dia da passagem.
// =============================================================================

import { readFileSync } from 'node:fs';
import { runScript, q, log, loadLegacyMap } from './lib/common';
import { normalizeKodakFolder } from '../../src/lib/rx-launch';

type Row = { pac: number; folder: string | null };

void runScript('16-rx-kodak', async args => {
  const { Patient } = await import('@/models');
  const apply = args.flags['apply'] === true && !args.dryRun;
  const clinica = Number(args.flags['clinica'] ?? 1);

  // --- 1. Ler e limpar a rx_kodak ------------------------------------------
  const rows = await q<Row>('SELECT pac, folder FROM rx_kodak WHERE refclinica = ? ORDER BY pac', [clinica]);
  const byPac = new Map<number, string>();
  const invalid: string[] = [];
  let repeatedPac = 0;
  for (const r of rows) {
    const code = normalizeKodakFolder(r.folder);
    if (!code) {
      invalid.push(String(r.folder ?? ''));
      continue;
    }
    const pac = Number(r.pac);
    if (byPac.has(pac) && byPac.get(pac) !== code) repeatedPac++;
    byPac.set(pac, code); // a última linha do paciente prevalece
  }
  const perFolder = new Map<string, number>();
  for (const code of byPac.values()) perFolder.set(code, (perFolder.get(code) ?? 0) + 1);
  const sharedList = [...perFolder.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const sharedCodes = new Set(sharedList.map(([code]) => code));
  const includeShared = args.flags['partilhadas'] === true;
  log(`rx_kodak (refclinica ${clinica}): ${rows.length} linhas → ${byPac.size} pacientes, ${perFolder.size} pastas distintas`, {
    formatoInvalido: invalid.length,
    exemplosInvalidos: [...new Set(invalid)].slice(0, 8),
    pacientesComMaisDeUmaPasta: repeatedPac,
    pastasPartilhadas: sharedList.length,
    soNumericas: [...perFolder.keys()].filter(c => /^\d+$/.test(c)).length,
  });
  if (sharedList.length) {
    log(`pastas partilhadas (${includeShared ? 'INCLUÍDAS' : 'ficam de fora'}): código × pacientes`, {
      pacientesAbrangidos: sharedList.reduce((a, [, n]) => a + n, 0),
      lista: sharedList.slice(0, 40).map(([code, n]) => `${code}×${n}`),
    });
  }

  // --- 2. Cruzar com o inventário do disco (opcional) ----------------------
  const csv = args.flags['pastas'];
  if (typeof csv === 'string') {
    const onDisk = new Set<string>();
    for (const line of readFileSync(csv, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
      if (cols[1]) onDisk.add(cols[1].toLocaleUpperCase('pt-PT'));
    }
    const missing = [...perFolder.keys()].filter(c => !onDisk.has(c));
    log(`inventário ${csv}: ${onDisk.size} pastas no disco`, {
      codigosSemPastaNoDisco: missing.length,
      exemplos: missing.slice(0, 8),
      pastasNoDiscoSemPaciente: [...onDisk].filter(c => !perFolder.has(c)).length,
    });
  }

  // --- 3. Aplicar às fichas -------------------------------------------------
  const legacy = await loadLegacyMap(Patient);
  const current = new Map<string, string | null>();
  const cursor = Patient.find({ legacyId: /^dentoral:/ }, { kodakFolder: 1 }).lean().cursor({ batchSize: 5000 });
  for await (const p of cursor) current.set(String(p._id), (p as { kodakFolder?: string | null }).kodakFolder ?? null);

  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
  let noPatient = 0, same = 0, differ = 0, fill = 0, sharedSkipped = 0;
  for (const [pac, code] of byPac) {
    if (sharedCodes.has(code) && !includeShared) { sharedSkipped++; continue; }
    const id = legacy.get(`dentoral:${pac}`);
    if (!id) { noPatient++; continue; }
    const now = current.get(String(id)) ?? null;
    if (now === code) { same++; continue; }
    if (now && !args.update) { differ++; continue; }
    if (now) differ++; else fill++;
    ops.push({ updateOne: { filter: { _id: id }, update: { $set: { kodakFolder: code } } } });
    if (ops.length >= args.limit) break;
  }
  log(apply ? 'A gravar' : 'SIMULAÇÃO (nada foi gravado — usar --apply)', {
    aPreencher: fill,
    jaIguais: same,
    diferentes: differ,
    diferentesACorrigir: args.update ? differ : 0,
    semFichaNoCdc: noPatient,
    emPastaPartilhada: sharedSkipped,
    operacoes: ops.length,
  });
  if (apply) {
    for (let i = 0; i < ops.length; i += 1000) await Patient.bulkWrite(ops.slice(i, i + 1000), { ordered: false, timestamps: false });
    const total = await Patient.countDocuments({ kodakFolder: { $type: 'string' } });
    log(`fichas com pasta Kodak no CDC: ${total}`);
  }

  // --- 4. PRXLink (iRYS): é sempre P + processo com 7 dígitos? -------------
  const [prx] = await q<{ total: number; iguais: number }>(
    "SELECT COUNT(*) AS total, SUM(PRXLink = CONCAT('P', LPAD(PMecano, 7, '0'))) AS iguais FROM paciente WHERE PRXLink IS NOT NULL AND PRXLink <> ''",
  );
  const odd = await q<{ PMecano: number; PRXLink: string }>(
    "SELECT PMecano, PRXLink FROM paciente WHERE PRXLink IS NOT NULL AND PRXLink <> '' AND PRXLink <> CONCAT('P', LPAD(PMecano, 7, '0')) ORDER BY PMecano DESC LIMIT 10",
  );
  log('PRXLink (código do paciente no iRYS)', {
    preenchidos: Number(prx?.total ?? 0),
    iguaisAPMaisProcesso: Number(prx?.iguais ?? 0),
    diferentes: odd.map(r => `${r.PMecano}:${r.PRXLink}`),
  });
});
