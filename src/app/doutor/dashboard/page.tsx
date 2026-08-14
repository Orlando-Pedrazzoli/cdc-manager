// 📄 src/app/doutor/dashboard/page.tsx
// =============================================================================
// CDC Manager — Médico: O meu dia (dashboard)
// -----------------------------------------------------------------------------
// Server Component. TUDO aqui é filtrado pelo doctorId da SESSÃO — o médico
// vê apenas os seus próprios dados (RBAC de dados, além do RBAC de rota do
// proxy). Como os médicos trabalham NAS DUAS clínicas, a query cobre ambas
// e cada marcação indica onde é (badge Colombo/Buraca).
//
// Três blocos:
//   1. Destaque — consulta EM CURSO (in-progress) ou PRÓXIMO paciente
//      (checked-in primeiro: já está na sala de espera; senão o próximo
//      por hora)
//   2. KPIs do dia — total, concluídas, por atender, faltas/canceladas
//   3. Lista cronológica completa do dia
//
// Os cartões (destaque e lista) linkam para /doutor/consulta/[id] — o
// fluxo da consulta (iniciar → registar → concluir).
//
// Acrescentos desta iteração:
//   4. "O meu mês" — produção própria (sparkline 30 dias + comparação
//      honesta dia 1–N vs mês anterior) e comissão materializada dos
//      snapshots. APENAS do próprio médico — comissões de colegas nunca
//      saem daqui. Self-service que o Dentoral nunca deu.
//   5. "Consultas por fechar" — in-progress/checked-in de dias ANTERIORES
//      esquecidas abertas. Importante: a baixa de stock por BOM e a fila
//      de cobrança disparam no CONCLUIR — consulta esquecida = stock e
//      cobrança errados. Alerta âmbar acionável.
//   6. <AutoRefresh/> — a página vive aberta entre consultas.
// =============================================================================

import Link from 'next/link';
import mongoose from 'mongoose';
import AutoRefresh from '@/components/ui/AutoRefresh';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import {
  lisbonToUtc,
  todayLisbon,
  minToHhmm,
  dateRange,
} from '@/lib/availability';
import { formatCents } from '@/lib/commissions';

export const dynamic = 'force-dynamic';

// --- Labels e cores por estado (inline SEMPRE — convenção do projeto) --------
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  'checked-in': 'Em espera',
  'in-progress': 'Em curso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  'no-show': 'Falta',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#FFF4DE', fg: '#8A5A00' },
  confirmed: { bg: '#E4EBFF', fg: '#2743A6' },
  'checked-in': { bg: '#E0F5EA', fg: '#0F7B4D' },
  'in-progress': { bg: '#1B2A6B', fg: '#FFFFFF' },
  completed: { bg: '#EAECF3', fg: '#3D4257' },
  cancelled: { bg: '#F6E4E3', fg: '#B3261E' },
  'no-show': { bg: '#F6E4E3', fg: '#B3261E' },
};

const CLINIC_STYLE: Record<string, { bg: string; fg: string }> = {
  colombo: { bg: '#E4EBFF', fg: '#1B2A6B' },
  buraca: { bg: '#EFE6FA', fg: '#5B2E91' },
};

