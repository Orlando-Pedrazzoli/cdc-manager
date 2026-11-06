// 📄 scripts/migracao/08-legacy-invoices.ts
// =============================================================================
// Passo 8 — ccorrentes + doclin (+ defdocs) → LegacyInvoice (arquivo só-leitura)
//
// · 1 LegacyInvoice por cabeçalho ccorrentes (TipDoc, Terc, DocPri).
//   legacyId = `${TipDoc}-${Terc}-${DocPri}`.
// · Linhas: doclin com o mesmo (TipDoc, Terc, NDoc).
// · Tipos de documento: lidos de defdocs se existir (mapeamento dinâmico),
//   com fallback para a tabela conhecida da clínica (série CL):
//     120 FR · 121 FT · 122 TV · 123 Recibo · 124 NC · 125 N/C regularização
//     126–129 variantes IVA 6%
// · Anulados (Anulado='Sim') ficam com voided=true (nunca se apagam —
//   obrigação legal de conservação, art. 123.º CIRC / 52.º CIVA: 10 anos).
// · Sem PDFs assinados (PDFSignDoc vazio na base) — só metadados.
// =============================================================================

import { runScript, q, str, cents, nif, postalCode, tooth, facesText, lisbonDate, yn, log, progress, upsertByLegacyId, loadLegacyMap, loadRefs, type UpsertStats } from './lib/common';
import { columns, tableExists, pick, selectAll, describeMapping } from './lib/dyn';

type Head = Record<string, any>;
type Line = Record<string, any>;

const FALLBACK_DOCTYPES: Record<number, { name: string; kind: string; series: string }> = {
  120: { name: 'Fatura-Recibo', kind: 'FR', series: 'CL' },
  121: { name: 'Fatura', kind: 'FT', series: 'CL' },
  122: { name: 'Talão de Venda', kind: 'TV', series: 'CL' },
  123: { name: 'Recibo', kind: 'OTHER', series: 'CL' },
  124: { name: 'Nota de Crédito', kind: 'NC', series: 'CL' },
  125: { name: 'Nota de Crédito (regularização)', kind: 'NC', series: 'CL' },
  126: { name: 'Fatura-Recibo IVA 6%', kind: 'FR', series: 'CL' },
  127: { name: 'Fatura IVA 6%', kind: 'FT', series: 'CL' },
  128: { name: 'Talão de Venda IVA 6%', kind: 'TV', series: 'CL' },
  129: { name: 'Nota de Crédito IVA 6%', kind: 'NC', series: 'CL' },
};

function kindFromName(name: string): string {
  const n = name.toLowerCase();
  if (/fatura.?recibo|^fr\b/.test(n)) return 'FR';
  if (/nota.*cr[eé]dito|^nc\b|n\/c/.test(n)) return 'NC';
  if (/tal[aã]o|^tv\b|venda a dinheiro|^vd\b/.test(n)) return /^vd|venda a dinheiro/.test(n) ? 'VD' : 'TV';
  if (/fatura|^ft\b/.test(n)) return 'FT';
  return 'OTHER';
}

