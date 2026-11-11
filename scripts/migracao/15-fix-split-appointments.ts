// 📄 scripts/migracao/15-fix-split-appointments.ts
// =============================================================================
// Reparação — marcações do Dentoral importadas "uma por intervalo"
// (4.ª ronda de apontamentos do Victor, nov. 2026, ponto 02)
//
// SINTOMA na agenda: o mesmo paciente duas vezes seguidas (10:20 e 10:40) e os
// horários a alternar entre duas colunas. CAUSA: a 1.ª versão do
// 04-appointments.ts criava uma marcação de 30 min por cada LINHA da agenda do
// Dentoral, que tem uma linha por intervalo ocupado.
//
// O QUE FAZ (só no Mongo — não precisa do MySQL do Dentoral ligado):
//   1. lê as marcações importadas (legacyId 'agenda:…' / 'faltas:…') que a
//      clínica NUNCA alterou no CDC (updatedAt = createdAt);
//   2. infere a grelha real de cada médico por dia (lib/slots.ts);
//   3. por cada consulta partida em várias: fica a 1.ª (com fim e observações
//      corrigidos), as referências das outras passam para ela, e as outras
//      são apagadas;
//   4. acerta o fim das marcações isoladas (deixam de ter 30 min fixos).
//
// SEGURANÇA
//   · Por omissão é SIMULAÇÃO: não escreve nada, só conta e mostra exemplos.
//   · Para gravar: --apply. Antes de apagar, guarda cópia integral das
//     marcações apagadas em scripts/migracao/data/backup-split-<data>.jsonl
//   · Marcações criadas ou alteradas no CDC ficam intactas.
//   · Pode correr-se mais de uma vez (a 2.ª não encontra nada para fazer).
//
// Correr (PowerShell, na pasta do projeto):
//   npx tsx --env-file=.env.local scripts/migracao/15-fix-split-appointments.ts
//   npx tsx --env-file=.env.local scripts/migracao/15-fix-split-appointments.ts --apply
// Opcional: --since 2026-01-01 (só marcações a partir dessa data)
// =============================================================================

import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Types } from 'mongoose';
import { runScript, log } from './lib/common';
import { mergeSlots, joinNotes, type SlotItem } from './lib/slots';

type Doc = {
  _id: Types.ObjectId;
  legacyId: string;
  doctorId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  status: string;
  note: string | null;
  confirmedAt: Date | null;
  confirmedVia: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  legacyData?: { fonte?: string } | null;
};

const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const lisbonDay = (d: Date) => dayFmt.format(d);
const hhmm = (d: Date | number) => timeFmt.format(d);

