// 📄 src/lib/availability.ts
// =============================================================================
// CDC Manager — Motor de Disponibilidade
// -----------------------------------------------------------------------------
// O ÚNICO sítio do sistema onde "hora de parede de Lisboa" (regras de horário
// em HH:mm) se converte em instantes UTC (Appointment.startAt/endAt) — toda a
// lógica de timezone/DST vive aqui e em mais lado nenhum.
//
// Cálculo de slots livres de um médico numa clínica num dia:
//
//   1. Semana-tipo do médico NESSA clínica (Doctor.clinicSchedules)
//   2. ± exceções aplicáveis à data:
//        'unavailable' global (férias)        → dia vazio nas duas clínicas
//        'unavailable' da clínica             → dia vazio só nessa clínica
//        'custom' (da clínica > global)       → substitui a semana-tipo
//   3. ∩ horário de abertura da clínica (Clinic.openingHours — a pausa de
//      almoço da Buraca entra aqui naturalmente: dois intervalos)
//   4. Grelha de 15 min: candidato a slot = início onde duração+buffer cabe
//      inteiro dentro de um intervalo de trabalho
//   5. − marcações bloqueantes DO MÉDICO em QUALQUER clínica (uma pessoa não
//      está em Sete Rios e na Buraca ao mesmo tempo)
//   6. − slots onde a CAPACIDADE da clínica está cheia (nº de marcações
//      bloqueantes sobrepostas ≥ maxConcurrentAppointments; conta marcações
//      de todos os médicos E as sem médico atribuído — também ocupam gabinete)
//
// Duas superfícies:
//   computeFreeSlots(...)  → leitura em lote (UI de marcação, N dias)
//   isSlotAvailable(...)   → re-verificação pontual no MOMENTO da escrita
//                            (chamada dentro da transação da action)
// =============================================================================

import mongoose from 'mongoose';
import Appointment, { BLOCKING_STATUS } from '@/models/Appointment';
import Clinic, { type ClinicDoc } from '@/models/Clinic';
import Doctor, {
  getExceptionsForDate,
  getScheduleForClinic,
  type DoctorDoc,
} from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';

export const SLOT_GRID_MIN = 15;
const TZ = 'Europe/Lisbon';

// -----------------------------------------------------------------------------
// Tempo: intervalos em MINUTOS do dia (puro, testável)
// -----------------------------------------------------------------------------
export interface MinRange {
  start: number; // minutos desde as 00:00 (ex.: 09:00 = 540)
  end: number;
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Interseção de duas listas de intervalos (ambas assumidas ordenadas) */
export function intersectRanges(a: MinRange[], b: MinRange[]): MinRange[] {
  const out: MinRange[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (start < end) out.push({ start, end });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Inícios de slot válidos: grelha de 15 min onde [start, start+total] cabe */
export function slotStartsInRanges(
  ranges: MinRange[],
  totalMin: number,
): number[] {
  const starts: number[] = [];
  for (const r of ranges) {
    // Primeiro início alinhado à grelha dentro do intervalo
    const first = Math.ceil(r.start / SLOT_GRID_MIN) * SLOT_GRID_MIN;
    for (let s = first; s + totalMin <= r.end; s += SLOT_GRID_MIN) {
      starts.push(s);
    }
  }
  return starts;
}

// -----------------------------------------------------------------------------
// Timezone: parede de Lisboa → UTC (com DST correto, sem libs externas)
// -----------------------------------------------------------------------------
function tzOffsetMs(utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(utcDate)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour % 24, // Intl pode devolver '24' à meia-noite
    p.minute,
    p.second,
  );
  return asUtc - utcDate.getTime();
}

/** 'YYYY-MM-DD' + minutos do dia (parede Lisboa) → instante UTC */
export function lisbonToUtc(dateStr: string, minOfDay: number): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, 0, minOfDay);
  // Dupla passagem: corrige transições de DST (mar/out)
  const off1 = tzOffsetMs(new Date(guess));
  const off2 = tzOffsetMs(new Date(guess - off1));
  return new Date(guess - off2);
}

