// 📄 scripts/migracao/01-treatment-types.ts
// =============================================================================
// Passo 1 — reconcilia a tabela de atos do Dentoral (tabelat) com o catálogo
// do CDC (treatmenttypes, já importado em ago/2026 com dentoralCode).
//
// Fonte canónica: tabelat com Entidade = 12 (tabela de preços em uso em 2026).
// Códigos usados em tratexec/doclin/planotrat que NÃO estão na tabela 12
// vêm da tabela mais recente onde existam (11 → 10 → 0).
//
// Para cada CodT:
//   · existe TreatmentType com dentoralCode = CodT → nada a fazer (regista
//     no mapa; com --update actualiza category/recallIntervalMonths se vazios)
//   · não existe → cria INACTIVO (active:false, source:'imported') para que
//     procedures/planos antigos tenham referência. A clínica activa se quiser.
// =============================================================================

import { runScript, q, cents, str, yn, log, upsertByLegacyId, type UpsertStats } from './lib/common';

/** tipot.DescTipoTT → SPECIALTIES (lib/domain) */
const CATEGORY_TO_SPECIALTY: Record<string, string> = {
  'CIRURGIA ORAL': 'cirurgia-oral',
  'CONSULTAS': 'dentisteria',
  'DENTISTERIA OPERATORIA': 'dentisteria',
  'DIVERSOS DE PROTESE': 'proteses-dentarias',
  'ENDODONTIA - SESSAO MULTIPLA': 'endodontia',
  'ENDODONTIA - SESSAO UNICA': 'endodontia',
  'HARMONIZAÇÃO OROFACIAL': 'harmonizacao-orofacial',
  'IMAGIOLOGIA': 'imagiologia',
  'IMPLANTOLOGIA': 'implantologia',
  'MEDICINA DENTARIA PREVENTIVA': 'higiene-oral',
  'MICROCIRURGIA ENDODÔNTICA': 'endodontia',
  'OCLUSAO': 'dentisteria',
  'ORTODONTIA': 'ortodontia',
  'PERIODONTOLOGIA': 'periodontologia',
  'PROTESE ACRILICA': 'proteses-dentarias',
  'PROTESE CROMO COBALTO': 'proteses-dentarias',
  'PROTESE EM NYLON': 'proteses-dentarias',
  'PROTESE EM TITANIO': 'proteses-dentarias',
  'PROTESE FIXA': 'proteses-dentarias',
  'RETRATAMENTO - SESSAO MULTIPLA': 'endodontia',
  'RETRATAMENTO - SESSAO UNICA': 'endodontia',
  'TRATAMENTO FACIAL': 'harmonizacao-orofacial',
};

