// 📄 src/app/admin/medicos/[id]/page.tsx
// =============================================================================
// CDC Manager — Admin: Ficha do Médico
// -----------------------------------------------------------------------------
// Separadores por URL (?tab=), mesmo padrão da ficha do paciente:
//   agenda    (DEFAULT) → marcações do médico nos próximos 7 dias, NAS DUAS
//               clínicas, com KPIs e deep-links para /admin/agenda?medico=
//               — redesenho pós-demo 09/09/2026: a direção abre a ficha de
//               um médico para ver A AGENDA DELE, não o formulário. Mesma
//               fonte (Appointment) e mesma linguagem visual da agenda da
//               clínica → sincronia por construção, nada a duplicar.
//   dados     → DoctorForm em modo edição (inclui editor de horários)
//   excecoes  → férias e dias especiais (DoctorExceptions)
//   comissoes → overrides por ato (CommissionEditor)
// =============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { Badge } from '@/components/ui/Badge';
import {
  DoctorForm,
  type DoctorFormInitial,
} from '@/components/medicos/DoctorForm';
import {
  DoctorExceptions,
  type ExceptionRow,
} from '@/components/medicos/DoctorExceptions';
import { CommissionEditor } from '@/components/medicos/CommissionEditor';
import DoctorStatusToggle from '@/components/medicos/DoctorStatusToggle';
import DoctorInvitePanel from '@/components/medicos/DoctorInvitePanel';
import { DateJump } from '@/components/agenda/DateJump';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'agenda', label: 'Agenda e marcações' },
  { key: 'dados', label: 'Dados e horários' },
  { key: 'excecoes', label: 'Férias e exceções' },
  { key: 'comissoes', label: 'Comissões' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

// Mesma linguagem visual da agenda da clínica (STATUS_META de admin/agenda)
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

const CLINIC_BADGE: Record<string, { bg: string; fg: string }> = {
  colombo: { bg: '#E4EBFF', fg: '#1B2A6B' },
  buraca: { bg: '#EFE6FA', fg: '#5B2E91' },
};

/** Instante UTC → data/minuto na parede de Lisboa */
function utcToLisbon(d: Date): { date: string; min: number } {
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

function ptDateLabel(dateStr: string): string {
  const raw = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Lisbon',
  }).format(lisbonToUtc(dateStr, 12 * 60));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default async function DoctorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; data?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab, data } = await searchParams;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) notFound();
  const tab: TabKey = (
    TABS.some(t => t.key === rawTab) ? rawTab : 'agenda'
  ) as TabKey;

  await dbConnect();
  const [doctor, clinicsDocs, account] = await Promise.all([
    Doctor.findById(id).lean(),
    getActiveClinics(),
    User.findOne({ doctorId: id, role: 'doctor' })
      .select('status email')
      .lean(),
  ]);
  if (!doctor) notFound();

  const clinics = clinicsDocs.map(c => ({
    id: String(c._id),
    name: c.name,
    slug: c.slug,
  }));
  const clinicById = new Map(clinics.map(c => [c.id, c]));

  const initial: DoctorFormInitial = {
    name: doctor.name,
    licenseNumber: doctor.licenseNumber ?? '',
    specialties: doctor.specialties,
    commissionPercent:
      doctor.commissionRate != null
        ? String(Math.round(doctor.commissionRate * 100))
        : '',
    color: doctor.color ?? '#2743A6',
    clinicSchedules: doctor.clinicSchedules.map(cs => ({
      clinicId: String(cs.clinicId),
      bookableOnline: cs.bookableOnline,
      weeklySchedule: cs.weeklySchedule.map(w => ({
        weekday: w.weekday,
        ranges: w.ranges.map(r => ({ start: r.start, end: r.end })),
      })),
    })),
  };

  // ---------------------------------------------------------------------------
  // Separador AGENDA — 7 dias a partir de ?data= (default hoje), duas clínicas
  // ---------------------------------------------------------------------------
  const today = todayLisbon();
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(data ?? '')
    ? (data as string)
    : today;
  const rangeDays = 7;
  const rangeFrom = lisbonToUtc(fromDate, 0);
  const rangeTo = lisbonToUtc(shiftDate(fromDate, rangeDays - 1), 24 * 60);
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let agendaContent: React.ReactNode = null;
  if (tab === 'agenda') {
    const [appts, pending24h] = await Promise.all([
      Appointment.find({
        doctorId: id,
        startAt: { $lt: rangeTo },
        endAt: { $gt: rangeFrom },
      })
        .select(
          'clinicId patientId treatmentTypeId startAt endAt status confirmedVia',
        )
        .sort({ startAt: 1 })
        .lean(),
      Appointment.countDocuments({
        doctorId: id,
        status: 'pending',
        startAt: { $gt: now, $lte: in24h },
      }),
    ]);

    const [patients, treatments] = await Promise.all([
      Patient.find({ _id: { $in: appts.map(a => a.patientId) } })
        .select('name processNumber phone')
        .lean(),
      TreatmentType.find({
        _id: { $in: appts.map(a => a.treatmentTypeId) },
      })
        .select('name')
        .lean(),
    ]);
    const patientById = new Map(patients.map(p => [String(p._id), p]));
    const treatmentById = new Map(treatments.map(t => [String(t._id), t.name]));

    const byDay = new Map<string, typeof appts>();
    let todayCount = 0;
    for (const a of appts) {
      const day = utcToLisbon(a.startAt).date;
      if (day === today) todayCount++;
      const arr = byDay.get(day) ?? [];
      arr.push(a);
      byDay.set(day, arr);
    }

    // Deep-links para a agenda da clínica FILTRADA por este médico — a
    // fonte é a mesma coleção; o que se vê aqui é o que se vê lá
    const scheduleClinicIds = new Set(
      doctor.clinicSchedules.map(cs => String(cs.clinicId)),
    );

    agendaContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Controlo do período + deep-links */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Link
              href={`/admin/medicos/${id}?data=${shiftDate(fromDate, -7)}`}
              aria-label='7 dias anteriores'
              style={navBtnStyle}
            >
              <ChevronLeft size={16} />
            </Link>
            <Link href={`/admin/medicos/${id}`} style={todayBtnStyle}>
              Hoje
            </Link>
            <Link
              href={`/admin/medicos/${id}?data=${shiftDate(fromDate, 7)}`}
              aria-label='7 dias seguintes'
              style={navBtnStyle}
            >
              <ChevronRight size={16} />
            </Link>
            <DateJump
              date={fromDate}
              makeHref={`/admin/medicos/${id}?data=__DATE__`}
            />
            <span style={{ fontSize: '13px', color: '#6A7186' }}>
              {ptDateLabel(fromDate)} →{' '}
              {ptDateLabel(shiftDate(fromDate, rangeDays - 1))}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {clinics
              .filter(c => scheduleClinicIds.has(c.id))
              .map(c => (
                <Link
                  key={c.id}
                  href={`/admin/agenda?clinic=${c.slug}&date=${fromDate}&medico=${id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    color: '#FFFFFF',
                    backgroundColor: '#2743A6',
                  }}
                >
                  <CalendarDays size={15} />
                  Abrir na agenda · {c.name}
                </Link>
              ))}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {(
            [
              ['Hoje', todayCount, '#1B2A6B'],
              [`Próximos ${rangeDays} dias`, appts.length, '#2743A6'],
              ['Por confirmar (24h)', pending24h, '#9A6700'],
            ] as const
          ).map(([label, value, color]) => (
            <div
              key={label}
              style={{
                flex: '1 1 140px',
                border: '1px solid #EEF1F8',
                borderRadius: '12px',
                padding: '12px 16px',
                backgroundColor: '#FFFFFF',
              }}
            >
              <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                {label}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '22px',
                  fontWeight: 700,
                  color,
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Lista por dia — mesma linguagem visual da vista Lista da agenda */}
        {appts.length === 0 ? (
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
            Sem marcações deste médico neste período.
          </p>
        ) : (
          [...byDay.entries()].map(([day, dayAppts]) => (
            <div key={day}>
              <h2
                style={{
                  margin: '0 0 8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: day === today ? '#2743A6' : '#1B2A6B',
                }}
              >
                {ptDateLabel(day)}
                {day === today ? ' · Hoje' : ''}
                <span
                  style={{ marginLeft: 8, fontWeight: 600, color: '#6A7186' }}
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
                  const s = utcToLisbon(a.startAt);
                  const e = utcToLisbon(a.endAt);
                  const meta = STATUS_META[a.status as AppointmentStatus];
                  const clinic = clinicById.get(String(a.clinicId));
                  const cb = CLINIC_BADGE[clinic?.slug ?? ''] ?? {
                    bg: '#EEF0F4',
                    fg: '#3A3F4A',
                  };
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
                        {hhmm(s.min)}–{hhmm(e.date === s.date ? e.min : 1440)}
                      </span>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: cb.bg,
                          color: cb.fg,
                        }}
                      >
                        {clinic?.name ?? '—'}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: '#1B2A6B',
                          minWidth: 160,
                        }}
                      >
                        {p ? p.name : '(paciente removido)'}
                        {p?.processNumber != null && (
                          <span style={{ color: '#6A7186', fontWeight: 500 }}>
                            {' '}
                            · {String(p.processNumber)}
                          </span>
                        )}
                      </span>
                      <span
                        style={{ color: '#3A3F4A', flex: 1, minWidth: 140 }}
                      >
                        {treatmentById.get(String(a.treatmentTypeId)) ?? '—'}
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
          ))
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link
        href='/admin/medicos'
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#6A7186',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={15} />
        Corpo Clínico
      </Link>

      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: '999px',
            backgroundColor: doctor.color ?? '#2743A6',
          }}
        />
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {doctor.name}
        </h1>
        {doctor.active ? (
          <Badge variant='success'>Ativo</Badge>
        ) : (
          <Badge variant='neutral'>Inativo</Badge>
        )}
        {account?.status === 'active' ? (
          <Badge variant='success'>Conta ativa</Badge>
        ) : account?.status === 'invited' ? (
          <Badge variant='warning'>Convite pendente</Badge>
        ) : account?.status === 'disabled' ? (
          <Badge variant='neutral'>Conta desativada</Badge>
        ) : (
          <Badge variant='neutral'>Sem conta</Badge>
        )}
        {account?.email && (
          <span style={{ fontSize: '13px', color: '#6A7186' }}>
            {account.email}
          </span>
        )}
      </div>

      {/* Convite de acesso: só quando não há conta ativa/desligada — contas
          'disabled' religam-se ao reativar o profissional, não por convite */}
      {doctor.active && (!account || account.status === 'invited') && (
        <DoctorInvitePanel
          doctorId={id}
          hasPendingInvite={account?.status === 'invited'}
          currentEmail={account?.email ?? null}
        />
      )}

      {/* Separadores */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid #EEF1F8',
        }}
      >
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={
                t.key === 'agenda'
                  ? `/admin/medicos/${id}`
                  : `/admin/medicos/${id}?tab=${t.key}`
              }
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                color: active ? '#2743A6' : '#6A7186',
                borderBottom: active
                  ? '2px solid #2743A6'
                  : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Conteúdo */}
      {tab === 'dados' && !doctor.licenseNumber && (
        <div
          style={{
            backgroundColor: '#FFF9EC',
            border: '1px solid #F0DCB0',
            borderRadius: '12px',
            padding: '12px 20px',
            fontSize: '13px',
            color: '#8A5A00',
            maxWidth: 860,
          }}
        >
          Este profissional não tem cédula profissional registada. Será
          necessária para emitir receitas e consentimentos — preencha o campo
          abaixo.
        </div>
      )}

      {tab === 'agenda' ? (
        agendaContent
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: tab === 'dados' ? 860 : undefined,
          }}
        >
          {tab === 'dados' && (
            <>
              <DoctorForm
                mode='edit'
                doctorId={id}
                initial={initial}
                clinics={clinics.map(c => ({ id: c.id, name: c.name }))}
              />
              <DoctorStatusToggle
                doctorId={id}
                doctorName={doctor.name}
                active={doctor.active}
              />
            </>
          )}

          {tab === 'excecoes' && (
            <DoctorExceptions
              doctorId={id}
              clinics={clinics.map(c => ({ id: c.id, name: c.name }))}
              exceptions={doctor.exceptions.map(
                (e): ExceptionRow => ({
                  date: e.date,
                  clinicId: e.clinicId ? String(e.clinicId) : null,
                  type: e.type as 'unavailable' | 'custom',
                  ranges: e.ranges.map(r => ({ start: r.start, end: r.end })),
                  reason: e.reason ?? null,
                }),
              )}
            />
          )}

          {tab === 'comissoes' && (
            <CommissionEditor
              doctorId={id}
              basePercentLabel={
                doctor.commissionRate != null
                  ? `a taxa base do profissional (${Math.round(doctor.commissionRate * 100)}%)`
                  : 'o default da clínica do ato (40%)'
              }
              treatments={(
                await TreatmentType.find({ active: { $ne: false } })
                  .sort({ name: 1 })
                  .select('name')
                  .lean()
              ).map(t => ({ id: String(t._id), name: t.name }))}
              initialOverrides={doctor.commissionOverrides.map(o => ({
                treatmentTypeId: String(o.treatmentTypeId),
                ratePercent: Math.round(o.rate * 100),
              }))}
            />
          )}
        </div>
      )}
    </div>
  );
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
