// 📄 scripts/migracao/05-procedures.ts
// =============================================================================
// Passo 5 — tratexec (Inicial = 'Não') → Procedure
//
// · Inicial = 'Sim' (8 364 linhas) = estado INICIAL do odontograma, não são
//   atos executados → excluídos (fase 2: odontograma)
// · status: SitFac 1 → invoiced | 99 → void | restantes → completed
//   (ASSUNÇÃO a validar: SitFac 0 = por faturar, 1 = faturado, 2/50 = outros
//   estados de faturação, 99 = anulado)
// · preço: ValuePac (parte paciente) + ValueEnt (parte entidade; 0 nos
//   particulares) = priceCents; listPriceCents = igual (não há tabela histórica)
// · comissão: 0 — os atos antigos foram pagos pelo Dentoral; evita poluir os
//   relatórios de remuneração do CDC
// · appointmentId: liga à marcação do MESMO paciente no MESMO dia, se existir
// · treatmentPlanId: preenchido pelo 06-treatment-plans (planotrat.AuxAutoTrt)
// · legacyId = tratexec:<AuxAuto>
// =============================================================================

import { runScript, q, pageByKey, str, cents, tooth, facesText, lisbonDate, log, progress, upsertByLegacyId, loadLegacyMap, loadRefs, type UpsertStats } from './lib/common';

type Row = { AuxAuto: number; Pac: number; Dia: string; Trat: string; Time: string; Face: number; CdX: number; CdY: number; Especial: string; Entidade: number; Guia: string; Dente: string; SitFac: number; Clinico: number; CorMaterial: number; ValuePac: string; ValueEnt: string; ValueChanged: string; PlanoGeral: number; PlanoPage: number; Especialidade: number; Posto: number; CodTratInt: string | null; Episodio: number; Quadrante: number };

await runScript('05-procedures', async args => {
  const { Procedure, Patient, Doctor, TreatmentType, Appointment } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const doctorMap = await loadLegacyMap(Doctor);

  // catálogo: dentoralCode → {_id, name, category}
  const ttById = new Map<string, { _id: any; name: string; category: string | null }>();
  for (const t of await TreatmentType.find({ dentoralCode: { $type: 'string' } }, { dentoralCode: 1, name: 1, category: 1 }).lean()) {
    ttById.set(String(t.dentoralCode), { _id: t._id, name: t.name, category: t.category ?? null });
  }
  const legacyTT = await TreatmentType.findById(refs.legacyAppointmentTypeId).lean();

  // marcações por paciente+dia (para ligar appointmentId)
  const apptByPatDay = new Map<string, any>();
  const apptCursor = Appointment.find({ legacyId: { $regex: '^agenda:' } }, { patientId: 1, startAt: 1 }).lean().cursor();
  for await (const a of apptCursor) {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(a.startAt as Date); // YYYY-MM-DD
    const key = `${a.patientId}|${day}`;
    if (!apptByPatDay.has(key)) apptByPatDay.set(key, a._id);
  }
  log(`mapas: ${patientMap.size} pacientes, ${doctorMap.size} médicos, ${ttById.size} atos, ${apptByPatDay.size} marcações/dia`);

  const [{ n: total }] = await q<{ n: number }>(`SELECT COUNT(*) n FROM tratexec WHERE Inicial = 'Não'`);
  const stats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let done = 0, noPatient = 0, noTT = 0;
  const t0 = Date.now();

  const sql = `
    SELECT AuxAuto, Pac, Dia, Trat, Time, Face, CdX, CdY, Especial, Entidade, Guia, Dente, SitFac, Clinico, CorMaterial,
           ValuePac, ValueEnt, ValueChanged, PlanoGeral, PlanoPage, Especialidade, Posto, CodTratInt, Episodio, Quadrante
    FROM tratexec WHERE Inicial = 'Não' AND AuxAuto > ? ORDER BY AuxAuto LIMIT ?`;

  for await (const rows of pageByKey<Row>(sql, r => Number(r.AuxAuto), args.batch)) {
    const docs: Record<string, any>[] = [];
    for (const r of rows) {
      if (done >= args.limit) break;
      done++;
      const patientId = patientMap.get(`dentoral:${Number(r.Pac)}`);
      if (!patientId) { noPatient++; continue; }
      const code = str(r.Trat) ?? '';
      let tt = ttById.get(code);
      if (!tt) { noTT++; tt = { _id: refs.legacyAppointmentTypeId, name: `Ato Dentoral ${code}`, category: legacyTT?.category ?? null }; }
      const executedAt = lisbonDate(r.Dia, r.Time) ?? lisbonDate(r.Dia) ?? null;
      const day = r.Dia?.slice(0, 10);
      const price = cents(r.ValuePac) + cents(r.ValueEnt);
      const sit = Number(r.SitFac);
      const faces = facesText(r.Face);
      const notes = [faces ? `Faces: ${faces}` : null, str(r.Guia) ? `Guia: ${str(r.Guia)}` : null, str(r.CodTratInt) ? `Cód. interno: ${str(r.CodTratInt)}` : null].filter(Boolean).join(' · ') || null;
      const dc = Number(r.Clinico);
      docs.push({
        legacyId: `tratexec:${Number(r.AuxAuto)}`,
        clinicId: refs.clinicId,
        patientId,
        doctorId: (dc ? doctorMap.get(`dentoral:${dc}`) : null) ?? refs.placeholderDoctorId,
        treatmentTypeId: tt._id,
        appointmentId: day ? apptByPatDay.get(`${patientId}|${day}`) ?? null : null,
        treatmentPlanId: null,
        status: sit === 1 ? 'invoiced' : sit === 99 ? 'void' : 'completed',
        nameSnapshot: tt.name,
        categorySnapshot: tt.category,
        listPriceCents: price,
        discountMode: null,
        discountPct: null,
        discountCents: 0,
        priceCents: price,
        costCents: 0,
        commissionBaseCents: null,
        commissionMode: 'percent',
        commissionRate: 0,
        commissionFixedCents: null,
        commissionSource: null,
        commissionCents: 0,
        toothNumbers: tooth(r.Dente) ? [tooth(r.Dente)] : [],
        notes,
        executedAt,
        invoiceId: null,
        stockDeductedAt: null,
        voidedAt: sit === 99 ? executedAt : null,
        voidedByUserId: null,
        voidReason: sit === 99 ? 'Anulado no Dentoral (SitFac 99)' : null,
        legacyData: {
          dentoralCode: code,
          face: Number(r.Face),
          sitFac: sit,
          entidade: Number(r.Entidade),
          clinicoCod: dc,
          episodio: Number(r.Episodio),
          quadrante: Number(r.Quadrante),
          planoGeral: Number(r.PlanoGeral),
          planoPage: Number(r.PlanoPage),
          valuePac: r.ValuePac,
          valueEnt: r.ValueEnt,
          valueChanged: r.ValueChanged,
          especial: r.Especial,
          posto: Number(r.Posto),
          corMaterial: Number(r.CorMaterial),
          denteRaw: r.Dente,
        },
        createdAt: executedAt ?? new Date('2010-01-01T00:00:00Z'),
      });
    }
    await upsertByLegacyId(Procedure, docs, args, stats);
    progress('procedures', done, Number(total), t0);
    if (done >= args.limit) break;
  }
  console.log();
  log('procedures', { ...stats, semPaciente: noPatient, atoForaDoCatalogo: noTT });
});
