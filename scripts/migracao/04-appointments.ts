// 📄 scripts/migracao/04-appointments.ts
// =============================================================================
// Passo 4 — agenda + faltas → Appointment
//
// · agenda (só linhas com Mecano > 0 — as restantes 2,3 M são bloqueios/notas
//   sem paciente e não são marcações)
//     passado  → completed (Conf=Sim → confirmedAt preenchido)
//     futuro   → confirmed (Conf=Sim) | pending
// · faltas (registo separado no Dentoral: a linha sai da agenda)
//     Falta    → no-show
//     Cancela  → cancelled (cancelledBy: patient | clinic conforme Tipo)
// · Duração: a agenda do Dentoral não guarda fim e tem UMA LINHA POR
//   INTERVALO ocupado. As linhas seguidas do mesmo paciente (mesmo médico e
//   dia) são UMA marcação; a grelha real de cada médico (15, 20, 30 min…)
//   infere-se do espaçamento entre linhas (lib/slots.ts). endAt = último
//   intervalo + grelha. [4.ª ronda do Victor, ponto 02: antes criava-se uma
//   marcação de 30 min por linha → paciente repetido e marcações sobrepostas]
// · Se a importação antiga já correu, as marcações a mais limpam-se com
//   15-fix-split-appointments.ts (este script só insere/atualiza).
// · treatmentTypeId = "Consulta (histórico Dentoral)" (ver 00-setup)
// · legacyId: agenda:<Medico>:<Dia>:<Hora>:<Mecano> | faltas:<...> (da 1.ª linha da marcação)
// Pagina por mês para não carregar 650 k linhas de uma vez.
// =============================================================================

import { runScript, q, str, yn, lisbonDate, log, progress, upsertByLegacyId, loadLegacyMap, loadRefs, type UpsertStats } from './lib/common';
import { mergeSlots, mergeSlotsWith, joinNotes, inferSlots, type SlotItem } from './lib/slots';

type AgendaRow = { Medico: number; Dia: string; Hora: string; Conf: string; Marcacao: string | null; Mecano: number; Entidade: number; Operador: number; DiaMarcacao: string; Obs: string | null; AuxSMS: string; PacOptions: string; PacComment: string | null; ObsRemote: string | null };
type FaltaRow = { Medico: number; Mecano: number; Dia: string; Hora: string; FaltaCancela: string; Marcacao: string; Obs: string; Tipo: string };

