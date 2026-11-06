// 📄 scripts/migracao/99-verify.ts
// =============================================================================
// Passo 99 — verificação: contagens MySQL vs MongoDB + amostras de integridade
// Não escreve nada. Corre no fim (e pode correr a meio, a qualquer altura).
// =============================================================================

import { runScript, q, log } from './lib/common';

await runScript('99-verify', async () => {
  const M = await import('@/models');
  const one = async (sql: string) => Number((await q<any>(sql))[0]?.n ?? 0);
  const row = (label: string, mysql: number, mongo: number, note = '') => console.log(`${label.padEnd(34)} MySQL ${String(mysql).padStart(9)}   Mongo ${String(mongo).padStart(9)}   ${mongo === mysql ? '✓' : note || `Δ ${mongo - mysql}`}`);

  console.log('\n=== Contagens ===');
  row('pacientes', await one('SELECT COUNT(*) n FROM paciente'), await M.Patient.countDocuments({ legacyId: /^dentoral:/ }));
  row('médicos (medicos)', await one('SELECT COUNT(*) n FROM medicos'), (await M.Doctor.countDocuments({ legacyId: /^dentoral:[1-9]/ })) + (await M.Employee.countDocuments({ legacyId: /^dentoral:/ })), 'médicos + funcionários');
  row('agenda com paciente', await one('SELECT COUNT(*) n FROM agenda WHERE Mecano > 0'), await M.Appointment.countDocuments({ legacyId: /^agenda:/ }), 'ver 04 (duplicados de slot)');
  row('faltas', await one('SELECT COUNT(*) n FROM faltas'), await M.Appointment.countDocuments({ legacyId: /^faltas:/ }));
  row('tratexec (não inicial)', await one("SELECT COUNT(*) n FROM tratexec WHERE Inicial <> 'Sim'"), await M.Procedure.countDocuments({ legacyId: /^tratexec:/ }));
  row('planos (planotrat)', await one('SELECT COUNT(DISTINCT Pac, NumGeral) n FROM planotrat'), await M.TreatmentPlan.countDocuments({ legacyId: /^planotrat:/ }));
  row('orçamentos livres', await one('SELECT COUNT(*) n FROM orclivre'), await M.TreatmentPlan.countDocuments({ legacyId: /^orclivre:/ }));
  const notes = await M.ClinicalRecord.aggregate([{ $unwind: '$notes' }, { $match: { 'notes.legacyId': /^obsger:/ } }, { $count: 'n' }]);
  row('obsger', await one("SELECT COUNT(*) n FROM obsger WHERE Obs IS NOT NULL AND Obs <> ''"), notes[0]?.n ?? 0);
  row('faturação (ccorrentes)', await one('SELECT COUNT(*) n FROM ccorrentes'), await M.LegacyInvoice.countDocuments({}));
  row('documentos', await one('SELECT COUNT(*) n FROM documents'), await M.Document.countDocuments({ legacyId: /^documents:/ }), 'só ligados a paciente');
  row('fotos', await one('SELECT COUNT(*) n FROM paciente WHERE PFoto IS NOT NULL AND LENGTH(PFoto) > 0'), await M.Patient.countDocuments({ photoPublicId: /^cdc\/legacy\/photos\// }));

  console.log('\n=== Integridade ===');
  const orphanProc = await M.Procedure.countDocuments({ legacyId: /^tratexec:/, patientId: null });
  const placeholderDoc = await M.Doctor.findOne({ legacyId: 'dentoral:0' }, { _id: 1 }).lean();
  const procPlaceholder = placeholderDoc ? await M.Procedure.countDocuments({ doctorId: placeholderDoc._id }) : 0;
  const apptPlaceholder = placeholderDoc ? await M.Appointment.countDocuments({ doctorId: placeholderDoc._id }) : 0;
  const plansLinked = await M.Procedure.countDocuments({ legacyId: /^tratexec:/, treatmentPlanId: { $ne: null } });
  const invNoPatient = await M.LegacyInvoice.countDocuments({ patientId: null });
  const invVoided = await M.LegacyInvoice.countDocuments({ voided: true });
  const sumInv = await M.LegacyInvoice.aggregate([{ $match: { voided: false, kind: { $in: ['FR', 'FT', 'TV', 'VD'] } } }, { $group: { _id: null, t: { $sum: '$totalCents' } } }]);
  const sumMy = Number((await q<any>("SELECT ROUND(SUM(Valor)*100) n FROM ccorrentes WHERE Anulado='Não' AND TipDoc IN (120,121,122,126,127,128)"))[0]?.n ?? 0);
  const recsNoNotes = await M.ClinicalRecord.countDocuments({ notes: { $size: 0 }, anamnesisNotes: null });
  const patientsNoRecord = (await M.Patient.countDocuments({ legacyId: /^dentoral:/ })) - (await M.ClinicalRecord.countDocuments({}));
  log('procedures sem paciente', { n: orphanProc });
  log('procedures/consultas com médico placeholder', { procedures: procPlaceholder, consultas: apptPlaceholder });
  log('procedures ligados a plano', { n: plansLinked });
  log('faturas sem paciente / anuladas', { semPaciente: invNoPatient, anuladas: invVoided });
  log('soma faturas válidas (FR/FT/TV) em cêntimos', { mysql: sumMy, mongo: sumInv[0]?.t ?? 0, ok: sumMy === (sumInv[0]?.t ?? 0) });
  log('clinicalrecords vazios / pacientes sem record', { vazios: recsNoNotes, semRecord: Math.max(0, patientsNoRecord) });

  console.log('\n=== Amostra (3 pacientes com mais histórico) ===');
  const top = await M.Procedure.aggregate([{ $match: { legacyId: /^tratexec:/ } }, { $group: { _id: '$patientId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 3 }]);
  for (const t of top) {
    const p = await M.Patient.findById(t._id, { processNumber: 1, firstName: 1, lastName: 1, name: 1 }).lean() as any;
    const [appts, plans, inv, docs] = await Promise.all([
      M.Appointment.countDocuments({ patientId: t._id }), M.TreatmentPlan.countDocuments({ patientId: t._id }),
      M.LegacyInvoice.countDocuments({ patientId: t._id }), M.Document.countDocuments({ patientId: t._id }),
    ]);
    console.log(`  #${p?.processNumber ?? '?'} ${p?.name ?? [p?.firstName, p?.lastName].filter(Boolean).join(' ')}: procedures ${t.n} · consultas ${appts} · planos ${plans} · faturas ${inv} · docs ${docs}`);
  }
  console.log();
});