/** Dia da semana (0=Dom…6=Sáb) de uma data civil 'YYYY-MM-DD' */
export function weekdayOf(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** Data civil de HOJE em Lisboa ('YYYY-MM-DD') */
export function todayLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** Lista de datas civis 'YYYY-MM-DD' de from a to (inclusive) */
export function dateRange(fromStr: string, toStr: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Instante UTC → componentes de "parede" em Lisboa (inverso de lisbonToUtc).
 * Usado para verificar se marcações existentes cabem em novos horários de
 * funcionamento (Configurações) — leitura pura, nunca altera marcações.
 */
export function utcToLisbonParts(instant: Date): {
  dateStr: string; // 'YYYY-MM-DD' civil em Lisboa
  weekday: number; // 0=Dom…6=Sáb
  min: number; // minutos desde as 00:00 (parede Lisboa)
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const hour = p.hour % 24; // Intl pode devolver '24' à meia-noite
  const dateStr = `${p.year}-${String(p.month).padStart(2, '0')}-${String(
    p.day,
  ).padStart(2, '0')}`;
  return {
    dateStr,
    weekday: weekdayOf(dateStr),
    min: hour * 60 + p.minute,
  };
}

/** [startMin, endMin] cabe INTEIRAMENTE dentro de algum dos intervalos? */
export function fitsWithinRanges(
  startMin: number,
  endMin: number,
  ranges: MinRange[],
): boolean {
  return ranges.some(r => startMin >= r.start && endMin <= r.end);
}

// -----------------------------------------------------------------------------
// Passos 1–3: intervalos de trabalho efetivos do médico numa clínica num dia
// -----------------------------------------------------------------------------
export function workingRangesForDate(
  doctor: DoctorDoc,
  clinic: ClinicDoc,
  dateStr: string, // 'YYYY-MM-DD'
): MinRange[] {
  const clinicId = String(clinic._id);
  const schedule = getScheduleForClinic(doctor, clinicId);
  if (!schedule) return []; // médico não trabalha nesta clínica

  const weekday = weekdayOf(dateStr);

  // Semana-tipo do médico nesta clínica para este dia da semana
  let doctorRanges: MinRange[] =
    schedule.weeklySchedule
      .find(w => w.weekday === weekday)
      ?.ranges.map(r => ({
        start: hhmmToMin(r.start),
        end: hhmmToMin(r.end),
      })) ?? [];

  // Exceções aplicáveis (globais + desta clínica)
  const exceptions = getExceptionsForDate(doctor, dateStr, clinicId);
  if (exceptions.some(e => e.type === 'unavailable')) return [];
  const custom =
    exceptions.find(e => e.type === 'custom' && e.clinicId) ??
    exceptions.find(e => e.type === 'custom');
  if (custom) {
    doctorRanges = custom.ranges.map(r => ({
      start: hhmmToMin(r.start),
      end: hhmmToMin(r.end),
    }));
  }
  if (doctorRanges.length === 0) return [];

  // ∩ abertura da clínica (pausa de almoço da Buraca entra aqui)
  const clinicRanges: MinRange[] =
    clinic.openingHours
      .find(o => o.weekday === weekday)
      ?.ranges.map(r => ({
        start: hhmmToMin(r.start),
        end: hhmmToMin(r.end),
      })) ?? [];
  if (clinicRanges.length === 0) return [];

  return intersectRanges(doctorRanges, clinicRanges);
}

// -----------------------------------------------------------------------------
// Passos 4–6: slots livres num intervalo de datas
// -----------------------------------------------------------------------------
export interface FreeSlot {
  date: string; // 'YYYY-MM-DD' (Lisboa)
  start: string; // 'HH:mm' (Lisboa) — para a UI
  startAt: Date; // instante UTC — para criar a Appointment
  endAt: Date; // startAt + duração + buffer
}

export interface ComputeFreeSlotsParams {
  clinicId: string;
  doctorId: string;
  treatmentTypeId: string;
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string; // 'YYYY-MM-DD' (inclusive)
  /** true = aplicar políticas de marcação online (antecedência mín/máx) */
  onlineRules?: boolean;
}

export async function computeFreeSlots(
  params: ComputeFreeSlotsParams,
): Promise<FreeSlot[]> {
  const [clinic, doctor, treatment] = await Promise.all([
    Clinic.findById(params.clinicId),
    Doctor.findById(params.doctorId),
    TreatmentType.findById(params.treatmentTypeId).select(
      'durationMin bufferMin',
    ),
  ]);
  if (!clinic || !clinic.isActive) return [];
  if (!doctor || !doctor.active) return [];
  if (!treatment) return [];

  const totalMin = treatment.durationMin + (treatment.bufferMin ?? 0);
  const dates = dateRange(params.dateFrom, params.dateTo);
  if (dates.length === 0) return [];

  // Janela UTC completa do pedido (folga de 1 dia para DST/limites)
  const windowStart = lisbonToUtc(dates[0], 0);
  const windowEnd = lisbonToUtc(dates[dates.length - 1], 24 * 60);

  // UMA query por dimensão para todo o intervalo (contagem em memória):
  const [doctorAppts, clinicAppts] = await Promise.all([
    // Conflito de médico — TODAS as clínicas, de propósito
    Appointment.find({
      doctorId: doctor._id,
      status: { $in: BLOCKING_STATUS },
      startAt: { $lt: windowEnd },
      endAt: { $gt: windowStart },
    })
      .select('startAt endAt')
      .lean(),
    // Capacidade — SÓ esta clínica, todos os médicos + sem médico
    Appointment.find({
      clinicId: clinic._id,
      status: { $in: BLOCKING_STATUS },
      startAt: { $lt: windowEnd },
      endAt: { $gt: windowStart },
    })
      .select('startAt endAt')
      .lean(),
  ]);

  const cap = clinic.maxConcurrentAppointments;
  const now = Date.now();
  const minNoticeMs = params.onlineRules
    ? clinic.onlineMinNoticeHours * 3600_000
    : 0;
  const maxAdvanceMs = params.onlineRules
    ? clinic.onlineMaxAdvanceDays * 86_400_000
    : Number.POSITIVE_INFINITY;

  const out: FreeSlot[] = [];

  for (const dateStr of dates) {
    const ranges = workingRangesForDate(doctor, clinic, dateStr);
    if (ranges.length === 0) continue;

    for (const startMin of slotStartsInRanges(ranges, totalMin)) {
      const startAt = lisbonToUtc(dateStr, startMin);
      const endAt = new Date(startAt.getTime() + totalMin * 60_000);
      const s = startAt.getTime();
      const e = endAt.getTime();

      // Políticas temporais (passado nunca; online: antecedência mín/máx)
      if (s <= now + minNoticeMs) continue;
      if (s > now + maxAdvanceMs) continue;

      // 5. Médico ocupado (qualquer clínica)?
      if (
        doctorAppts.some(a => a.startAt.getTime() < e && a.endAt.getTime() > s)
      )
        continue;

      // 6. Capacidade da clínica cheia neste intervalo?
      let overlapping = 0;
      for (const a of clinicAppts) {
        if (a.startAt.getTime() < e && a.endAt.getTime() > s) {
          overlapping++;
          if (overlapping >= cap) break;
        }
      }
      if (overlapping >= cap) continue;

      out.push({ date: dateStr, start: minToHhmm(startMin), startAt, endAt });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Re-verificação ATÓMICA no momento da escrita (dentro da transação)
// -----------------------------------------------------------------------------
export async function isSlotAvailable(params: {
  clinicId: string;
  doctorId: string | null;
  startAt: Date;
  endAt: Date;
  session?: mongoose.ClientSession;
  /** Ignorar esta marcação (caso: remarcação da própria) */
  excludeAppointmentId?: string;
}): Promise<
  { ok: true } | { ok: false; reason: 'doctor-busy' | 'clinic-full' }
> {
  const overlap = {
    status: { $in: BLOCKING_STATUS },
    startAt: { $lt: params.endAt },
    endAt: { $gt: params.startAt },
    ...(params.excludeAppointmentId
      ? {
          _id: {
            $ne: new mongoose.Types.ObjectId(params.excludeAppointmentId),
          },
        }
      : {}),
  };

  // Conflito de médico (todas as clínicas)
  if (params.doctorId) {
    const busy = await Appointment.countDocuments(
      { ...overlap, doctorId: new mongoose.Types.ObjectId(params.doctorId) },
      { session: params.session },
    );
    if (busy > 0) return { ok: false, reason: 'doctor-busy' };
  }

  // Capacidade da clínica
  const clinic = await Clinic.findById(params.clinicId)
    .select('maxConcurrentAppointments')
    .session(params.session ?? null);
  if (!clinic) return { ok: false, reason: 'clinic-full' };

  const concurrent = await Appointment.countDocuments(
    { ...overlap, clinicId: new mongoose.Types.ObjectId(params.clinicId) },
    { session: params.session },
  );
  if (concurrent >= clinic.maxConcurrentAppointments) {
    return { ok: false, reason: 'clinic-full' };
  }
  return { ok: true };
}