void runScript('04-appointments', async args => {
  const { Appointment, Patient, Doctor } = await import('@/models');
  const refs = await loadRefs();
  const patientMap = await loadLegacyMap(Patient);
  const doctorMap = await loadLegacyMap(Doctor);
  log(`mapas: ${patientMap.size} pacientes, ${doctorMap.size} médicos`);

  const months = await q<{ ym: string; n: number }>(`
    SELECT DATE_FORMAT(Dia, '%Y-%m') ym, COUNT(*) n FROM agenda WHERE Mecano > 0 AND Dia >= ? GROUP BY ym ORDER BY ym`,
    [args.since ?? '2000-01-01']);
  const total = months.reduce((a, m) => a + Number(m.n), 0);
  log(`agenda com paciente: ${total} linhas em ${months.length} meses`);

  const now = new Date();
  const stats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let done = 0, noPatient = 0, mergedRows = 0;
  const t0 = Date.now();

  /** grelha (min) por médico|dia, inferida da agenda — usada também nas faltas */
  const slotByDoctorDay = new Map<string, number>();

  const doctorFor = (code: unknown) => {
    const c = Number(code);
    if (!c) return null;
    return doctorMap.get(`dentoral:${c}`) ?? refs.placeholderDoctorId;
  };

  for (const m of months) {
    if (done >= args.limit) break;
    const rows = await q<AgendaRow>(`
      SELECT Medico, Dia, Hora, Conf, Marcacao, Mecano, Entidade, Operador, DiaMarcacao, Obs, AuxSMS, PacOptions, PacComment, ObsRemote
      FROM agenda WHERE Mecano > 0 AND DATE_FORMAT(Dia, '%Y-%m') = ? ORDER BY Dia, Hora`, [m.ym]);
    const docs: Record<string, any>[] = [];
    const items: SlotItem<{ row: AgendaRow; patientId: unknown }>[] = [];
    for (const r of rows) {
      if (done >= args.limit) break;
      done++;
      const patientId = patientMap.get(`dentoral:${Number(r.Mecano)}`);
      if (!patientId) { noPatient++; continue; }
      const startAt = lisbonDate(r.Dia, r.Hora);
      if (!startAt) continue;
      items.push({ doctor: String(Number(r.Medico)), day: String(r.Dia).slice(0, 10), startMs: startAt.getTime(), patient: String(Number(r.Mecano)), kind: 'agenda', ref: { row: r, patientId } });
    }
    // grelha do médico neste mês (reutilizada nas faltas, que não têm vizinhos)
    const { slotFor } = inferSlots(items);
    for (const it of items) slotByDoctorDay.set(`${it.doctor}|${it.day}`, slotFor(it.doctor, it.day));
    for (const mrg of mergeSlots(items)) {
      const r = mrg.first.ref.row;
      const patientId = mrg.first.ref.patientId;
      mergedRows += mrg.members.length - 1;
      const startAt = new Date(mrg.startMs);
      const endAt = new Date(mrg.endMs);
      const past = startAt < now;
      const confirmed = mrg.members.some(x => yn(x.ref.row.Conf));
      const booked = lisbonDate(r.DiaMarcacao) ?? startAt;
      const note = joinNotes(mrg.members.flatMap(x => [str(x.ref.row.Obs, 200), str(x.ref.row.PacComment, 200), str(x.ref.row.ObsRemote, 200)]));
      docs.push({
        legacyId: `agenda:${r.Medico}:${r.Dia}:${r.Hora}:${r.Mecano}`,
        clinicId: refs.clinicId,
        patientId,
        doctorId: doctorFor(r.Medico),
        treatmentTypeId: refs.legacyAppointmentTypeId,
        roomId: null,
        startAt,
        endAt,
        status: past ? 'completed' : confirmed ? 'confirmed' : 'pending',
        channel: 'front-desk',
        createdByUserId: null,
        note,
        confirmToken: null,
        confirmedAt: confirmed ? booked : null,
        confirmedVia: confirmed ? 'front-desk' : null,
        reminder72hSentAt: null,
        reminder24hSentAt: null,
        isUrgent: false,
        cancelledAt: null,
        cancelledBy: null,
        cancelledByUserId: null,
        cancelReason: null,
        rescheduledToId: null,
        rescheduledFromId: null,
        checkedInAt: past ? startAt : null,
        startedAt: past ? startAt : null,
        completedAt: past ? endAt : null,
        legacyData: { marcacao: str(r.Marcacao), operador: Number(r.Operador), entidade: Number(r.Entidade), auxSMS: r.AuxSMS, pacOptions: r.PacOptions, fonte: 'agenda', intervalos: mrg.members.length, grelhaMin: mrg.slotMin },
        createdAt: booked,
      });
    }
    await upsertByLegacyId(Appointment, docs, args, stats);
    progress('agenda', done, total, t0);
  }
  console.log();
  log('agenda → appointments', { ...stats, semPaciente: noPatient, linhasJuntas: mergedRows });

  // --- faltas / cancelamentos ----------------------------------------------
  const faltas = await q<FaltaRow>(`SELECT Medico, Mecano, Dia, Hora, FaltaCancela, Marcacao, Obs, Tipo FROM faltas WHERE Mecano > 0 AND Dia >= ? ORDER BY Dia`, [args.since ?? '2000-01-01']);
  log(`faltas: ${faltas.length} linhas`);
  const fstats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let fdone = 0, fNoPatient = 0;
  const faltaItems: SlotItem<{ row: FaltaRow; patientId: unknown }>[] = [];
  for (const r of faltas) {
    if (fdone >= args.limit) break;
    fdone++;
    const patientId = patientMap.get(`dentoral:${Number(r.Mecano)}`);
    if (!patientId) { fNoPatient++; continue; }
    const startAt = lisbonDate(r.Dia, r.Hora);
    if (!startAt) continue;
    faltaItems.push({ doctor: String(Number(r.Medico)), day: String(r.Dia).slice(0, 10), startMs: startAt.getTime(), patient: String(Number(r.Mecano)), kind: `${r.FaltaCancela}|${r.Tipo}`, ref: { row: r, patientId } });
  }
  // nas faltas só se juntam linhas pela grelha que a agenda desse dia tinha
  const faltaChains = mergeSlotsWith(faltaItems, (d, day) => slotByDoctorDay.get(`${d}|${day}`) ?? null);
  for (let i = 0; i < faltaChains.length; i += args.batch) {
    const docs: Record<string, any>[] = [];
    for (const mrg of faltaChains.slice(i, i + args.batch)) {
      const r = mrg.first.ref.row;
      const patientId = mrg.first.ref.patientId;
      const startAt = new Date(mrg.startMs);
      // a falta sai da agenda: usa-se a grelha que a agenda desse médico tinha nesse dia
      const slotMin = slotByDoctorDay.get(`${mrg.first.doctor}|${mrg.first.day}`) ?? mrg.slotMin;
      const endAt = new Date(mrg.members[mrg.members.length - 1].startMs + slotMin * 60000);
      const isNoShow = r.FaltaCancela === 'Falta';
      docs.push({
        legacyId: `faltas:${r.Medico}:${r.Dia}:${r.Hora}:${r.Mecano}`,
        clinicId: refs.clinicId,
        patientId,
        doctorId: doctorFor(r.Medico),
        treatmentTypeId: refs.legacyAppointmentTypeId,
        roomId: null,
        startAt,
        endAt,
        status: isNoShow ? 'no-show' : 'cancelled',
        channel: 'front-desk',
        createdByUserId: null,
        note: joinNotes(mrg.members.map(x => str(x.ref.row.Obs, 500))),
        confirmToken: null,
        confirmedAt: null,
        confirmedVia: null,
        reminder72hSentAt: null,
        reminder24hSentAt: null,
        isUrgent: false,
        cancelledAt: isNoShow ? null : startAt,
        cancelledBy: isNoShow ? null : r.Tipo === 'Med' ? 'clinic' : 'patient',
        cancelledByUserId: null,
        cancelReason: isNoShow ? null : 'Cancelada no Dentoral',
        rescheduledToId: null,
        rescheduledFromId: null,
        checkedInAt: null,
        startedAt: null,
        completedAt: null,
        legacyData: { marcacao: str(r.Marcacao), faltaCancela: r.FaltaCancela, tipo: r.Tipo, fonte: 'faltas', intervalos: mrg.members.length },
        createdAt: startAt,
      });
    }
    await upsertByLegacyId(Appointment, docs, args, fstats);
    progress('faltas', Math.min(i + args.batch, faltaChains.length), faltaChains.length, t0);
  }
  console.log();
  log('faltas → appointments', { ...fstats, semPaciente: fNoPatient, linhasJuntas: faltaItems.length - faltaChains.length });
});
