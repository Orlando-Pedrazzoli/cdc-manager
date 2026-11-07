// 📄 scripts/migracao/06-treatment-plans.ts
// =============================================================================
// Passo 6 — planotrat (+ orclivre) → TreatmentPlan
//
// · Um plano = (Pac, NumGeral); as linhas são os itens (Trat, Dente, Valor,
//   Situacao, Aprovado, Fase).
// · status:
//     todos os itens Executado                     → completed
//     algum Aprovado=Sim e algum Executado         → in-progress
//     algum Aprovado=Sim                           → approved
//     todos Cancelado                              → declined
//     caso contrário                               → proposed
// · item.procedureId ← tratexec.AuxAuto (planotrat.AuxAutoTrt) — e, no fim,
//   Procedure.treatmentPlanId ← plano (ligação nos dois sentidos)
// · orclivre (orçamentos em texto livre) → plano com 1 item genérico e o
//   texto nas notas
// · legacyId = planotrat:<Pac>:<NumGeral> | orclivre:<Pac>:<NOrc>
// =============================================================================

import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { runScript, q, str, cents, tooth, lisbonDate, yn, log, progress, upsertByLegacyId, loadLegacyMap, loadRefs, type UpsertStats } from './lib/common';

type Row = { NumGeral: number; Titulo: string | null; NumOrc: number; Pac: number; Dia: string; Trat: string; Dente: string; Valor: string; Situacao: string; Aprovado: string; AuxAutoTrt: number; Fase: number; Clinico: number; Total: string; FaseDesc: string | null; SeqNum: number; prognostico: string | null; grau_dificuldade: string | null };

