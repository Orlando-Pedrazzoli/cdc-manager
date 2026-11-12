// 📄 src/app/admin/recalls/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Recalls
// -----------------------------------------------------------------------------
// Fila de reativação POR CLÍNICA (?clinic=, padrão da agenda/cobrança):
//   1. PROMOÇÃO LAZY no load: scheduled cuja dueAt chegou → due (substitui
//      o cron até o WhatsApp automático do Sprint 6; updateMany barato).
//   2. Secções: Por contactar (due, mais atrasados primeiro) · Em
//      acompanhamento (contacted) · Agendados (próximos 90 dias) ·
//      Fechados recentes (reabríveis).
// A conversão real faz-se na agenda; aqui regista-se o resultado do
// contacto. Telefone visível — o convite na v1 é humano (WhatsApp manual).
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Link from 'next/link';
import Recall, { type RecallDoc } from '@/models/Recall';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { defaultClinic } from '@/lib/branding';
import { RECALL_STATUS_LABEL } from '@/lib/labels';
import { RecallActions } from '@/components/recalls/RecallActions';
import { RecallContactLog } from '@/components/recalls/RecallContactLog';
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton';
import { RECALL_OUTCOME_LABEL } from '@/lib/validations/recalls';
import { processLabel } from '@/lib/domain';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recalls' };

const DAY_MS = 24 * 60 * 60 * 1000;

function lisbonDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  scheduled: 'neutral',
  due: 'warning',
  contacted: 'info',
  booked: 'success',
  dismissed: 'neutral',
  unreachable: 'danger',
};

interface Row {
  id: string;
  status: RecallDoc['status'];
  dueAt: Date;
  contactAttempts: number;
  lastContactedAt: Date | null;
  lastOutcome: RecallDoc['lastOutcome'];
  lastNote: string | null;
  patientProcess: string;
  patientName: string;
  patientPhone: string | null;
  patientId: string;
  treatmentName: string;
  doctorName: string | null;
}