await runScript('08-legacy-invoices', async args => {
  const { LegacyInvoice, Patient, Doctor, TreatmentType } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const doctorMap = await loadLegacyMap(Doctor);
  const ttByCode = new Map<string, any>();
  for (const t of await TreatmentType.find({ dentoralCode: { $type: 'string' } }, { dentoralCode: 1 }).lean()) ttByCode.set(String(t.dentoralCode), t._id);

  // --- tipos de documento ------------------------------------------------------
  const docTypes = new Map<number, { name: string; kind: string; series: string; atcud: string | null }>();
  for (const [k, v] of Object.entries(FALLBACK_DOCTYPES)) docTypes.set(Number(k), { ...v, atcud: null });
  if (await tableExists('defdocs')) {
    const cols = await columns('defdocs');
    const cCode = pick(cols, ['TipDoc', 'Codigo', 'Cod', 'Tipo', /tipdoc|cod/i]);
    const cName = pick(cols, ['Nome', 'Descricao', 'Designacao', 'Titulo', /nome|desc|desig|tit/i], /char|text/);
    const cSerie = pick(cols, ['Serie', /serie/i]);
    const cAtcud = pick(cols, ['ATCUD', 'CodigoValidacao', /atcud|valid/i]);
    const cSigla = pick(cols, ['Sigla', 'Abrev', 'TipoSAFT', 'TipoDoc', /sigla|abrev|saft/i]);
    describeMapping('defdocs', { codigo: cCode, nome: cName, serie: cSerie, atcud: cAtcud, sigla: cSigla });
    if (cCode && cName) {
      for (const r of await q<any>(`SELECT ${selectAll('defdocs', cols)} FROM defdocs`)) {
        const code = Number(r[cCode]);
        const name = str(r[cName]) ?? `Documento ${code}`;
        const sigla = cSigla ? str(r[cSigla]) : null;
        const kind = sigla && ['FR', 'FT', 'NC', 'TV', 'VD'].includes(sigla.toUpperCase()) ? sigla.toUpperCase() : kindFromName(name);
        docTypes.set(code, { name, kind, series: (cSerie ? str(r[cSerie]) : null) ?? FALLBACK_DOCTYPES[code]?.series ?? 'CL', atcud: cAtcud ? str(r[cAtcud]) : null });
      }
    }
  }
  log(`tipos de documento: ${docTypes.size}`);

  // --- cabeçalhos, paginados por Terc (paciente) --------------------------------
  const tercs = await q<{ Terc: number }>('SELECT DISTINCT Terc FROM ccorrentes ORDER BY Terc');
  const stats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let heads = 0, noPatient = 0, linesTotal = 0;
  const t0 = Date.now();

  for (let i = 0; i < tercs.length; i += 300) {
    if (heads >= args.limit) break;
    const slice = tercs.slice(i, i + 300).map(t => Number(t.Terc));
    const hs = await q<Head>(`
      SELECT TipDoc, Terc, DocPri, Anulado, TipPag, TipoNovo, DocNovo, Dia, DCCaixa, MovCaixa, Valor, ValorPago, ValorRelacao, PrcDesc,
             RelacionaTipo, RelacionaDoc, TipoOld, DocOld, Desconto100, EmissaoOperador, EmissaoHora, Isento, HashKey, HashKeyControl, Hora,
             CONVERT(AnulacaoMotivo USING latin1) AS AnulacaoMotivo, AnulacaoOperador, AnulacaoDia, TipoAnulaDoc,
             CONVERT(DescricaoPagamentoRecibo USING latin1) AS DescricaoPagamentoRecibo, RetencaoFonte, RetencaoImposto, CONVERT(ObsDoc USING latin1) AS ObsDoc,
             CONVERT(pac_nome USING latin1) AS pac_nome, CONVERT(pac_morada USING latin1) AS pac_morada, CONVERT(pac_localidade USING latin1) AS pac_localidade,
             pac_codpostal, pac_nif, pac_benef, anula_tipo, anula_doc, ValorSemDesconto, IDSignDoc, DateSignDoc
      FROM ccorrentes WHERE Terc IN (?) ORDER BY Terc, Dia, TipDoc, DocPri`, [slice]);
    const ls = await q<Line>(`
      SELECT TipDoc, Terc, NDoc, AuxAutoInc, Dente, CodTT, Faces, Dia, DiaTrt, Clinico, Entid, Guia, Anul, CONVERT(DescLin USING latin1) AS DescLin,
             ValPac, ValEnt, Desconto, Quant, PercIva, Episodio
      FROM doclin WHERE Terc IN (?) ORDER BY Terc, TipDoc, NDoc, AuxAutoInc`, [slice]);
    const linesByHead = new Map<string, Line[]>();
    for (const l of ls) {
      const k = `${Number(l.TipDoc)}-${Number(l.Terc)}-${Number(l.NDoc)}`;
      (linesByHead.get(k) ?? linesByHead.set(k, []).get(k)!).push(l);
    }
    const docs: Record<string, any>[] = [];
    for (const h of hs) {
      if (heads >= args.limit) break;
      heads++;
      const legacyId = `${Number(h.TipDoc)}-${Number(h.Terc)}-${Number(h.DocPri)}`;
      const patientId = patientMap.get(`dentoral:${Number(h.Terc)}`) ?? null;
      if (!patientId) noPatient++;
      const dt = docTypes.get(Number(h.TipDoc)) ?? { name: `Documento tipo ${Number(h.TipDoc)}`, kind: 'OTHER', series: 'CL', atcud: null };
      const lines = (linesByHead.get(legacyId) ?? []).map(l => ({
        legacyLineId: String(Number(l.AuxAutoInc)),
        dentoralCode: str(l.CodTT),
        treatmentTypeId: ttByCode.get(str(l.CodTT) ?? '') ?? null,
        description: str(l.DescLin, 300),
        tooth: tooth(l.Dente),
        faces: facesText(l.Faces),
        quantity: Number(l.Quant) || 1,
        patientCents: cents(l.ValPac),
        entityCents: cents(l.ValEnt),
        discountCents: cents(l.Desconto),
        vatPct: Number(l.PercIva) || 0,
        doctorId: (Number(l.Clinico) ? doctorMap.get(`dentoral:${Number(l.Clinico)}`) : null) ?? null,
        treatmentDate: lisbonDate(l.DiaTrt) ?? lisbonDate(l.Dia),
        voided: yn(l.Anul),
      }));
      linesTotal += lines.length;
      const related: string[] = [];
      if (Number(h.RelacionaDoc)) related.push(`${Number(h.RelacionaTipo)}-${Number(h.Terc)}-${Number(h.RelacionaDoc)}`);
      if (Number(h.DocNovo)) related.push(`${Number(h.TipoNovo)}-${Number(h.Terc)}-${Number(h.DocNovo)}`);
      if (Number(h.DocOld)) related.push(`${Number(h.TipoOld)}-${Number(h.Terc)}-${Number(h.DocOld)}`);
      if (Number(h.anula_doc)) related.push(`${Number(h.anula_tipo)}-${Number(h.Terc)}-${Number(h.anula_doc)}`);
      const pm = Number(h.TipPag);
      docs.push({
        legacyId,
        clinicId: refs.clinicId,
        patientId,
        docTypeCode: Number(h.TipDoc),
        docTypeName: dt.name,
        series: dt.series,
        kind: dt.kind,
        number: Number(h.DocPri),
        displayNumber: `${dt.kind === 'OTHER' ? dt.name : dt.kind} ${dt.series}/${Number(h.DocPri)}`,
        issuedAt: lisbonDate(h.Dia, h.Hora !== '00:00:00' ? h.Hora : h.EmissaoHora) ?? new Date('2010-01-01T00:00:00Z'),
        cashDirection: h.DCCaixa ?? 'RecTrat',
        totalCents: cents(h.Valor),
        paidCents: cents(h.ValorPago),
        discountCents: cents(h.Desconto100) || Math.max(0, cents(h.ValorSemDesconto) - cents(h.Valor)),
        paymentMethod: pm === 1 ? 'cash' : pm === 2 ? 'cheque' : pm === 3 ? 'card' : 'unknown',
        vatExempt: yn(h.Isento),
        customerSnapshot: { name: str(h.pac_nome, 120), nif: nif(h.pac_nif) ?? str(h.pac_nif, 20), address: str(h.pac_morada, 160), postalCode: postalCode(h.pac_codpostal) ?? str(h.pac_codpostal, 20), city: str(h.pac_localidade, 80) },
        lines,
        relatedLegacyIds: related,
        voided: yn(h.Anulado),
        voidedAt: yn(h.Anulado) ? lisbonDate(h.AnulacaoDia) : null,
        voidReason: yn(h.Anulado) ? str(h.AnulacaoMotivo, 300) : null,
        atHash: str(h.HashKey, 200),
        atcud: dt.atcud ? `${dt.atcud}-${Number(h.DocPri)}` : null,
        issuedByLegacyOperator: Number(h.EmissaoOperador) || null,
        notes: [str(h.ObsDoc, 500), str(h.DescricaoPagamentoRecibo, 200)].filter(Boolean).join('\n') || null,
        legacyData: {
          movCaixa: h.MovCaixa, valorRelacao: h.ValorRelacao, prcDesc: h.PrcDesc, docLiquidado38: h.DocLiquidado38,
          retencaoFonte: h.RetencaoFonte, retencaoImposto: h.RetencaoImposto, tipoAnulaDoc: h.TipoAnulaDoc,
          anulacaoOperador: h.AnulacaoOperador, hashKeyControl: h.HashKeyControl, pacBenef: h.pac_benef,
          idSignDoc: str(h.IDSignDoc) || null, dateSignDoc: h.DateSignDoc,
          linhasExtra: (linesByHead.get(legacyId) ?? []).map(l => ({ aux: l.AuxAutoInc, entid: l.Entid, guia: l.Guia, episodio: l.Episodio })),
        },
        createdAt: lisbonDate(h.Dia) ?? new Date('2010-01-01T00:00:00Z'),
      });
    }
    await upsertByLegacyId(LegacyInvoice, docs, args, stats);
    progress('ccorrentes', heads, null, t0);
  }
  console.log();
  log('ccorrentes/doclin → legacyinvoices', { ...stats, cabecalhos: heads, linhas: linesTotal, semPaciente: noPatient });

  // --- ccconcilia (conciliação de pagamentos) → relatedLegacyIds -----------------
  if (await tableExists('ccconcilia')) {
    const cols = await columns('ccconcilia');
    const names = cols.map(c => c.name);
    const cTerc = pick(cols, ['Terc', /terc|pac/i]);
    const cT1 = pick(cols, ['TipDoc', 'TipDocPag', 'TipoPag', /^tip(o)?doc$/i, /tipo?.*pag/i]);
    const cD1 = pick(cols, ['DocPri', 'NDoc', 'DocPag', /^doc(pri)?$/i, /doc.*pag/i]);
    const cT2 = pick(cols, ['TipDocLiq', 'TipoLiq', 'TipDocFac', /tip.*(liq|fac|rel)/i]);
    const cD2 = pick(cols, ['DocLiq', 'DocFac', 'DocRel', /doc.*(liq|fac|rel)/i]);
    describeMapping('ccconcilia', { colunas: names, terc: cTerc, tipo1: cT1, doc1: cD1, tipo2: cT2, doc2: cD2 });
    if (cTerc && cT1 && cD1 && cT2 && cD2 && !args.dryRun) {
      const rows = await q<any>(`SELECT \`${cTerc}\` AS terc, \`${cT1}\` AS t1, \`${cD1}\` AS d1, \`${cT2}\` AS t2, \`${cD2}\` AS d2 FROM ccconcilia`);
      const ops: any[] = [];
      for (const r of rows) {
        const a = `${Number(r.t1)}-${Number(r.terc)}-${Number(r.d1)}`, b = `${Number(r.t2)}-${Number(r.terc)}-${Number(r.d2)}`;
        ops.push({ updateOne: { filter: { legacyId: a }, update: { $addToSet: { relatedLegacyIds: b } } } });
        ops.push({ updateOne: { filter: { legacyId: b }, update: { $addToSet: { relatedLegacyIds: a } } } });
      }
      for (let i = 0; i < ops.length; i += 1000) await LegacyInvoice.bulkWrite(ops.slice(i, i + 1000), { ordered: false, timestamps: false });
      log('ccconcilia → relatedLegacyIds', { ligacoes: rows.length });
    } else log('ccconcilia: mapeamento incompleto — ignorado (as relações já vêm de RelacionaDoc/DocNovo/DocOld)');
  }
});
