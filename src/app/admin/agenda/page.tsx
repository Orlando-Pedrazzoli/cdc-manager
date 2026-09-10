// 📄 src/app/admin/agenda/page.tsx
// =============================================================================
// CDC Manager — Admin: Agenda (vista Dia + vista Lista + painel 24h)
// -----------------------------------------------------------------------------
// Server Component: /admin/agenda?clinic=...&date=...&view=dia|lista
//                                &medico=...&estado=...
//
// Redesenho pós-demo (09/09/2026), alinhado com as práticas dos sistemas de
// gestão de clínicas (Doctolib/Dentrix/CareStack):
//   · VISTA DIA    — grelha por médico (a original), para operar o dia
//   · VISTA LISTA  — 7 dias a partir da data escolhida, tabela cronológica
//                    com filtros de ESTADO e MÉDICO em pills de um clique:
//                    a "visão ampla" que a direção pediu
//   · SALTO DE DATA — input de calendário nativo (DateJump): qualquer dia
//                    num clique, em vez de navegar seta a seta
//   · POR CONFIRMAR (24h) — painel de escalonamento: marcações pendentes
//                    que começam nas próximas 24h, com o TELEFONE do
//                    paciente à vista para a receção ligar. Best practice
//                    anti-no-show: não-resposta ao email ≠ confirmação.
// =============================================================================

import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  PhoneCall,
} from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import Doctor from '@/models/Doctor';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import TreatmentType from '@/models/TreatmentType';
import Patient from '@/models/Patient';
import {
  workingRangesForDate,
  lisbonToUtc,
  todayLisbon,
  weekdayOf,
  hhmmToMin,
} from '@/lib/availability';
import {
  AgendaGrid,
  type AgendaAppointment,
  type AgendaDoctorColumn,
} from '@/components/agenda/AgendaGrid';
import { AgendaToolbar } from '@/components/agenda/AgendaToolbar';
import { DateJump } from '@/components/agenda/DateJump';

export const dynamic = 'force-dynamic';

// -----------------------------------------------------------------------------
// Estados: rótulos e cores dos badges (uma linguagem visual em todo o admin)
// -----------------------------------------------------------------------------
const STATUS_META: Record<
  AppointmentStatus,
  { label: string; bg: string; fg: string }
> = {
  pending: { label: 'Pendente', bg: '#FFF4E0', fg: '#9A6700' },
  confirmed: { label: 'Confirmada', bg: '#E7F6EC', fg: '#1B7A3D' },
  'checked-in': { label: 'Check-in', bg: '#E8EEFF', fg: '#2743A6' },
  'in-progress': { label: 'Em consulta', bg: '#E8EEFF', fg: '#1B2A6B' },
  completed: { label: 'Concluída', bg: '#EEF0F4', fg: '#3A3F4A' },
  cancelled: { label: 'Cancelada', bg: '#FDEDED', fg: '#B3261E' },
  'no-show': { label: 'Falta', bg: '#FDEDED', fg: '#8C1D18' },
};

// Filtros de estado da vista Lista (ordem operacional)
const LIST_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'no-show', label: 'Faltas' },
];