function RecallSection({
  title,
  subtitle,
  rows,
  emptyText,
  now,
}: {
  title: string;
  subtitle?: string;
  rows: Row[];
  emptyText: string;
  now: number;
}) {
  return (
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
          padding: '14px 16px',
          borderBottom: '1px solid #F4F6FB',
          display: 'flex',
          alignItems: 'baseline',
          gap: '10px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: '12px', color: '#9AA1B4' }}>{subtitle}</span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '13px',
            fontWeight: 600,
            color: '#6A7186',
          }}
        >
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '20px 16px',
            fontSize: '13px',
            color: '#9AA1B4',
          }}
        >
          {emptyText}
        </p>
      ) : (
        <div>
          {rows.map(r => {
            const overdueDays = Math.floor((now - r.dueAt.getTime()) / DAY_MS);
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 16px',
                  borderBottom: '1px solid #F4F6FB',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1C2233',
                    }}
                  >
                    <Link
                      href={`/admin/pacientes/${r.patientId}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {r.patientName}
                    </Link>
                    {r.patientPhone && (
                      <span
                        style={{
                          marginLeft: '10px',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#6A7186',
                        }}
                      >
                        {r.patientPhone}
                      </span>
                    )}
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '12px',
                      color: '#9AA1B4',
                    }}
                  >
                    {r.treatmentName}
                    {r.doctorName ? ` · ${r.doctorName}` : ''}
                    {r.contactAttempts > 0 &&
                      ` · ${r.contactAttempts} ${
                        r.contactAttempts === 1 ? 'tentativa' : 'tentativas'
                      }`}
                    {r.lastContactedAt &&
                      ` (última: ${lisbonDate(r.lastContactedAt)})`}
                    {r.lastOutcome && (
                      <strong style={{ color: '#454C63' }}>
                        {' '}
                        · {RECALL_OUTCOME_LABEL[r.lastOutcome]}
                        {r.lastNote ? ` — ${r.lastNote}` : ''}
                      </strong>
                    )}
                  </p>
                </div>

                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#454C63',
                    }}
                  >
                    {lisbonDate(r.dueAt)}
                  </p>
                  {r.status === 'due' && overdueDays > 0 && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        color: '#B3261E',
                        fontWeight: 600,
                      }}
                    >
                      {overdueDays} {overdueDays === 1 ? 'dia' : 'dias'} de
                      atraso
                    </p>
                  )}
                </div>

                <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>
                  {RECALL_STATUS_LABEL[r.status]}
                </Badge>

                <RecallActions recallId={r.id} status={r.status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default async function RecallsPage({
  searchParams,
}: {
  searchParams: Promise<{
    clinic?: string;
    vista?: string;
    de?: string;
    ate?: string;
    colab?: string;
  }>;
}) {
  const { clinic: clinicParam, vista, de, ate, colab } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  await dbConnect();

  // 1. Promoção lazy: a data chegou → entra na fila de contacto
  const nowDate = new Date();
  await Recall.updateMany(
    { status: 'scheduled', dueAt: { $lte: nowDate } },
    { status: 'due' },
  );

  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === clinicParam) ?? defaultClinic(clinics);
  if (!clinic) return null;

  // 2. Fila da clínica (índice {clinicId, status, dueAt})
  const in90d = new Date(nowDate.getTime() + 90 * DAY_MS);
  const [due, contacted, scheduled, closed] = await Promise.all([
    Recall.find({ clinicId: clinic._id, status: 'due' })
      .sort({ dueAt: 1 })
      .limit(200)
      .lean(),
    Recall.find({ clinicId: clinic._id, status: 'contacted' })
      .sort({ lastContactedAt: -1 })
      .limit(200)
      .lean(),
    Recall.find({
      clinicId: clinic._id,
      status: 'scheduled',
      dueAt: { $lte: in90d },
    })
      .sort({ dueAt: 1 })
      .limit(200)
      .lean(),
    Recall.find({
      clinicId: clinic._id,
      status: { $in: ['dismissed', 'unreachable', 'booked'] },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const all = [...due, ...contacted, ...scheduled, ...closed];

  // 3. Lookups em lote (padrão da Cobrança)
  const patientIds = [...new Set(all.map(r => String(r.patientId)))];
  const doctorIds = [
    ...new Set(all.filter(r => r.doctorId).map(r => String(r.doctorId))),
  ];
  const treatmentIds = [...new Set(all.map(r => String(r.treatmentTypeId)))];
  const [patients, doctors, treatments] = await Promise.all([
    patientIds.length
      ? Patient.find({ _id: { $in: patientIds } })
          .select('name phone processNumber')
          .lean()
      : [],
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
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const doctorById = new Map(doctors.map(d => [String(d._id), d]));
  const treatmentById = new Map(treatments.map(t => [String(t._id), t]));

  const toRow = (r: (typeof all)[number]): Row => {
    const p = patientById.get(String(r.patientId));
    return {
      id: String(r._id),
      status: r.status,
      dueAt: r.dueAt as Date,
      contactAttempts: r.contactAttempts ?? 0,
      lastContactedAt: (r.lastContactedAt as Date | null) ?? null,
      lastOutcome: r.lastOutcome ?? null,
      lastNote: r.contacts?.length
        ? (r.contacts[r.contacts.length - 1].note ?? null)
        : null,
      patientProcess: p ? processLabel(p.processNumber) : '—',
      patientName: p?.name ?? 'Paciente removido',
      patientPhone: p?.phone ?? null,
      patientId: String(r.patientId),
      treatmentName:
        treatmentById.get(String(r.treatmentTypeId))?.name ?? 'Ato',
      doctorName: r.doctorId
        ? (doctorById.get(String(r.doctorId))?.name ?? null)
        : null,
    };
  };

  const now = nowDate.getTime();

  // 6.ª ronda/09: registo de contactos / produtividade — só a gestão
  const isAdmin = session.user.role === 'admin';
  const showLog = isAdmin && vista === 'registo';

  // Exportação da fila para Excel (o que está no ecrã, todas as secções)
  const queueHeaders = [
    'Secção',
    'Paciente',
    'N.º processo',
    'Telemóvel',
    'Ato do recall',
    'Médico',
    'Data do recall',
    'Estado',
    'Tentativas',
    'Último contacto',
    'Último resultado',
    'Nota',
  ];
  const queueRows = (
    [
      ['Por contactar', due],
      ['Em acompanhamento', contacted],
      ['Agendados', scheduled],
      ['Fechados recentes', closed],
    ] as const
  ).flatMap(([section, list]) =>
    list.map(toRow).map(r => [
      section,
      r.patientName,
      r.patientProcess,
      r.patientPhone ?? '',
      r.treatmentName,
      r.doctorName ?? '',
      lisbonDate(r.dueAt),
      RECALL_STATUS_LABEL[r.status],
      String(r.contactAttempts),
      r.lastContactedAt ? lisbonDate(r.lastContactedAt) : '',
      r.lastOutcome ? RECALL_OUTCOME_LABEL[r.lastOutcome] : '',
      r.lastNote ?? '',
    ]),
  );
  const viewTab = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 700,
    textDecoration: 'none',
    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#454C63',
    border: active ? '1px solid #1B2A6B' : '1px solid #E4E8F2',
  });

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Recalls
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
            Ciclos de reativação gerados automaticamente na conclusão de atos
            com recall. Contacto por WhatsApp/telefone; registe aqui o
            resultado.
          </p>
        </div>

        {/* Seletor de clínica (?clinic=, padrão da agenda) */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {clinics.map(c => {
            const active = c.slug === clinic.slug;
            return (
              <Link
                key={c.slug}
                href={`/admin/recalls?clinic=${c.slug}${showLog ? '&vista=registo' : ''}`}
                style={{
                  padding: '7px 14px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  backgroundColor: active ? '#2743A6' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#454C63',
                  border: active ? '1px solid #2743A6' : '1px solid #E4E8F2',
                }}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Vistas: fila de contacto · registo de contactos (gestão) */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href={`/admin/recalls?clinic=${clinic.slug}`}
          style={viewTab(!showLog)}
        >
          Fila de contacto
        </Link>
        {isAdmin && (
          <Link
            href={`/admin/recalls?clinic=${clinic.slug}&vista=registo`}
            style={viewTab(showLog)}
          >
            Registo e produtividade
          </Link>
        )}
        {!showLog && (
          <div style={{ marginLeft: 'auto' }}>
            <ExportCsvButton
              label='Exportar para Excel'
              filename={`recalls-${clinic.slug}-${nowDate.toISOString().slice(0, 10)}.csv`}
              headers={queueHeaders}
              rows={queueRows}
            />
          </div>
        )}
      </div>

      {showLog ? (
        <RecallContactLog
          clinicId={String(clinic._id)}
          clinicSlug={clinic.slug}
          clinicName={clinic.name}
          from={de}
          to={ate}
          collaboratorId={colab}
        />
      ) : (
        <>
      <RecallSection
        title='Por contactar'
        subtitle='data chegou — mais atrasados primeiro'
        rows={due.map(toRow)}
        emptyText='Sem recalls por contactar nesta clínica. 👌'
        now={now}
      />

      <RecallSection
        title='Em acompanhamento'
        subtitle='contactados, a aguardar resposta'
        rows={contacted.map(toRow)}
        emptyText='Sem contactos em aberto.'
        now={now}
      />

      <RecallSection
        title='Agendados'
        subtitle='próximos 90 dias'
        rows={scheduled.map(toRow)}
        emptyText='Sem ciclos agendados para os próximos 90 dias.'
        now={now}
      />

      <RecallSection
        title='Fechados recentes'
        subtitle='convertidos, dispensados e incontactáveis'
        rows={closed.map(toRow)}
        emptyText='Nada fechado recentemente.'
        now={now}
      />
        </>
      )}
    </div>
  );
}
