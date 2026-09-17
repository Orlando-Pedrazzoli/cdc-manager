// 📄 src/components/pacientes/PatientAppointments.tsx
// =============================================================================
// CDC Manager — Ficha do Paciente: separador Consultas
// -----------------------------------------------------------------------------
// Server Component que carrega os seus próprios dados (padrão PatientLabCases):
// todas as marcações do paciente, divididas em PRÓXIMAS (a partir de agora,
// ascendente) e HISTÓRICO (passadas, descendente, limitado). Cada linha liga
// à agenda da clínica nesse dia — é lá que se age (confirmar, remarcar).
// Linhas em duas alturas (.cdc-line) — legíveis em desktop e telemóvel.
//
// Resumo no topo: total concluídas · faltas · cancelamentos — a taxa de
// faltas de um paciente é o que a receção quer saber antes de remarcar.
// =============================================================================

import Link from 'next/link';
import mongoose from 'mongoose';
import { CalendarPlus } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { APPOINTMENT_STATUS_META } from '@/lib/appointment-status';

const HISTORY_LIMIT = 40;

export async function PatientAppointments({
  patientId,
}: {
  patientId: string;
}) {
  await dbConnect();
  const now = new Date();
  const pid = new mongoose.Types.ObjectId(patientId);

  const [upcomingRaw, historyRaw, counts, clinics] = await Promise.all([
    Appointment.find({ patientId: pid, startAt: { $gte: now } })
      .select(
        'startAt endAt status clinicId doctorId treatmentTypeId isUrgent cancelReason',
      )
      .sort({ startAt: 1 })
      .lean(),
    Appointment.find({ patientId: pid, startAt: { $lt: now } })
      .select(
        'startAt endAt status clinicId doctorId treatmentTypeId isUrgent cancelReason',
      )
      .sort({ startAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean(),
    Appointment.aggregate<{ _id: string; n: number }>([
      { $match: { patientId: pid } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    getActiveClinics(),
  ]);

  const all = [...upcomingRaw, ...historyRaw];
  const doctorIds = [
    ...new Set(all.filter(a => a.doctorId).map(a => String(a.doctorId))),
  ];
  const treatmentIds = [
    ...new Set(
      all.filter(a => a.treatmentTypeId).map(a => String(a.treatmentTypeId)),
    ),
  ];
  const [doctors, treatments] = await Promise.all([
    doctorIds.length
      ? Doctor.find({ _id: { $in: doctorIds } })
          .select('name')
          .lean()
      : [],
    treatmentIds.length
      ? TreatmentType.find({ _id: { $in: treatmentIds } })
          .select('name')
          .lean()
      : [],
  ]);
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));
  const treatmentName = new Map(treatments.map(t => [String(t._id), t.name]));
  const clinicById = new Map(
    clinics.map(c => [String(c._id), { name: c.name, slug: c.slug }]),
  );

  const byStatus = new Map(counts.map(c => [c._id, c.n]));
  const completed = byStatus.get('completed') ?? 0;
  const noShow = byStatus.get('no-show') ?? 0;
  const cancelled = byStatus.get('cancelled') ?? 0;
  const finished = completed + noShow + cancelled;
  const noShowPct = finished > 0 ? Math.round((noShow / finished) * 100) : 0;

  const dateFmt = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  });
  const timeFmt = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
  const isoDay = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);

  type Row = (typeof all)[number];
  const renderRow = (a: Row, i: number) => {
    const meta = APPOINTMENT_STATUS_META[a.status as AppointmentStatus];
    const clinic = clinicById.get(String(a.clinicId));
    const start = a.startAt as Date;
    const end = a.endAt as Date;
    const agendaHref = clinic
      ? `/admin/agenda?clinic=${clinic.slug}&date=${isoDay(start)}`
      : '/admin/agenda';
    const dimmed = a.status === 'cancelled' || a.status === 'no-show';
    return (
      <div
        key={String(a._id)}
        className='cdc-line'
        style={{
          padding: '10px 16px',
          borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
          fontSize: '13px',
          opacity: dimmed ? 0.8 : 1,
        }}
      >
        <div style={{ width: 118, flexShrink: 0 }}>
          <span
            style={{
              display: 'block',
              fontWeight: 700,
              color: '#1B2A6B',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {dateFmt.format(start)}
          </span>
          <span
            style={{
              display: 'block',
              color: '#6A7186',
              fontSize: '12px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {timeFmt.format(start)}–{timeFmt.format(end)}
          </span>
        </div>
        <div className='cdc-line-main'>
          <span
            style={{
              display: 'block',
              fontWeight: 600,
              color: '#1C2233',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {treatmentName.get(String(a.treatmentTypeId)) ?? '—'}
            {a.isUrgent && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#B3261E',
                }}
              >
                Urgência
              </span>
            )}
          </span>
          <span
            style={{
              display: 'block',
              color: '#6A7186',
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {a.doctorId
              ? (doctorName.get(String(a.doctorId)) ?? '—')
              : 'Sem médico'}
            {clinic ? ` · ${clinic.name}` : ''}
            {a.status === 'cancelled' && a.cancelReason
              ? ` · ${a.cancelReason}`
              : ''}
          </span>
        </div>
        <div className='cdc-line-meta'>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: meta?.bg ?? '#EEF0F4',
              color: meta?.fg ?? '#3A3F4A',
              whiteSpace: 'nowrap',
            }}
          >
            {meta?.label ?? a.status}
          </span>
          <Link
            href={agendaHref}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#2743A6',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Ver na agenda
          </Link>
        </div>
      </div>
    );
  };

  const block = (title: string, rows: Row[], empty: string) => (
    <section
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #EEF1F8',
          fontSize: '14px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        {title}
        <span style={{ marginLeft: 8, fontWeight: 600, color: '#6A7186' }}>
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '16px',
            fontSize: '13px',
            color: '#9AA1B4',
          }}
        >
          {empty}
        </p>
      ) : (
        rows.map(renderRow)
      )}
    </section>
  );

  const stat = (label: string, value: string, color?: string) => (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>{label}</p>
      <p
        style={{
          margin: '2px 0 0',
          fontSize: '18px',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: color ?? '#1B2A6B',
        }}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Resumo + ação: o que a receção quer saber antes de marcar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '12px',
          padding: '14px 16px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
            gap: '12px 20px',
            flex: 1,
            minWidth: 0,
          }}
        >
          {stat(
            'Concluídas',
            String(completed),
            completed > 0 ? '#0F7B4D' : undefined,
          )}
          {stat('Faltas', String(noShow), noShow > 0 ? '#B3261E' : undefined)}
          {stat('Canceladas', String(cancelled))}
          {stat(
            'Taxa de faltas',
            finished > 0 ? `${noShowPct}%` : '—',
            noShowPct >= 25 ? '#B3261E' : undefined,
          )}
        </div>
        <Link
          href='/admin/agenda'
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 14px',
            borderRadius: '10px',
            backgroundColor: '#2743A6',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <CalendarPlus size={15} />
          Nova marcação
        </Link>
      </div>

      {block(
        'Próximas consultas',
        upcomingRaw,
        'Sem consultas marcadas. Marca a próxima na agenda.',
      )}
      {block('Histórico', historyRaw, 'Ainda sem consultas passadas.')}
      {historyRaw.length === HISTORY_LIMIT && (
        <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
          A mostrar as {HISTORY_LIMIT} consultas mais recentes.
        </p>
      )}
    </div>
  );
}