/** Instante UTC → minutos do dia na parede de Lisboa */
function utcToLisbonMin(d: Date): { date: string; min: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    min: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function ptDateLabel(dateStr: string, withYear = false): string {
  const raw = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'Europe/Lisbon',
  }).format(lisbonToUtc(dateStr, 12 * 60));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    clinic?: string;
    date?: string;
    medico?: string;
    view?: string;
    estado?: string;
  }>;
}) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '')
    ? (sp.date as string)
    : todayLisbon();
  const view = sp.view === 'lista' ? 'lista' : 'dia';
  const estado =
    sp.estado && sp.estado in STATUS_META
      ? (sp.estado as AppointmentStatus)
      : null;

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === sp.clinic) ??
    clinics.find(c => c.slug === 'colombo') ??
    clinics[0];
  if (!clinic) {
    return <p>Nenhuma clínica configurada — correr o seed.</p>;
  }
  const clinicId = String(clinic._id);

  // Grelha: abertura ao fecho da clínica neste dia da semana
  const weekday = weekdayOf(date);
  const openRanges =
    clinic.openingHours.find(o => o.weekday === weekday)?.ranges ?? [];
  const gridStart = openRanges.length
    ? Math.min(...openRanges.map(r => hhmmToMin(r.start)))
    : 9 * 60;
  const gridEnd = openRanges.length
    ? Math.max(...openRanges.map(r => hhmmToMin(r.end)))
    : 20 * 60;

  // Médicos ativos NESTA clínica (colunas do dia + pills de filtro)
  const allDoctors = await Doctor.find({
    active: true,
    'clinicSchedules.clinicId': clinic._id,
  });
  const doctorColumns: AgendaDoctorColumn[] = allDoctors
    .map(d => ({
      id: String(d._id),
      name: d.name,
      color: d.color ?? '#2743A6',
      ranges: workingRangesForDate(d, clinic, date),
    }))
    .filter(d => d.ranges.length > 0);

  const medicoParam = /^[0-9a-fA-F]{24}$/.test(sp.medico ?? '')
    ? (sp.medico as string)
    : null;
  // Na vista DIA o filtro só faz sentido se o médico trabalhar nesse dia;
  // na LISTA aplica-se a qualquer médico ativo da clínica
  const medicoFilterDia =
    medicoParam && doctorColumns.some(d => d.id === medicoParam)
      ? medicoParam
      : null;
  const medicoFilterLista =
    medicoParam && allDoctors.some(d => String(d._id) === medicoParam)
      ? medicoParam
      : null;
  const visibleColumns = medicoFilterDia
    ? doctorColumns.filter(d => d.id === medicoFilterDia)
    : doctorColumns;

  const doctorNameById = new Map(allDoctors.map(d => [String(d._id), d.name]));

  // ---------------------------------------------------------------------------
  // Builder de URLs: preserva clínica/data/vista/filtros; '__DATE__' é o
  // placeholder que o DateJump substitui no cliente
  // ---------------------------------------------------------------------------
  const buildHref = (over: {
    clinic?: string;
    date?: string;
    view?: string;
    medico?: string | null;
    estado?: string | null;
  }) => {
    const c = over.clinic ?? clinic.slug;
    const d = over.date ?? date;
    const v = over.view ?? view;
    const m = over.medico === undefined ? medicoParam : over.medico;
    const e = over.estado === undefined ? estado : over.estado;
    let url = `/admin/agenda?clinic=${c}&date=${d}`;
    if (v !== 'dia') url += `&view=${v}`;
    // Mudar de clínica limpa o filtro de médico (médicos são por clínica)
    if (m && c === clinic.slug) url += `&medico=${m}`;
    if (e && v === 'lista') url += `&estado=${e}`;
    return url;
  };

  // ---------------------------------------------------------------------------
  // PAINEL "POR CONFIRMAR (24h)" — pendentes que começam nas próximas 24h
  // ---------------------------------------------------------------------------
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const unconfirmed = await Appointment.find({
    clinicId: clinic._id,
    status: 'pending',
    startAt: { $gt: now, $lte: in24h },
  })
    .select('patientId doctorId treatmentTypeId startAt reminder24hSentAt')
    .sort({ startAt: 1 })
    .limit(30)
    .lean();

  // ---------------------------------------------------------------------------
  // Dados da vista ativa
  // ---------------------------------------------------------------------------
  const listDays = 7;
  const listFrom = lisbonToUtc(date, 0);
  const listTo = lisbonToUtc(shiftDate(date, listDays - 1), 24 * 60);

  const apptQuery =
    view === 'lista'
      ? {
          clinicId: clinic._id,
          startAt: { $lt: listTo },
          endAt: { $gt: listFrom },
          ...(medicoFilterLista ? { doctorId: medicoFilterLista } : {}),
          ...(estado ? { status: estado } : {}),
        }
      : {
          clinicId: clinic._id,
          startAt: { $lt: lisbonToUtc(date, 24 * 60) },
          endAt: { $gt: lisbonToUtc(date, 0) },
        };

  const appts = await Appointment.find(apptQuery)
    .select(
      'doctorId patientId treatmentTypeId startAt endAt status channel confirmedVia',
    )
    .sort({ startAt: 1 })
    .lean();

  const patientIds = [
    ...appts.map(a => a.patientId),
    ...unconfirmed.map(a => a.patientId),
  ];
  const [patients, treatments] = await Promise.all([
    Patient.find({ _id: { $in: patientIds } })
      .select('name processNumber phone')
      .lean(),
    TreatmentType.find().select('name').sort({ name: 1 }).lean(),
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const treatmentById = new Map(treatments.map(t => [String(t._id), t.name]));

  const gridAppointments: AgendaAppointment[] = appts.map(a => {
    const s = utcToLisbonMin(a.startAt);
    const e = utcToLisbonMin(a.endAt);
    const p = patientById.get(String(a.patientId));
    return {
      id: String(a._id),
      doctorId: a.doctorId ? String(a.doctorId) : null,
      startMin: s.min,
      endMin: e.date === s.date ? e.min : 24 * 60,
      start: hhmm(s.min),
      end: hhmm(e.date === s.date ? e.min : 24 * 60),
      patientLabel: p ? `${p.name}` : '(paciente removido)',
      treatmentName: treatmentById.get(String(a.treatmentTypeId)) ?? '—',
      status: a.status,
    };
  });

  // Lista: agrupar por dia de Lisboa
  const listByDay = new Map<string, typeof appts>();
  if (view === 'lista') {
    for (const a of appts) {
      const day = utcToLisbonMin(a.startAt).date;
      const arr = listByDay.get(day) ?? [];
      arr.push(a);
      listByDay.set(day, arr);
    }
  }

  const dateLabel = ptDateLabel(date);
  const todayStr = todayLisbon();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho + navegação */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Agenda
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {view === 'lista'
              ? `${dateLabel} → ${ptDateLabel(shiftDate(date, listDays - 1))} (7 dias)`
              : dateLabel}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {/* Seletor de clínica */}
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #D8DEEF',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            {clinics.map(c => {
              const active = String(c._id) === clinicId;
              return (
                <Link
                  key={c.slug}
                  href={buildHref({ clinic: c.slug, medico: null })}
                  style={{
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    color: active ? '#FFFFFF' : '#1B2A6B',
                    backgroundColor: active ? '#2743A6' : '#FFFFFF',
                  }}
                >
                  {c.slug === 'colombo' ? 'Colombo' : 'Buraca'}
                </Link>
              );
            })}
          </div>

          {/* Vista Dia | Lista */}
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #D8DEEF',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            {(
              [
                ['dia', 'Dia'],
                ['lista', 'Lista (7 dias)'],
              ] as const
            ).map(([value, label]) => {
              const active = view === value;
              return (
                <Link
                  key={value}
                  href={buildHref({ view: value, estado: null })}
                  style={{
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    color: active ? '#FFFFFF' : '#1B2A6B',
                    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Navegação de datas: setas + Hoje + salto direto de calendário */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Link
              href={buildHref({
                date: shiftDate(date, view === 'lista' ? -7 : -1),
              })}
              aria-label={view === 'lista' ? 'Semana anterior' : 'Dia anterior'}
              style={navBtnStyle}
            >
              <ChevronLeft size={16} />
            </Link>
            <Link href={buildHref({ date: todayStr })} style={todayBtnStyle}>
              Hoje
            </Link>
            <Link
              href={buildHref({
                date: shiftDate(date, view === 'lista' ? 7 : 1),
              })}
              aria-label={view === 'lista' ? 'Semana seguinte' : 'Dia seguinte'}
              style={navBtnStyle}
            >
              <ChevronRight size={16} />
            </Link>
            <DateJump date={date} makeHref={buildHref({ date: '__DATE__' })} />
          </div>

          {/* Nova marcação (o modal tem seletor de data próprio) */}
          <AgendaToolbar
            clinicId={clinicId}
            date={date}
            doctors={doctorColumns.map(d => ({ id: d.id, name: d.name }))}
            treatments={treatments.map(t => ({
              id: String(t._id),
              name: t.name,
            }))}
            buttonLabel={
              <>
                <CalendarPlus size={16} style={{ marginRight: 6 }} />
                Nova marcação
              </>
            }
          />
        </div>
      </div>

      {/* PAINEL POR CONFIRMAR (24h) — escalonamento para chamada telefónica */}
      {unconfirmed.length > 0 && (
        <div
          style={{
            border: '1px solid #F0C36D',
            backgroundColor: '#FFF9EC',
            borderRadius: '12px',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <PhoneCall size={16} color='#9A6700' />
            <strong style={{ fontSize: '14px', color: '#9A6700' }}>
              Por confirmar nas próximas 24h — ligar ao paciente (
              {unconfirmed.length})
            </strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {unconfirmed.map(a => {
              const p = patientById.get(String(a.patientId));
              const s = utcToLisbonMin(a.startAt);
              const isToday = s.date === todayStr;
              return (
                <div
                  key={String(a._id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    fontSize: '13px',
                    color: '#3A3F4A',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: '#1B2A6B',
                      minWidth: 110,
                    }}
                  >
                    {isToday ? 'Hoje' : 'Amanhã'} {hhmm(s.min)}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {p?.name ?? '(paciente removido)'}
                  </span>
                  {p?.phone ? (
                    <a
                      href={`tel:${p.phone}`}
                      style={{
                        color: '#2743A6',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      {p.phone}
                    </a>
                  ) : (
                    <span style={{ color: '#B3261E' }}>sem telefone</span>
                  )}
                  <span style={{ color: '#6A7186' }}>
                    {treatmentById.get(String(a.treatmentTypeId)) ?? '—'}
                    {a.doctorId
                      ? ` · ${doctorNameById.get(String(a.doctorId)) ?? ''}`
                      : ''}
                  </span>
                  {!a.reminder24hSentAt && (
                    <span style={{ color: '#9A6700', fontSize: '12px' }}>
                      (lembrete ainda não enviado)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtro por médico */}
      {(view === 'lista'
        ? allDoctors.length > 1
        : doctorColumns.length > 1) && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Link
            href={buildHref({ medico: null })}
            style={doctorPillStyle(!medicoParam, '#2743A6')}
          >
            Todos
          </Link>
          {(view === 'lista'
            ? allDoctors.map(d => ({
                id: String(d._id),
                name: d.name,
                color: d.color ?? '#2743A6',
              }))
            : doctorColumns
          ).map(d => (
            <Link
              key={d.id}
              href={buildHref({ medico: d.id })}
              style={doctorPillStyle(medicoParam === d.id, d.color)}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '999px',
                  display: 'inline-block',
                  backgroundColor: medicoParam === d.id ? '#FFFFFF' : d.color,
                }}
              />
              {d.name}
            </Link>
          ))}
        </div>
      )}

      {/* Filtro de estado — só na vista Lista */}
      {view === 'lista' && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {LIST_STATUS_FILTERS.map(f => {
            const active = (estado ?? '') === f.value;
            return (
              <Link
                key={f.value || 'todas'}
                href={buildHref({ estado: f.value || null })}
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: active ? '#FFFFFF' : '#1B2A6B',
                  backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                  border: `1px solid ${active ? '#1B2A6B' : '#D8DEEF'}`,
                }}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Corpo da vista */}
      {view === 'dia' ? (
        <AgendaGrid
          gridStart={gridStart}
          gridEnd={gridEnd}
          doctors={visibleColumns}
          appointments={gridAppointments}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {appts.length === 0 && (
            <p
              style={{
                margin: 0,
                padding: '24px',
                textAlign: 'center',
                fontSize: '14px',
                color: '#6A7186',
                border: '1px dashed #D8DEEF',
                borderRadius: '12px',
              }}
            >
              Sem marcações neste período com os filtros ativos.
            </p>
          )}
          {[...listByDay.entries()].map(([day, dayAppts]) => (
            <div key={day}>
              <h2
                style={{
                  margin: '0 0 8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: day === todayStr ? '#2743A6' : '#1B2A6B',
                }}
              >
                {ptDateLabel(day)}
                {day === todayStr ? ' · Hoje' : ''}
                <span
                  style={{
                    marginLeft: 8,
                    fontWeight: 600,
                    color: '#6A7186',
                  }}
                >
                  {dayAppts.length}{' '}
                  {dayAppts.length === 1 ? 'marcação' : 'marcações'}
                </span>
              </h2>
              <div
                style={{
                  border: '1px solid #D8DEEF',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: '#FFFFFF',
                }}
              >
                {dayAppts.map((a, i) => {
                  const p = patientById.get(String(a.patientId));
                  const s = utcToLisbonMin(a.startAt);
                  const e = utcToLisbonMin(a.endAt);
                  const meta = STATUS_META[a.status as AppointmentStatus];
                  return (
                    <div
                      key={String(a._id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                        padding: '10px 14px',
                        borderTop: i === 0 ? 'none' : '1px solid #EEF0F4',
                        fontSize: '13px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: '#1B2A6B',
                          minWidth: 96,
                        }}
                      >
                        {hhmm(s.min)}–
                        {hhmm(e.date === s.date ? e.min : 24 * 60)}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: '#1B2A6B',
                          minWidth: 160,
                        }}
                      >
                        {p ? p.name : '(paciente removido)'}
                        {p?.processNumber ? (
                          <span style={{ color: '#6A7186', fontWeight: 500 }}>
                            {' '}
                            · {p.processNumber}
                          </span>
                        ) : null}
                      </span>
                      <span
                        style={{ color: '#3A3F4A', flex: 1, minWidth: 140 }}
                      >
                        {treatmentById.get(String(a.treatmentTypeId)) ?? '—'}
                      </span>
                      <span style={{ color: '#6A7186', minWidth: 120 }}>
                        {a.doctorId
                          ? (doctorNameById.get(String(a.doctorId)) ?? '—')
                          : 'Sem médico'}
                      </span>
                      {p?.phone && (
                        <a
                          href={`tel:${p.phone}`}
                          style={{
                            color: '#2743A6',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          {p.phone}
                        </a>
                      )}
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: meta.bg,
                          color: meta.fg,
                        }}
                      >
                        {meta.label}
                        {a.status === 'confirmed' && a.confirmedVia
                          ? ` · ${
                              a.confirmedVia === 'front-desk'
                                ? 'balcão'
                                : a.confirmedVia
                            }`
                          : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function doctorPillStyle(active: boolean, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    color: active ? '#FFFFFF' : '#1B2A6B',
    backgroundColor: active ? color : '#FFFFFF',
    border: `1px solid ${active ? color : '#D8DEEF'}`,
  };
}

const navBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
  textDecoration: 'none',
} as const;

const todayBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 12px',
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
  textDecoration: 'none',
} as const;
