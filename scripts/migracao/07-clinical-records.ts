// 📄 scripts/migracao/07-clinical-records.ts
// =============================================================================
// Passo 7 — obsger + obsdent + anamnese (anmtexto/anmtitulo) → ClinicalRecord
//
// · 1 ClinicalRecord por paciente (1:1). Criado se não existir.
// · obsger (observações gerais, Tipo 22 e 15) → notes[] com legacyId
//   `obsger:<Aux>`; obsdent (observações por dente) → `obsdent:<chave>`.
// · Notas são append-only: só adiciona as que ainda não existem (legacyId),
//   por isso o script é idempotente mesmo sem --update.
// · Anamnese Dentoral (14 perguntas Sim/Não + texto) → anamnesisNotes
//   (texto legível) + legacyData.anamnese (dados brutos). NÃO preenche
//   `questionnaire` (ficha nova obrigatória — paciente volta a preencher).
// · Operador da observação → doctorId se corresponder a um médico, senão
//   médico-placeholder.
// =============================================================================

import { Types } from 'mongoose';
import { runScript, q, str, tooth, lisbonDate, yn, log, progress, loadLegacyMap, loadRefs } from './lib/common';
import { columns, tableExists, pick, selectAll, describeMapping } from './lib/dyn';

type ObsGer = { Pac: number; Tipo: number; Dia: string; Dente: string; AuxAutoTrt: number; Vista: string; Obs: string | null; Operador: number; Aux: number };