/** Instante UTC → minutos do dia na parede de Lisboa (mesmo helper da agenda) */
function utcToLisbonMin(d: Date): number {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

type DayAppointment = {
  id: string;
  startMin: number;
  endMin: number;
  status: AppointmentStatus;
  patientLabel: string;
  processNumber: string;
  treatmentName: string;
  clinicSlug: string;
  clinicName: string;
  notes: string | null;
};

function Badge({
  bg,
  fg,
  children,
}: {
  bg: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: '999px',
        padding: '2px 10px',
        fontSize: '12px',
        fontWeight: 700,
        backgroundColor: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default async function DoctorDashboardPage() {
  const session = await auth();
  const doctorId = session?.user?.doctorId;

  // Conta doctor sem doctorId associado = configuração errada (o seed/admin
  // cria sempre a ligação User.doctorId). Falhar com mensagem clara.
  if (!doctorId) {
    return (
      <div
        style={{
          backgroundColor: '#F6E4E3',
          border: '1px solid #E5B9B5',
          borderRadius: '12px',
          padding: '20px 24px',
          color: '#B3261E',
          fontSize: '14px',
        }}
      >
        A sua conta não está associada a nenhuma ficha de médico. Contacte a
        administração da clínica.
      </div>
    );
  }

  await dbConnect();

  const today = todayLisbon();
  const dayStartUtc = lisbonToUtc(today, 0);
  const dayEndUtc = lisbonToUtc(today, 24 * 60);

  // --- Janelas do "O meu mês" (mesma comparação honesta 1–N da admin) -------
  const [y, m, d] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = lisbonToUtc(`${y}-${pad(m)}-01`, 0);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevMonthDays = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const prevD = Math.min(d, prevMonthDays); // clamp fim de mês (31→28/29/30)
  const prevStart = lisbonToUtc(`${prevY}-${pad(prevM)}-01`, 0);
  const prevEnd = lisbonToUtc(`${prevY}-${pad(prevM)}-${pad(prevD)}`, 24 * 60);
  const spark30StartStr = new Date(Date.UTC(y, m - 1, d - 29))
    .toISOString()
    .slice(0, 10);
  const spark30Start = lisbonToUtc(spark30StartStr, 0);

  // Marcações de HOJE do médico, nas duas clínicas, todos os estados —
  // canceladas/faltas aparecem esbatidas na lista (contexto do dia completo)
  const [appointments, clinics, monthAgg, prevAgg, sparkAgg, staleRaw] =
    await Promise.all([
      Appointment.find({
        doctorId,
        startAt: { $gte: dayStartUtc, $lt: dayEndUtc },
      })
        .sort({ startAt: 1 })
        .lean(),
      getActiveClinics(),
      // Produção e comissão do PRÓPRIO médico: mês corrente até hoje.
      // Snapshots imutáveis (priceCents/commissionCents congelados na
      // execução) — somar sem recalcular, como nos relatórios.
      Procedure.aggregate<{
        _id: null;
        cents: number;
        comm: number;
        n: number;
      }>([
        {
          $match: {
            doctorId: new mongoose.Types.ObjectId(doctorId),
            status: { $in: ['completed', 'invoiced'] },
            executedAt: { $gte: monthStart, $lt: dayEndUtc },
          },
        },
        {
          $group: {
            _id: null,
            cents: { $sum: '$priceCents' },
            comm: { $sum: '$commissionCents' },
            n: { $sum: 1 },
          },
        },
      ]),
      // Mesmo intervalo de dias (1–N) do mês anterior
      Procedure.aggregate<{ _id: null; cents: number }>([
        {
          $match: {
            doctorId: new mongoose.Types.ObjectId(doctorId),
            status: { $in: ['completed', 'invoiced'] },
            executedAt: { $gte: prevStart, $lt: prevEnd },
          },
        },
        { $group: { _id: null, cents: { $sum: '$priceCents' } } },
      ]),
      // Produção diária dos últimos 30 dias (sparkline, dia civil Lisboa)
      Procedure.aggregate<{ _id: string; cents: number }>([
        {
          $match: {
            doctorId: new mongoose.Types.ObjectId(doctorId),
            status: { $in: ['completed', 'invoiced'] },
            executedAt: { $gte: spark30Start, $lt: dayEndUtc },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$executedAt',
                timezone: 'Europe/Lisbon',
              },
            },
            cents: { $sum: '$priceCents' },
          },
        },
      ]),
      // Consultas de dias ANTERIORES esquecidas abertas — stock e cobrança
      // só disparam no concluir; isto é dívida operacional a fechar
      Appointment.find({
        doctorId,
        startAt: { $lt: dayStartUtc },
        status: { $in: ['in-progress', 'checked-in'] },
      })
        .sort({ startAt: -1 })
        .limit(6)
        .lean(),
    ]);

  const clinicById = new Map(
    clinics.map(c => [String(c._id), { slug: c.slug, name: c.name }]),
  );

  const patientIds = [
    ...new Set([...appointments, ...staleRaw].map(a => String(a.patientId))),
  ];
  const treatmentIds = [
    ...new Set(appointments.map(a => String(a.treatmentTypeId))),
  ];

  const [patients, treatments] = await Promise.all([
    Patient.find({ _id: { $in: patientIds } })
      .select('name processNumber')
      .lean(),
    TreatmentType.find({ _id: { $in: treatmentIds } })
      .select('name')
      .lean(),
  ]);

  const patientById = new Map(
    patients.map(p => [
      String(p._id),
      { name: p.name, processNumber: String(p.processNumber ?? '') },
    ]),
  );
  const treatmentById = new Map(treatments.map(t => [String(t._id), t.name]));

  const day: DayAppointment[] = appointments.map(a => {
    const p = patientById.get(String(a.patientId));
    const clinic = clinicById.get(String(a.clinicId));
    return {
      id: String(a._id),
      startMin: utcToLisbonMin(a.startAt),
      endMin: utcToLisbonMin(a.endAt),
      status: a.status as AppointmentStatus,
      patientLabel: p?.name ?? '(paciente removido)',
      processNumber: p?.processNumber ?? '',
      treatmentName: treatmentById.get(String(a.treatmentTypeId)) ?? '—',
      clinicSlug: clinic?.slug ?? '',
      clinicName: clinic?.name ?? '—',
      notes: (a.note as string | null) ?? null,
    };
  });

  // --- Derivados para o destaque e KPIs --------------------------------------
  const nowMin = utcToLisbonMin(new Date());

  const inProgress = day.find(a => a.status === 'in-progress') ?? null;
  // Próximo: quem JÁ FEZ check-in tem prioridade (está à espera na receção);
  // senão, a próxima marcação ativa por hora
  const nextUp =
    day.find(a => a.status === 'checked-in') ??
    day.find(
      a =>
        (a.status === 'pending' || a.status === 'confirmed') &&
        a.endMin > nowMin,
    ) ??
    null;

  const active = day.filter(a => !['cancelled', 'no-show'].includes(a.status));
  const completedCount = day.filter(a => a.status === 'completed').length;
  const missedCount = day.filter(a =>
    ['cancelled', 'no-show'].includes(a.status),
  ).length;
  const remainingCount = active.length - completedCount - (inProgress ? 1 : 0);

  const rawDate = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date());
  // Capitalizar SÓ a primeira letra — textTransform:'capitalize' capitalizava
  // palavra a palavra ("Segunda-Feira, 3 De Agosto"), errado em português
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  const highlight = inProgress ?? nextUp;

  // --- O meu mês -------------------------------------------------------------
  const monthCents = monthAgg[0]?.cents ?? 0;
  const monthComm = monthAgg[0]?.comm ?? 0;
  const monthN = monthAgg[0]?.n ?? 0;
  const prevCents = prevAgg[0]?.cents ?? 0;
  const deltaUp = monthCents >= prevCents;
  const sparkByDay = new Map(sparkAgg.map(r => [r._id, r.cents] as const));
  const spark = dateRange(spark30StartStr, today).map(
    ds => sparkByDay.get(ds) ?? 0,
  );
  const sparkMax = Math.max(...spark);

  // --- Consultas por fechar (dias anteriores) --------------------------------
  const staleDateFmt = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
  const stale = staleRaw.map(a => {
    const p = patientById.get(String(a.patientId));
    const clinic = clinicById.get(String(a.clinicId));
    return {
      id: String(a._id),
      dateLabel: staleDateFmt.format(a.startAt as Date),
      time: minToHhmm(utcToLisbonMin(a.startAt as Date)),
      patientLabel: p?.name ?? '(paciente removido)',
      clinicSlug: clinic?.slug ?? '',
      status: a.status as AppointmentStatus,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* A página vive aberta entre consultas — dados frescos sem F5 */}
      <AutoRefresh intervalMs={90_000} />
      {/* Cabeçalho */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          O meu dia
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '14px',
            color: '#6A7186',
          }}
        >
          {dateLabel}
        </p>
      </div>

      {/* Consultas de dias anteriores esquecidas abertas — fechar liberta a
          baixa de stock e a fila de cobrança. Só aparece quando existem. */}
      {stale.length > 0 && (
        <div
          style={{
            backgroundColor: '#FFF9EC',
            border: '1px solid #F0DCB0',
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid #F0DCB0',
              fontSize: '14px',
              fontWeight: 700,
              color: '#8A5A00',
            }}
          >
            Consultas por fechar
            <span
              style={{
                marginLeft: '8px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#8A5A00',
              }}
            >
              — de dias anteriores; concluir regulariza o registo clínico, o
              stock e a cobrança
            </span>
          </div>
          {stale.map((s, i) => {
            const cl = CLINIC_STYLE[s.clinicSlug] ?? {
              bg: '#EAECF3',
              fg: '#3D4257',
            };
            return (
              <Link
                key={s.id}
                href={`/doutor/consulta/${s.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '10px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid #F5EBD2',
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#8A5A00',
                    minWidth: '92px',
                  }}
                >
                  {s.dateLabel} · {s.time}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1B2A6B',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.patientLabel}
                </span>
                <Badge bg={cl.bg} fg={cl.fg}>
                  {s.clinicSlug
                    ? s.clinicSlug.charAt(0).toUpperCase() +
                      s.clinicSlug.slice(1)
                    : '—'}
                </Badge>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#8A5A00',
                    flexShrink: 0,
                  }}
                >
                  Retomar →
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Destaque: consulta em curso / próximo paciente */}
      {highlight && (
        <Link
          href={`/doutor/consulta/${highlight.id}`}
          style={{
            backgroundColor: inProgress ? '#1B2A6B' : '#FFFFFF',
            border: inProgress ? 'none' : '1px solid #D8DEEF',
            borderRadius: '14px',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: inProgress ? '#8FA0DC' : '#6A7186',
              }}
            >
              {inProgress
                ? 'Consulta em curso'
                : highlight.status === 'checked-in'
                  ? 'Paciente em espera'
                  : 'Próximo paciente'}
            </p>
            <p
              style={{
                margin: '6px 0 2px',
                fontSize: '19px',
                fontWeight: 700,
                color: inProgress ? '#FFFFFF' : '#1B2A6B',
              }}
            >
              {highlight.patientLabel}
              {highlight.processNumber && (
                <span
                  style={{
                    marginLeft: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: inProgress ? '#8FA0DC' : '#6A7186',
                  }}
                >
                  Proc. {highlight.processNumber}
                </span>
              )}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                color: inProgress ? '#C9D4FF' : '#3D4257',
              }}
            >
              {minToHhmm(highlight.startMin)}–{minToHhmm(highlight.endMin)} ·{' '}
              {highlight.treatmentName} · {highlight.clinicName}
            </p>
          </div>
          <Badge
            bg={STATUS_STYLE[highlight.status]?.bg ?? '#EAECF3'}
            fg={STATUS_STYLE[highlight.status]?.fg ?? '#3D4257'}
          >
            {STATUS_LABEL[highlight.status] ?? highlight.status}
          </Badge>
        </Link>
      )}

      {/* KPIs do dia */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
        }}
      >
        {[
          { label: 'Consultas hoje', value: active.length },
          { label: 'Concluídas', value: completedCount },
          { label: 'Por atender', value: Math.max(remainingCount, 0) },
          { label: 'Faltas / canceladas', value: missedCount },
        ].map(kpi => (
          <div
            key={kpi.label}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEF1F8',
              borderRadius: '12px',
              padding: '14px 18px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '26px',
                fontWeight: 700,
                color: '#1B2A6B',
                lineHeight: 1.1,
              }}
            >
              {kpi.value}
            </p>
            <p
              style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}
            >
              {kpi.label}
            </p>
          </div>
        ))}
      </div>

      {/* O meu mês — produção e comissão do PRÓPRIO médico (snapshots) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '12px',
            padding: '14px 18px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 700,
              color: '#1B2A6B',
              lineHeight: 1.1,
            }}
          >
            {formatCents(monthCents)}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
            A minha produção este mês · {monthN} {monthN === 1 ? 'ato' : 'atos'}
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: deltaUp ? '#0F7B4D' : '#B3261E',
              fontWeight: 600,
            }}
          >
            {deltaUp ? '▲' : '▼'} vs {formatCents(prevCents)} no mesmo período
            do mês passado
          </p>
          {sparkMax > 0 && (
            <svg
              viewBox={`0 0 ${spark.length * 5} 30`}
              preserveAspectRatio='none'
              style={{
                display: 'block',
                width: '100%',
                height: '30px',
                marginTop: '8px',
              }}
              aria-hidden='true'
            >
              {spark.map((v, i) => {
                const h =
                  v > 0 ? Math.max(2, Math.round((v / sparkMax) * 28)) : 1;
                const isToday = i === spark.length - 1;
                return (
                  <rect
                    key={i}
                    x={i * 5}
                    y={30 - h}
                    width={4}
                    height={h}
                    rx={1}
                    fill={v === 0 ? '#E8EBF4' : isToday ? '#0F7B4D' : '#2743A6'}
                  />
                );
              })}
            </svg>
          )}
        </div>
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '12px',
            padding: '14px 18px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 700,
              color: '#0F7B4D',
              lineHeight: 1.1,
            }}
          >
            {formatCents(monthComm)}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
            A minha comissão este mês
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9AA1B4' }}>
            Valores congelados no registo de cada ato — alterações de tabela não
            afetam o já executado
          </p>
        </div>
      </div>

      {/* Lista cronológica do dia */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #EEF1F8',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Agenda de hoje
        </div>

        {day.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '28px 20px',
              fontSize: '14px',
              color: '#6A7186',
            }}
          >
            Sem consultas marcadas para hoje. Bom descanso! 🌿
          </p>
        ) : (
          <div>
            {day.map(a => {
              const muted = ['cancelled', 'no-show'].includes(a.status);
              const st = STATUS_STYLE[a.status] ?? {
                bg: '#EAECF3',
                fg: '#3D4257',
              };
              const cl = CLINIC_STYLE[a.clinicSlug] ?? {
                bg: '#EAECF3',
                fg: '#3D4257',
              };
              const rowStyle: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 20px',
                borderBottom: '1px solid #F4F6FB',
                opacity: muted ? 0.55 : 1,
                textDecoration: 'none',
              };
              const rowContent = (
                <>
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#1B2A6B',
                      minWidth: '92px',
                    }}
                  >
                    {minToHhmm(a.startMin)}–{minToHhmm(a.endMin)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#1B2A6B',
                        textDecoration: muted ? 'line-through' : 'none',
                      }}
                    >
                      {a.patientLabel}
                      {a.processNumber && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#6A7186',
                          }}
                        >
                          Proc. {a.processNumber}
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '13px',
                        color: '#6A7186',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.treatmentName}
                      {a.notes ? ` · ${a.notes}` : ''}
                    </p>
                  </div>
                  <Badge bg={cl.bg} fg={cl.fg}>
                    {a.clinicSlug
                      ? a.clinicSlug.charAt(0).toUpperCase() +
                        a.clinicSlug.slice(1)
                      : a.clinicName}
                  </Badge>
                  <Badge bg={st.bg} fg={st.fg}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                </>
              );
              return muted ? (
                <div key={a.id} style={rowStyle}>
                  {rowContent}
                </div>
              ) : (
                <Link
                  key={a.id}
                  href={`/doutor/consulta/${a.id}`}
                  style={rowStyle}
                >
                  {rowContent}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