void runScript('06-treatment-plans', async args => {
  const { TreatmentPlan, Patient, Doctor, TreatmentType, Procedure } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const doctorMap = await loadLegacyMap(Doctor);
  const procMap = await loadLegacyMap(Procedure); // tratexec:<AuxAuto> → _id
  const ttById = new Map<string, { _id: any; name: string }>();
  for (const t of await TreatmentType.find({ dentoralCode: { $type: 'string' } }, { dentoralCode: 1, name: 1 }).lean()) ttById.set(String(t.dentoralCode), { _id: t._id, name: t.name });
  log(`mapas: ${patientMap.size} pacientes, ${procMap.size} procedures, ${ttById.size} atos`);

  // --- planotrat: pagina por paciente -----------------------------------------
  const pacs = await q<{ Pac: number }>('SELECT DISTINCT Pac FROM planotrat ORDER BY Pac');
  const stats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let done = 0, plans = 0, noPatient = 0;
  const t0 = Date.now();
  const planLinks: { planLegacyId: string; procedureIds: Types.ObjectId[] }[] = [];

  for (let i = 0; i < pacs.length; i += 500) {
    if (plans >= args.limit) break;
    const slice = pacs.slice(i, i + 500).map(p => Number(p.Pac));
    const rows = await q<Row>(`
      SELECT NumGeral, Titulo, NumOrc, Pac, Dia, Trat, Dente, Valor, Situacao, Aprovado, AuxAutoTrt, Fase, Clinico, Total, FaseDesc, SeqNum, prognostico, grau_dificuldade
      FROM planotrat WHERE Pac IN (?) ORDER BY Pac, NumGeral, SeqNum, Dia`, [slice]);
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${Number(r.Pac)}:${Number(r.NumGeral)}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    const docs: Record<string, any>[] = [];
    for (const [k, items] of groups) {
      if (plans >= args.limit) break;
      plans++;
      const [pac] = k.split(':').map(Number);
      const patientId = patientMap.get(`dentoral:${pac}`);
      if (!patientId) { noPatient++; continue; }
      // médico mais frequente
      const freq = new Map<number, number>();
      for (const r of items) freq.set(Number(r.Clinico), (freq.get(Number(r.Clinico)) ?? 0) + 1);
      const topClin = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const doctorId = (topClin ? doctorMap.get(`dentoral:${topClin}`) : null) ?? refs.placeholderDoctorId;
      const dates = items.map(r => lisbonDate(r.Dia)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
      const first = dates[0] ?? new Date('2010-01-01T00:00:00Z');
      const last = dates[dates.length - 1] ?? first;
      const executed = items.filter(r => r.Situacao === 'Executado');
      const approved = items.filter(r => yn(r.Aprovado));
      const cancelled = items.filter(r => r.Situacao === 'Cancelado');
      let status: string;
      if (executed.length === items.length) status = 'completed';
      else if (approved.length && executed.length) status = 'in-progress';
      else if (approved.length) status = 'approved';
      else if (cancelled.length === items.length) status = 'declined';
      else status = 'proposed';
      const procIds: Types.ObjectId[] = [];
      const planItems = items.map(r => {
        const code = str(r.Trat) ?? '';
        const tt = ttById.get(code) ?? { _id: refs.legacyAppointmentTypeId, name: `Ato Dentoral ${code}` };
        const procId = Number(r.AuxAutoTrt) ? procMap.get(`tratexec:${Number(r.AuxAutoTrt)}`) ?? null : null;
        if (procId) procIds.push(procId);
        const v = cents(r.Valor);
        return {
          _id: new Types.ObjectId(),
          treatmentTypeId: tt._id,
          nameSnapshot: tt.name,
          catalogPriceCents: null,
          listPriceCents: v,
          priceEdited: false,
          discountMode: null,
          discountPct: null,
          discountCents: 0,
          priceCents: v,
          note: [r.Situacao, str(r.FaseDesc)].filter(Boolean).join(' · ') || null,
          toothNumbers: tooth(r.Dente) ? [tooth(r.Dente)] : [],
          phase: Number(r.Fase) >= 1 ? Number(r.Fase) : 1,
          procedureId: procId,
        };
      });
      const legacyId = `planotrat:${k}`;
      if (procIds.length) planLinks.push({ planLegacyId: legacyId, procedureIds: procIds });
      const title = str(items[0].Titulo, 160) ?? `Plano Dentoral nº ${Number(items[0].NumGeral)}`;
      const extra = [str(items[0].prognostico) ? `Prognóstico: ${str(items[0].prognostico)}` : null, str(items[0].grau_dificuldade) ? `Grau de dificuldade: ${str(items[0].grau_dificuldade)}` : null].filter(Boolean).join('\n');
      docs.push({
        legacyId,
        clinicId: refs.clinicId,
        patientId,
        doctorId,
        title,
        status,
        items: planItems,
        totalCents: planItems.reduce((a, it) => a + it.priceCents, 0),
        discountCents: 0,
        validUntil: null,
        proposedAt: first,
        approvedAt: approved.length ? (lisbonDate(approved[0].Dia) ?? first) : null,
        approvedVia: approved.length ? 'in-person' : null,
        declinedAt: status === 'declined' ? last : null,
        completedAt: status === 'completed' ? last : null,
        notes: extra || null,
        legacyData: { numGeral: Number(items[0].NumGeral), numOrc: Number(items[0].NumOrc), total: items[0].Total, itens: items.length },
        createdAt: first,
      });
    }
    await upsertByLegacyId(TreatmentPlan, docs, args, stats);
    done += rows.length;
    progress('planotrat', plans, null, t0);
  }
  console.log();
  log('planotrat → treatmentplans', { ...stats, planos: plans, linhas: done, semPaciente: noPatient });

  // --- ligação inversa Procedure.treatmentPlanId --------------------------------
  if (!args.dryRun && planLinks.length) {
    const planMap = await loadLegacyMap(TreatmentPlan);
    const ops = planLinks
      .map(l => ({ planId: planMap.get(l.planLegacyId), ids: l.procedureIds }))
      .filter(l => l.planId)
      .map(l => ({ updateMany: { filter: { _id: { $in: l.ids }, treatmentPlanId: null }, update: { $set: { treatmentPlanId: l.planId } } } }));
    for (let i = 0; i < ops.length; i += 1000) {
      const res = await Procedure.bulkWrite(ops.slice(i, i + 1000), { ordered: false, timestamps: false });
      progress('procedures ← plano', Math.min(i + 1000, ops.length), ops.length, t0);
      void res;
    }
    console.log();
  }

  // --- orclivre ---------------------------------------------------------------
  // limpeza da 1.ª tentativa (chave antiga orclivre:<Pac>:<NOrc>, que perdia versões)
  if (!args.dryRun) { const del = await TreatmentPlan.deleteMany({ legacyId: /^orclivre:\d+:\d+$/ }); if (del.deletedCount) log(`orclivre: removidos ${del.deletedCount} planos com chave antiga`); }
  const orc = await q<any>('SELECT Pac, NOrc, Dia, Valor, Aprovado, CONVERT(Texto USING latin1) AS Texto, CONVERT(Obs USING latin1) AS Obs FROM orclivre ORDER BY Pac, NOrc');
  const ostats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  const odocs: Record<string, any>[] = [];
  for (const r of orc) {
    const patientId = patientMap.get(`dentoral:${Number(r.Pac)}`);
    if (!patientId) continue;
    const d = lisbonDate(r.Dia) ?? new Date('2010-01-01T00:00:00Z');
    const v = cents(r.Valor);
    const approved = yn(r.Aprovado);
    odocs.push({
      // NOrc não é único por paciente (versões do mesmo orçamento) → inclui data e hash do texto
      legacyId: `orclivre:${Number(r.Pac)}:${Number(r.NOrc)}:${r.Dia}:${createHash('sha1').update(String(r.Texto ?? '') + '|' + String(r.Valor ?? '')).digest('hex').slice(0, 8)}`,
      clinicId: refs.clinicId,
      patientId,
      doctorId: refs.placeholderDoctorId,
      title: `Orçamento livre nº ${Number(r.NOrc)} (Dentoral)`,
      status: approved ? 'approved' : 'proposed',
      items: [{ _id: new Types.ObjectId(), treatmentTypeId: refs.legacyFreeBudgetTypeId, nameSnapshot: 'Orçamento livre (Dentoral)', catalogPriceCents: null, listPriceCents: v, priceEdited: false, discountMode: null, discountPct: null, discountCents: 0, priceCents: v, note: null, toothNumbers: [], phase: 1, procedureId: null }],
      totalCents: v,
      discountCents: 0,
      validUntil: null,
      proposedAt: d,
      approvedAt: approved ? d : null,
      approvedVia: approved ? 'in-person' : null,
      declinedAt: null,
      completedAt: null,
      notes: [str(r.Texto, 1500), str(r.Obs, 400)].filter(Boolean).join('\n---\n').slice(0, 2000) || null,
      legacyData: { nOrc: Number(r.NOrc) },
      createdAt: d,
    });
  }
  for (let i = 0; i < odocs.length; i += args.batch) await upsertByLegacyId(TreatmentPlan, odocs.slice(i, i + args.batch), args, ostats);
  log('orclivre → treatmentplans', ostats);
});