void runScript('07-clinical-records', async args => {
  const { ClinicalRecord, Patient, Doctor } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const doctorMap = await loadLegacyMap(Doctor);
  const docFor = (op: unknown) => (Number(op) ? doctorMap.get(`dentoral:${Number(op)}`) : null) ?? refs.placeholderDoctorId;
  const t0 = Date.now();

  // ---------------------------------------------------------------------------
  // 1) Garantir 1 ClinicalRecord por paciente migrado
  // ---------------------------------------------------------------------------
  const existing = new Set<string>((await ClinicalRecord.find({}, { patientId: 1 }).lean()).map(r => String(r.patientId)));
  const missing = [...patientMap.values()].filter(id => !existing.has(String(id)));
  log(`clinicalrecords existentes: ${existing.size} · a criar: ${missing.length}`);
  if (!args.dryRun && missing.length) {
    for (let i = 0; i < missing.length; i += 2000) {
      await ClinicalRecord.insertMany(missing.slice(i, i + 2000).map(patientId => ({ patientId, allergies: [], currentMedications: [], systemicConditions: [], notes: [] })), { ordered: false });
      progress('clinicalrecords', Math.min(i + 2000, missing.length), missing.length, t0);
    }
    console.log();
  }
  // mapa patientId → recordId
  const recByPatient = new Map<string, Types.ObjectId>();
  for (const r of await ClinicalRecord.find({}, { patientId: 1 }).lean()) recByPatient.set(String(r.patientId), r._id as Types.ObjectId);

  // legacyIds de notas já presentes
  const haveNote = new Set<string>();
  for (const r of await ClinicalRecord.aggregate([{ $unwind: '$notes' }, { $match: { 'notes.legacyId': { $type: 'string' } } }, { $project: { l: '$notes.legacyId' } }])) haveNote.add(r.l);
  log(`notas já migradas: ${haveNote.size}`);

  type NoteIn = { recId: Types.ObjectId; note: Record<string, any> };
  const pending: NoteIn[] = [];
  let skippedNoPatient = 0;

  async function flush() {
    if (!pending.length) return;
    if (!args.dryRun) {
      const byRec = new Map<string, Record<string, any>[]>();
      for (const p of pending) (byRec.get(String(p.recId)) ?? byRec.set(String(p.recId), []).get(String(p.recId))!).push(p.note);
      const ops: any[] = [...byRec.entries()].map(([recId, notes]) => ({ updateOne: { filter: { _id: new Types.ObjectId(recId) }, update: { $push: { notes: { $each: notes } } } } }));
      for (let i = 0; i < ops.length; i += 500) await ClinicalRecord.bulkWrite(ops.slice(i, i + 500), { ordered: false, timestamps: false });
    }
    pending.length = 0;
  }

  function addNote(pac: number, legacyId: string, text: string | null, dia: unknown, operador: unknown, extra: Record<string, unknown>) {

    if (!text) return;
    const patientId = patientMap.get(`dentoral:${pac}`);
    const recId = patientId && recByPatient.get(String(patientId));
    if (!recId) { skippedNoPatient++; return; }
    if (haveNote.has(legacyId)) return;
    haveNote.add(legacyId);
    pending.push({ recId, note: { _id: new Types.ObjectId(), legacyId, doctorId: docFor(operador), appointmentId: null, text: text.slice(0, 5000), amendsNoteId: null, createdAt: lisbonDate(dia) ?? new Date('2010-01-01T00:00:00Z'), ...extra } });
  }

  // ---------------------------------------------------------------------------
  // 2) obsger
  // ---------------------------------------------------------------------------
  let lastAux = 0, n = 0;
  for (;;) {
    if (n >= args.limit) break;
    const rows = await q<ObsGer>('SELECT Pac, Tipo, Dia, Dente, AuxAutoTrt, Vista, CONVERT(Obs USING latin1) AS Obs, Operador, Aux FROM obsger WHERE Aux > ? ORDER BY Aux LIMIT ?', [lastAux, args.batch]);
    if (!rows.length) break;
    for (const r of rows) {
      lastAux = Number(r.Aux);
      n++;
      const d = tooth(r.Dente);
      const prefix = [r.Tipo === 15 ? '[Alerta]' : null, d ? `[Dente ${d}]` : null].filter(Boolean).join(' ');
      const text = [prefix, str(r.Obs)].filter(Boolean).join(' ');
      addNote(Number(r.Pac), `obsger:${r.Aux}`, text, r.Dia, r.Operador, {});
    }
    if (pending.length >= args.batch) await flush();
    progress('obsger', n, null, t0);
  }
  await flush();
  console.log();
  log('obsger → notes', { lidas: n, adicionadas: haveNote.size, semPaciente: skippedNoPatient });

  // ---------------------------------------------------------------------------
  // 3) obsdent (esquema desconhecido → mapeamento dinâmico)
  // ---------------------------------------------------------------------------
  if (await tableExists('obsdent')) {
    const cols = await columns('obsdent');
    const cPac = pick(cols, ['Pac', 'Mecano', 'PMecano', /pac/i]);
    const cDia = pick(cols, ['Dia', 'Data', /dia|data/i], /date/);
    const cDente = pick(cols, ['Dente', /dente|tooth/i]);
    const cObs = pick(cols, ['Obs', 'Texto', /obs|text|desc/i], /text|char/);
    const cOp = pick(cols, ['Operador', 'Clinico', 'Medico', /oper|clin|medic/i]);
    const cKey = pick(cols, ['Aux', 'AuxAuto', 'AuxAutoInc', /^aux/i, /^id$/i]);
    describeMapping('obsdent', { pac: cPac, dia: cDia, dente: cDente, obs: cObs, operador: cOp, chave: cKey });
    if (cPac && cObs) {
      const rows = await q<any>(`SELECT ${selectAll('obsdent', cols)} FROM obsdent`);
      let i = 0;
      for (const r of rows) {
        i++;
        const d = tooth(r[cDente ?? '']);
        const legacyId = cKey ? `obsdent:${r[cKey]}` : `obsdent:${r[cPac]}:${r[cDente ?? ''] ?? ''}:${r[cDia ?? ''] ?? ''}:${i}`;
        const text = [d ? `[Dente ${d}]` : null, str(r[cObs])].filter(Boolean).join(' ');
        addNote(Number(r[cPac]), legacyId, text, cDia ? r[cDia] : null, cOp ? r[cOp] : 0, {});
        if (pending.length >= args.batch) await flush();
      }
      await flush();
      log('obsdent → notes', { lidas: rows.length });
    } else log('obsdent: colunas essenciais não encontradas — ignorado (confirmar com Victor)');
  }

  // ---------------------------------------------------------------------------
  // 4) Anamnese Dentoral (anmtitulo = perguntas, anmtexto = respostas)
  // ---------------------------------------------------------------------------
  if ((await tableExists('anmtexto')) && (await tableExists('anmtitulo'))) {
    const tc = await columns('anmtitulo');
    const tId = pick(tc, ['Codigo', 'Cod', 'Num', 'Numero', 'Ordem', /^id$/i, /cod|num|ord/i]);
    const tTxt = pick(tc, ['Titulo', 'Pergunta', 'Texto', 'Descricao', /tit|perg|text|desc/i], /text|char/);
    const xc = await columns('anmtexto');
    const xPac = pick(xc, ['Pac', 'Mecano', 'PMecano', /pac/i]);
    const xQ = pick(xc, [tId ?? '', 'Codigo', 'Cod', 'Num', 'Numero', 'Ordem', 'Titulo', /cod|num|ord|tit/i]);
    const xResp = pick(xc, ['Resposta', 'Resp', 'SimNao', /resp|sim/i]);
    const xTxt = pick(xc, ['Texto', 'Obs', 'Descricao', /text|obs|desc/i], /text|char/);
    const xDia = pick(xc, ['Dia', 'Data', /dia|data/i], /date/);
    describeMapping('anmtitulo', { id: tId, titulo: tTxt });
    describeMapping('anmtexto', { pac: xPac, pergunta: xQ, resposta: xResp, texto: xTxt, dia: xDia });
    if (tId && tTxt && xPac && xQ) {
      const titles = new Map<string, string>();
      for (const r of await q<any>(`SELECT ${selectAll('anmtitulo', tc)} FROM anmtitulo`)) titles.set(String(r[tId]), str(r[tTxt]) ?? String(r[tId]));
      const rows = await q<any>(`SELECT ${selectAll('anmtexto', xc)} FROM anmtexto ORDER BY \`${xPac}\``);
      const byPac = new Map<number, any[]>();
      for (const r of rows) (byPac.get(Number(r[xPac])) ?? byPac.set(Number(r[xPac]), []).get(Number(r[xPac]))!).push(r);
      const ops: any[] = [];
      let withContent = 0;
      for (const [pac, answers] of byPac) {
        const patientId = patientMap.get(`dentoral:${pac}`);
        const recId = patientId && recByPatient.get(String(patientId));
        if (!recId) continue;
        const lines: string[] = [];
        const raw: Record<string, unknown>[] = [];
        let latest: Date | null = null;
        for (const a of answers) {
          const title = titles.get(String(a[xQ])) ?? `Pergunta ${a[xQ]}`;
          const resp = xResp ? str(a[xResp]) : null;
          const txt = xTxt ? str(a[xTxt], 500) : null;
          const positive = resp ? yn(resp) : !!txt;
          raw.push({ pergunta: title, resposta: resp, texto: txt });
          if (positive || txt) lines.push(`• ${title}: ${resp ?? 'Sim'}${txt ? ` — ${txt}` : ''}`);
          const d = xDia ? lisbonDate(a[xDia]) : null;
          if (d && (!latest || d > latest)) latest = d;
        }
        if (!lines.length) continue;
        withContent++;
        const text = `Anamnese Dentoral (migrada; respostas positivas):\n${lines.join('\n')}`.slice(0, 3000);
        ops.push({ updateOne: { filter: { _id: recId, $or: [{ anamnesisNotes: null }, { anamnesisNotes: '' }] }, update: { $set: { anamnesisNotes: text, anamnesisUpdatedAt: latest, 'legacyData.anamnese': raw } } } });
      }
      if (!args.dryRun) for (let i = 0; i < ops.length; i += 500) await ClinicalRecord.bulkWrite(ops.slice(i, i + 500), { ordered: false, timestamps: false });
      log('anamnese → anamnesisNotes', { pacientes: byPac.size, comRespostasPositivas: withContent });
    } else log('anamnese: colunas essenciais não encontradas — ignorado (confirmar com Victor)');
  }
});