export function slugFromCode(code: string): string {
  return (
    'dentoral-' +
    code
      .toLowerCase()
      .replace(/»/g, '-')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

type Row = {
  CodT: string;
  Entidade: number;
  Abrev: string | null;
  NomeT: string | null;
  Desactivar: string;
  TipoTrat: number;
  DescTipoTT: string | null;
  ValEntid: string;
  ValBenef: string;
  Meses: number;
  AutorizaRX: string;
  TiraDente: string;
  CodE: string | null;
  Factura: string;
};

await runScript('01-treatment-types', async args => {
  const { TreatmentType } = await import('@/models');

  // 1. tabela canónica (12) + códigos de outras tabelas que foram usados
  const rows = await q<Row>(`
    SELECT t.CodT, t.Entidade, t.Abrev, t.NomeT, t.Desactivar, t.TipoTrat, tt.DescTipoTT,
           t.ValEntid, t.ValBenef, t.Meses, t.AutorizaRX, t.TiraDente, t.CodE, t.Factura
    FROM tabelat t LEFT JOIN tipot tt ON tt.TipoTrat = t.TipoTrat
    WHERE t.Entidade = 12
    UNION ALL
    SELECT t.CodT, t.Entidade, t.Abrev, t.NomeT, t.Desactivar, t.TipoTrat, tt.DescTipoTT,
           t.ValEntid, t.ValBenef, t.Meses, t.AutorizaRX, t.TiraDente, t.CodE, t.Factura
    FROM tabelat t LEFT JOIN tipot tt ON tt.TipoTrat = t.TipoTrat
    WHERE t.Entidade <> 12
      AND t.CodT NOT IN (SELECT CodT FROM tabelat WHERE Entidade = 12)
      AND (t.CodT IN (SELECT DISTINCT Trat FROM tratexec)
        OR t.CodT IN (SELECT DISTINCT CodTT FROM doclin)
        OR t.CodT IN (SELECT DISTINCT Trat FROM planotrat))
    ORDER BY CodT, Entidade DESC`);

  // dedupe por CodT (prioridade: 12, depois a entidade mais alta)
  const byCode = new Map<string, Row>();
  for (const r of rows) {
    const code = String(r.CodT).trim();
    if (!code) continue;
    if (!byCode.has(code) || Number(r.Entidade) === 12) byCode.set(code, r);
  }
  log(`tabelat: ${rows.length} linhas → ${byCode.size} códigos distintos`);

  // 2. catálogo CDC actual
  const existing = await TreatmentType.find({ dentoralCode: { $type: 'string' } }, { dentoralCode: 1, category: 1, recallIntervalMonths: 1, slug: 1 }).lean();
  const existingByCode = new Map(existing.map(e => [String(e.dentoralCode), e]));
  const existingSlugs = new Set((await TreatmentType.find({}, { slug: 1 }).lean()).map(e => e.slug));
  log(`CDC: ${existing.length} atos com dentoralCode`);

  const stats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let matched = 0;
  const toCreate: Record<string, any>[] = [];
  const unmatchedSample: string[] = [];

  for (const [code, r] of byCode) {
    if (existingByCode.has(code)) {
      matched++;
      continue;
    }
    const category = str(r.DescTipoTT, 60);
    const specialty = (category && CATEGORY_TO_SPECIALTY[category]) || 'dentisteria';
    const name = str(r.NomeT, 160) ?? str(r.Abrev, 160) ?? `Ato Dentoral ${code}`;
    let slug = slugFromCode(code);
    let n = 2;
    while (existingSlugs.has(slug)) slug = `${slugFromCode(code)}-${n++}`;
    existingSlugs.add(slug);
    const price = cents(r.ValBenef) > 0 ? cents(r.ValBenef) : cents(r.ValEntid);
    if (unmatchedSample.length < 15) unmatchedSample.push(`${code} · ${name}`);
    toCreate.push({
      legacyId: code, // keyField = dentoralCode (ver abaixo)
      slug,
      name,
      specialty,
      entityCode: str(r.CodE, 20),
      category,
      controlsTooth: yn(r.TiraDente),
      requiresRxConsent: yn(r.AutorizaRX),
      durationMin: 30,
      bufferMin: 10,
      bookableOnline: false,
      requiresEvaluation: true,
      priceCents: price,
      costCents: 0,
      bom: [],
      recallIntervalMonths: Number(r.Meses) >= 1 && Number(r.Meses) <= 60 ? Number(r.Meses) : null,
      priceHistory: [],
      source: 'imported',
      notes: `Importado do Dentoral (tabela ${r.Entidade}${yn(r.Desactivar) ? ', desactivado no Dentoral' : ''}) — não constava do catálogo CDC.`,
      active: false,
      createdAt: new Date(),
    });
  }

  log(`match por dentoralCode: ${matched}; a criar (inactivos): ${toCreate.length}`);
  if (unmatchedSample.length) log('amostra dos não encontrados:', { codes: unmatchedSample });

  // keyField = dentoralCode (único/sparse no schema) — a função usa o nome
  // do campo chave que lhe passarmos; aqui o "legacyId" É o dentoralCode
  const docs = toCreate.map(({ legacyId, ...rest }) => ({ dentoralCode: legacyId, ...rest }));
  for (let i = 0; i < docs.length; i += args.batch) {
    await upsertByLegacyId(TreatmentType, docs.slice(i, i + args.batch), args, stats, 'dentoralCode');
  }
  log('treatmenttypes', stats);
});
