// 📄 scripts/migracao/14-odontogram.ts
// =============================================================================
// Passo 14 — Odontograma v1 por paciente, derivado do Dentoral:
//   · tratexec Inicial='Sim'  → camada EXISTENTE (estado inicial marcado na
//                               1.ª avaliação: restaurações antigas, ausentes…)
//   · tratexec Inicial='Não'  → camada EXECUTADO (atos realizados, por ordem
//     (SitFac ≠ 99)             cronológica; "o último ganha")
//   Efeito de cada ato = TreatmentType.chartEffect (passo 13).
//   Faces = bitmask tratexec.Face → letras (--faces "1=O,2=M,4=D,16=V,32=L";
//   por defeito DEFAULT_FACE_BITS de lib/odontogram-chart.ts).
// Grava Odontogram { version: 1, teeth[] } só para pacientes com ≥ 1 dente
// afetado e SEM odontograma ainda (idempotente; --update regrava a v1 se ela
// for a única versão). updatedBy = médico-placeholder; createdAt = data do
// último evento. Planeado NÃO entra no snapshot (é derivado ao vivo na app).
// =============================================================================

import { Types } from 'mongoose';
import { runScript, q, tooth, lisbonDate, log, progress, loadLegacyMap, loadRefs } from './lib/common';
import { deriveToothStates, facesFromMask, DEFAULT_FACE_BITS, type ChartEvent, type ChartEffect, type ToothFaceKey } from '@/lib/odontogram-chart';

type Row = { AuxAuto: number; Pac: number; Dia: string; Trat: string; Dente: string; Face: number; SitFac: number; Inicial: string };

function parseFaceBits(): Record<number, ToothFaceKey> {
  const i = process.argv.indexOf('--faces');
  if (i < 0 || !process.argv[i + 1]) return DEFAULT_FACE_BITS;
  const out: Record<number, ToothFaceKey> = {};
  for (const pair of process.argv[i + 1].split(',')) {
    const [bit, face] = pair.split('=');
    if (Number(bit) && /^[OMDVL]$/.test(face)) out[Number(bit)] = face as ToothFaceKey;
  }
  return out;
}

void runScript('14-odontogram', async args => {
  const { Odontogram, Patient, TreatmentType } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const faceBits = parseFaceBits();
  log('bits de face', faceBits as any);

  const effectByCode = new Map<string, ChartEffect>();
  for (const t of await TreatmentType.find({ dentoralCode: { $type: 'string' } }, { dentoralCode: 1, chartEffect: 1 }).lean()) effectByCode.set(String(t.dentoralCode), ((t as any).chartEffect ?? 'none') as ChartEffect);
  const hasOdo = new Set<string>((await Odontogram.find({}, { patientId: 1 }).lean()).map(o => String(o.patientId)));
  log(`atos com efeito: ${[...effectByCode.values()].filter(e => e !== 'none').length}/${effectByCode.size} · pacientes já com odontograma: ${hasOdo.size}`);

  const pacs = await q<{ Pac: number }>("SELECT Pac FROM tratexec WHERE SitFac <> 99 AND Dente <> '00' AND Dente <> '' GROUP BY Pac ORDER BY Pac");
  const t0 = Date.now();
  let done = 0, written = 0, skipped = 0, noEvents = 0;
  const docs: any[] = [];
  const flush = async () => {
    if (!docs.length || args.dryRun) { docs.length = 0; return; }
    await Odontogram.insertMany(docs, { ordered: false });
    docs.length = 0;
  };

  for (let i = 0; i < pacs.length; i += 300) {
    if (done >= args.limit) break;
    const slice = pacs.slice(i, i + 300).map(p => Number(p.Pac));
    const rows = await q<Row>("SELECT AuxAuto, Pac, Dia, Trat, Dente, Face, SitFac, Inicial FROM tratexec WHERE Pac IN (?) AND SitFac <> 99 AND Dente <> '00' AND Dente <> '' ORDER BY Pac, Dia, AuxAuto", [slice]);
    const byPac = new Map<number, Row[]>();
    for (const r of rows) (byPac.get(Number(r.Pac)) ?? byPac.set(Number(r.Pac), []).get(Number(r.Pac))!).push(r);
    for (const [pac, list] of byPac) {
      if (done >= args.limit) break;
      done++;
      const patientId = patientMap.get(`dentoral:${pac}`);
      if (!patientId) { skipped++; continue; }
      if (hasOdo.has(String(patientId)) && !args.update) { skipped++; continue; }
      const events: ChartEvent[] = [];
      let last: Date | null = null;
      for (const r of list) {
        const fdi = tooth(r.Dente);
        if (!fdi) continue;
        const effect = effectByCode.get(String(r.Trat).trim()) ?? 'none';
        if (effect === 'none' || effect === 'removable' || effect === 'ortho' || effect === 'perio') continue;
        const at = lisbonDate(r.Dia);
        if (at && (!last || at > last)) last = at;
        events.push({ layer: r.Inicial === 'Sim' ? 'existing' : 'completed', effect, tooth: fdi, faces: facesFromMask(Number(r.Face), faceBits), at, label: String(r.Trat), ref: { kind: r.Inicial === 'Sim' ? 'initial' : 'procedure', id: String(r.AuxAuto) } });
      }
      if (!events.length) { noEvents++; continue; }
      const states = deriveToothStates(events);
      const teeth = [...states.values()]
        .filter(s => s.status !== 'present' || Object.keys(s.faces).length || s.endo || s.post || s.veneer)
        .map(s => ({
          number: s.number,
          status: s.status === 'to-extract' ? 'present' : s.status,
          faces: Object.entries(s.faces).map(([face, f]) => ({ face, condition: f.condition })),
          note: [s.endo ? 'Endodontia' : null, s.post ? 'Espigão' : null, s.veneer ? 'Faceta' : null, `Dentoral: ${s.events.length} registo(s)`].filter(Boolean).join(' · ').slice(0, 200),
        }));
      if (!teeth.length) { noEvents++; continue; }
      if (args.update && hasOdo.has(String(patientId)) && !args.dryRun) await Odontogram.deleteMany({ patientId, version: 1 });
      docs.push({ _id: new Types.ObjectId(), patientId, version: 1, teeth, updatedBy: refs.placeholderDoctorId, appointmentId: null, createdAt: last ?? new Date(), updatedAt: last ?? new Date() });
      written++;
      if (docs.length >= 500) await flush();
    }
    progress('pacientes', done, pacs.length, t0);
  }
  await flush();
  console.log();
  log('tratexec → odontograms v1', { pacientesLidos: done, odontogramasCriados: written, saltados: skipped, semEventos: noEvents });
});
