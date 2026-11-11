// 📄 scripts/load-escala.ts
// =============================================================================
// CDC Manager — Carregar a escala dos médicos (5.ª ronda/08, nov. 2026)
// -----------------------------------------------------------------------------
// Substitui a semana-tipo (Colombo e Buraca) dos médicos que constam do quadro
// "HORÁRIO DOS MÉDICOS 2026" pelo que lá está (scripts/escala/escala-2026-11.ts),
// incluindo os fins de semana quinzenais. Os horários que vieram do Dentoral
// deixavam todas as agendas abertas todos os dias.
//
// O que NÃO faz: não toca em marcações, em exceções (férias, dias abertos à
// mão) nem em médicos que não estão no quadro. Mostra quantas marcações
// futuras ficam fora da escala nova, para a receção rever.
//
// Por omissão é SIMULAÇÃO. Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/load-escala.ts
//   npx tsx --env-file=.env.local scripts/load-escala.ts --apply
// Opção: --incluir-duvidas  carrega também as linhas por confirmar
// =============================================================================

import mongoose from 'mongoose';
import Doctor from '../src/models/Doctor';
import Clinic from '../src/models/Clinic';
import Appointment, { BLOCKING_STATUS } from '../src/models/Appointment';
import {
  utcToLisbonParts,
  workingRangesForDate,
} from '../src/lib/availability';
import {
  ESCALA,
  buildSchedules,
  matchDoctors,
} from './escala/escala-2026-11';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida (usa --env-file).');
  const apply = process.argv.includes('--apply');
  const incluirDuvidas = process.argv.includes('--incluir-duvidas');
  await mongoose.connect(uri);

  const [colombo, buraca] = await Promise.all([
    Clinic.findOne({ slug: 'colombo' }),
    Clinic.findOne({ slug: 'buraca' }),
  ]);
  if (!colombo || !buraca) throw new Error('Clínicas colombo/buraca não encontradas.');
  const clinicBySlug = { colombo, buraca };

  const doctors = await Doctor.find({ active: true });
  console.log(apply ? '⚠ MODO GRAVAÇÃO (--apply)' : 'SIMULAÇÃO — nada é gravado (usar --apply para gravar)');
  console.log(`médicos ativos na base: ${doctors.length} · médicos no quadro: ${ESCALA.length}\n`);

  const usados = new Set<string>();
  const semFicha: string[] = [];
  const ambiguos: string[] = [];
  const duvidas: string[] = [];
  let gravados = 0;
  let foraDaEscala = 0;
  const now = new Date();

  for (const med of ESCALA) {
    const found = matchDoctors(med, doctors);
    if (found.length === 0) {
      semFicha.push(med.nome);
      continue;
    }
    if (found.length > 1) {
      ambiguos.push(`${med.nome} → ${found.map(f => f.name).join(' | ')}`);
      continue;
    }
    const doctor = found[0];
    usados.add(String(doctor._id));

    for (const l of med.linhas) {
      if (l.confirmar) duvidas.push(`${med.nome} · ${DIAS[l.weekday]} (${l.clinic}): ${l.confirmar}`);
    }

    const sched = buildSchedules(med, incluirDuvidas);
    const clinicSchedules = (['colombo', 'buraca'] as const)
      .filter(slug => sched[slug].length > 0)
      .map(slug => {
        const clinicId = clinicBySlug[slug]._id;
        const previous = doctor.clinicSchedules.find(cs => String(cs.clinicId) === String(clinicId));
        return {
          clinicId,
          bookableOnline: previous?.bookableOnline ?? false,
          weeklySchedule: sched[slug],
        };
      });

    const resumo = (['colombo', 'buraca'] as const)
      .filter(slug => sched[slug].length > 0)
      .map(
        slug =>
          `${slug}: ` +
          sched[slug]
            .map(w => `${DIAS[w.weekday]} ${w.ranges[0].start}–${w.ranges[0].end}${w.biweeklyAnchor ? ' (quinzenal)' : ''}`)
            .join(', '),
      )
      .join(' · ');
    console.log(`  ${doctor.name}\n      ${resumo}`);

    // Marcações futuras que ficam fora da escala nova (só contagem)
    doctor.set('clinicSchedules', clinicSchedules);
    const futuras = await Appointment.find({
      doctorId: doctor._id,
      status: { $in: BLOCKING_STATUS },
      startAt: { $gte: now },
    })
      .select('clinicId startAt endAt')
      .lean();
    let fora = 0;
    for (const a of futuras) {
      const clinic = String(a.clinicId) === String(colombo._id) ? colombo : String(a.clinicId) === String(buraca._id) ? buraca : null;
      if (!clinic) continue;
      const s = utcToLisbonParts(a.startAt);
      const ranges = workingRangesForDate(doctor, clinic, s.dateStr);
      if (!ranges.some(r => s.min >= r.start && s.min < r.end)) fora++;
    }
    if (fora > 0) {
      foraDaEscala += fora;
      console.log(`      ⚠ ${fora} de ${futuras.length} marcações futuras ficam fora desta escala`);
    }

    if (apply) {
      await Doctor.updateOne({ _id: doctor._id }, { $set: { clinicSchedules } });
      gravados++;
    }
  }

  const naoNoQuadro = doctors.filter(d => !usados.has(String(d._id)));
  console.log('');
  if (semFicha.length) console.log(`SEM FICHA na base (criar em Corpo clínico e voltar a correr): ${semFicha.join(', ')}`);
  if (ambiguos.length) console.log(`NOME AMBÍGUO (não alterado):\n  ${ambiguos.join('\n  ')}`);
  if (naoNoQuadro.length) console.log(`Ativos na base mas FORA do quadro (não alterados): ${naoNoQuadro.map(d => d.name).join(', ')}`);
  if (duvidas.length) {
    console.log(`\nLinhas por confirmar (${incluirDuvidas ? 'INCLUÍDAS' : 'NÃO carregadas'}):`);
    for (const d of duvidas) console.log(`  · ${d}`);
  }
  console.log(`\nmarcações futuras fora da escala nova: ${foraDaEscala} (não são alteradas — aparecem na agenda em coluna "Fora da escala")`);
  console.log(apply ? `✓ ${gravados} médicos atualizados` : 'Nada gravado. Rever a lista e correr com --apply.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
