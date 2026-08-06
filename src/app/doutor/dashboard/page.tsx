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
// =============================================================================

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon, minToHhmm } from '@/lib/availability';

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

  // Marcações de HOJE do médico, nas duas clínicas, todos os estados —
  // canceladas/faltas aparecem esbatidas na lista (contexto do dia completo)
  const [appointments, clinics] = await Promise.all([
    Appointment.find({
      doctorId,
      startAt: { $gte: dayStartUtc, $lt: dayEndUtc },
    })
      .sort({ startAt: 1 })
      .lean(),
    getActiveClinics(),
  ]);

  const clinicById = new Map(
    clinics.map(c => [String(c._id), { slug: c.slug, name: c.name }]),
  );

  const patientIds = [...new Set(appointments.map(a => String(a.patientId)))];
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