void runScript('15-fix-split-appointments', async args => {
  const { Appointment, Procedure, Document, Notification, Odontogram, ClinicalRecord, Patient, Doctor } = await import('@/models');
  const { default: LabCase } = await import('@/models/LabCase');
  const { default: RxRequest } = await import('@/models/RxRequest');
  const apply = args.flags['apply'] === true;
  log(apply ? '⚠ MODO GRAVAÇÃO (--apply)' : 'SIMULAÇÃO — nada é gravado (usar --apply para gravar)');

  const filter: Record<string, unknown> = { legacyId: { $regex: /^(agenda|faltas):/ } };
  if (args.since) filter.startAt = { $gte: new Date(`${args.since}T00:00:00Z`) };

  // meses a percorrer (limita a memória)
  const range = await Appointment.aggregate<{ min: Date; max: Date; n: number }>([
    { $match: filter },
    { $group: { _id: null, min: { $min: '$startAt' }, max: { $max: '$startAt' }, n: { $sum: 1 } } },
  ]);
  if (!range[0]) {
    log('não há marcações importadas do Dentoral — nada a fazer');
    return;
  }
  log(`marcações importadas: ${range[0].n} (de ${lisbonDay(range[0].min)} a ${lisbonDay(range[0].max)})`);

  const totals = { lidas: 0, alteradasNoCdc: 0, consultasPartidas: 0, aApagar: 0, fimCorrigido: 0, referenciasMovidas: 0 };
  const slotCount = new Map<number, number>();
  const examples: string[] = [];
  let backup: ReturnType<typeof createWriteStream> | null = null;
  let backupPath = '';

  const refModels = [
    ['Procedure', Procedure],
    ['LabCase', LabCase],
    ['Document', Document],
    ['Notification', Notification],
    ['Odontogram', Odontogram],
    ['RxRequest', RxRequest],
  ] as const;

  const cursorMonth = new Date(Date.UTC(range[0].min.getUTCFullYear(), range[0].min.getUTCMonth(), 1));
  const lastMonth = range[0].max;
  for (; cursorMonth <= lastMonth; cursorMonth.setUTCMonth(cursorMonth.getUTCMonth() + 1)) {
    const from = new Date(cursorMonth);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const docs = (await Appointment.find(
      { ...filter, startAt: { $gte: args.since && from < new Date(`${args.since}T00:00:00Z`) ? new Date(`${args.since}T00:00:00Z`) : from, $lt: to } },
      { legacyId: 1, doctorId: 1, patientId: 1, startAt: 1, endAt: 1, status: 1, note: 1, confirmedAt: 1, confirmedVia: 1, completedAt: 1, createdAt: 1, updatedAt: 1, 'legacyData.fonte': 1 },
    ).lean()) as unknown as Doc[];
    if (docs.length === 0) continue;
    totals.lidas += docs.length;

    const items: SlotItem<Doc>[] = [];
    for (const d of docs) {
      // tocada pela clínica depois da importação → não se mexe
      if (d.updatedAt && d.createdAt && d.updatedAt.getTime() !== d.createdAt.getTime()) {
        totals.alteradasNoCdc++;
        continue;
      }
      const fonte = d.legacyData?.fonte ?? (d.legacyId.startsWith('faltas:') ? 'faltas' : 'agenda');
      items.push({
        doctor: String(d.doctorId ?? 'sem-medico'),
        day: lisbonDay(d.startAt),
        startMs: d.startAt.getTime(),
        patient: String(d.patientId),
        kind: fonte === 'faltas' ? d.status : 'agenda',
        ref: d,
      });
    }

    const ops: Record<string, unknown>[] = [];
    const moves: { from: Types.ObjectId; to: Types.ObjectId }[] = [];
    for (const m of mergeSlots(items)) {
      slotCount.set(m.slotMin, (slotCount.get(m.slotMin) ?? 0) + 1);
      const keep = m.first.ref;
      const extras = m.members.slice(1).map(x => x.ref);
      const endAt = new Date(m.endMs);
      const set: Record<string, unknown> = {};
      if (keep.endAt.getTime() !== endAt.getTime()) {
        set.endAt = endAt;
        if (keep.completedAt && keep.completedAt.getTime() === keep.endAt.getTime()) set.completedAt = endAt;
      }
      if (extras.length > 0) {
        totals.consultasPartidas++;
        totals.aApagar += extras.length;
        const note = joinNotes(m.members.map(x => x.ref.note));
        if (note !== (keep.note ?? null)) set.note = note;
        const confirmedBy = m.members.map(x => x.ref).find(x => x.confirmedAt);
        if (keep.status === 'pending' && confirmedBy) {
          set.status = 'confirmed';
          set.confirmedAt = confirmedBy.confirmedAt;
          set.confirmedVia = confirmedBy.confirmedVia ?? 'front-desk';
        }
        for (const e of extras) moves.push({ from: e._id, to: keep._id });
        if (examples.length < 12) {
          examples.push(`${m.first.day} ${m.members.map(x => hhmm(x.startMs)).join(' + ')} → ${hhmm(m.startMs)}–${hhmm(m.endMs)} (grelha ${m.slotMin} min) · médico ${m.first.doctor} · paciente ${m.first.patient}`);
        }
      } else if (set.endAt) {
        totals.fimCorrigido++;
      }
      if (Object.keys(set).length > 0) {
        // updatedAt fica igual a createdAt: continua a contar como "não alterada no CDC"
        ops.push({ updateOne: { filter: { _id: keep._id }, update: { $set: set } } });
      }
    }

    if (apply && (ops.length > 0 || moves.length > 0)) {
      const extraIds = moves.map(x => x.from);
      const target = new Map(moves.map(x => [String(x.from), x.to]));
      // 1) cópia integral do que vai ser apagado
      if (extraIds.length > 0) {
        if (!backup) {
          const dir = join(dirname(fileURLToPath(import.meta.url)), 'data');
          mkdirSync(dir, { recursive: true });
          backupPath = join(dir, `backup-split-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
          backup = createWriteStream(backupPath, { encoding: 'utf8' });
        }
        for (let i = 0; i < extraIds.length; i += 2000) {
          const full = await Appointment.find({ _id: { $in: extraIds.slice(i, i + 2000) } }).lean();
          for (const f of full) backup.write(JSON.stringify(f) + '\n');
        }
        // 2) referências das marcações a apagar passam para a que fica
        for (const [, model] of refModels) {
          for (let i = 0; i < extraIds.length; i += 2000) {
             
            const hits = (await (model as any).find({ appointmentId: { $in: extraIds.slice(i, i + 2000) } }, { appointmentId: 1 }).lean()) as { _id: Types.ObjectId; appointmentId: Types.ObjectId }[];
            if (hits.length === 0) continue;
             
            await (model as any).bulkWrite(
              hits.map(h => ({ updateOne: { filter: { _id: h._id }, update: { $set: { appointmentId: target.get(String(h.appointmentId)) } } } })),
              { ordered: false, timestamps: false },
            );
            totals.referenciasMovidas += hits.length;
          }
        }
        for (let i = 0; i < extraIds.length; i += 2000) {
          const batch = extraIds.slice(i, i + 2000);
          const recs = await ClinicalRecord.find({ 'notes.appointmentId': { $in: batch } }, { 'notes._id': 1, 'notes.appointmentId': 1 }).lean();
          for (const rec of recs as unknown as { _id: Types.ObjectId; notes: { _id: Types.ObjectId; appointmentId: Types.ObjectId | null }[] }[]) {
            for (const nt of rec.notes) {
              const to = nt.appointmentId ? target.get(String(nt.appointmentId)) : null;
              if (!to) continue;
              await ClinicalRecord.updateOne({ _id: rec._id, 'notes._id': nt._id }, { $set: { 'notes.$.appointmentId': to } }, { timestamps: false });
              totals.referenciasMovidas++;
            }
          }
        }
      }
      // 3) corrige as que ficam, 4) apaga as que sobram
       
      if (ops.length > 0) await Appointment.bulkWrite(ops as any, { ordered: false, timestamps: false });
      for (let i = 0; i < extraIds.length; i += 2000) await Appointment.deleteMany({ _id: { $in: extraIds.slice(i, i + 2000) } });
    } else if (!apply && moves.length > 0) {
      // simulação: conta as referências que seriam movidas
      const extraIds = moves.map(x => x.from);
      for (const [, model] of refModels) {
        for (let i = 0; i < extraIds.length; i += 2000) {
           
          totals.referenciasMovidas += await (model as any).countDocuments({ appointmentId: { $in: extraIds.slice(i, i + 2000) } });
        }
      }
    }
    process.stdout.write(`\r  ${from.toISOString().slice(0, 7)}: ${totals.lidas} lidas, ${totals.consultasPartidas} consultas partidas      `);
  }
  console.log();

  if (backup) {
    await new Promise<void>(resolve => backup!.end(resolve));
    log(`cópia das marcações apagadas: ${backupPath}`);
  }

  // exemplos com nomes (só leitura), para o Victor reconhecer os casos
  if (examples.length > 0) {
    const ids = (re: RegExp) => [...new Set(examples.map(e => re.exec(e)?.[1]).filter((x): x is string => !!x && Types.ObjectId.isValid(x)))];
    const patients = await Patient.find({ _id: { $in: ids(/paciente (\w+)/) } }, { name: 1 }).lean();
    const doctors = await Doctor.find({ _id: { $in: ids(/médico (\w+)/) } }, { name: 1 }).lean();
    const nameOf = new Map<string, string>([...patients, ...doctors].map(d => [String(d._id), String((d as { name?: string }).name ?? d._id)]));
    log('exemplos:');
    for (const e of examples) console.log('   ' + e.replace(/(médico|paciente) (\w+)/g, (_, k: string, id: string) => `${k} ${nameOf.get(id) ?? id}`));
  }
  log('grelhas inferidas (min → n.º de marcações)', Object.fromEntries([...slotCount].sort((a, b) => a[0] - b[0])));
  log(apply ? 'RESULTADO (gravado)' : 'RESULTADO DA SIMULAÇÃO (nada gravado)', totals);
  if (!apply && (totals.aApagar > 0 || totals.fimCorrigido > 0)) log('para gravar: repetir o comando com --apply');
});
