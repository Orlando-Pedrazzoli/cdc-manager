// 📄 src/app/admin/proteses/page.tsx
// =============================================================================
// CDC Manager — Admin: Próteses (casos no laboratório externo)
// -----------------------------------------------------------------------------
// A fila de perseguição dos trabalhos protéticos, no padrão dos sistemas
// de case tracking: filtros de um clique com contadores, ATRASADAS à
// cabeça (status 'sent' com data prevista ultrapassada — "há X dias" a
// vermelho), telefone do laboratório… não temos; o que a receção precisa
// à vista: laboratório, paciente, trabalho, enviada, prevista, estado e
// ações (Recebida / Nova data pós-cobrança / Colocada / Cancelar).
// =============================================================================

import Link from 'next/link';
import { FlaskConical, PhoneCall } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import LabCase from '@/models/LabCase';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import {
  LAB_WORK_TYPE_LABEL,
  LAB_CASE_STATUS_LABEL,
  type LabWorkType,
  type LabCaseStatus,
} from '@/lib/domain';
import { LabCaseToolbar } from '@/components/proteses/NewLabCaseModal';
import { LabCaseRowActions } from '@/components/proteses/LabCaseRowActions';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'em-curso', label: 'No laboratório' },
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'a-chegar', label: 'A chegar (7 dias)' },
  { key: 'recebidas', label: 'Recebidas' },
  { key: 'todas', label: 'Todas' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const STATUS_BADGE: Record<LabCaseStatus, { bg: string; fg: string }> = {
  sent: { bg: '#E8EEFF', fg: '#2743A6' },
  received: { bg: '#E7F6EC', fg: '#1B7A3D' },
  delivered: { bg: '#EEF0F4', fg: '#3A3F4A' },
  cancelled: { bg: '#FDEDED', fg: '#B3261E' },
};

function ptDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

export default async function ProtesesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const sp = await searchParams;
  const filtro: FilterKey = FILTERS.some(f => f.key === sp.filtro)
    ? (sp.filtro as FilterKey)
    : 'em-curso';

  await dbConnect();
  const today0 = lisbonToUtc(todayLisbon(), 0);
  const in7days = new Date(today0.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Contadores dos separadores (sempre visíveis, qualquer filtro ativo)
  const [nSent, nOverdue, nDueSoon, nReceived, nAll] = await Promise.all([
    LabCase.countDocuments({ status: 'sent' }),
    LabCase.countDocuments({ status: 'sent', dueDate: { $lt: today0 } }),
    LabCase.countDocuments({
      status: 'sent',
      dueDate: { $gte: today0, $lt: in7days },
    }),
    LabCase.countDocuments({ status: 'received' }),
    LabCase.countDocuments({}),
  ]);
  const counts: Record<FilterKey, number> = {
    'em-curso': nSent,
    atrasadas: nOverdue,
    'a-chegar': nDueSoon,
    recebidas: nReceived,
    todas: nAll,
  };

  const query =
    filtro === 'em-curso'
      ? { status: 'sent' as const }
      : filtro === 'atrasadas'
        ? { status: 'sent' as const, dueDate: { $lt: today0 } }
        : filtro === 'a-chegar'
          ? {
              status: 'sent' as const,
              dueDate: { $gte: today0, $lt: in7days },
            }
          : filtro === 'recebidas'
            ? { status: 'received' as const }
            : {};

  const cases = await LabCase.find(query)
    .sort(
      filtro === 'todas' ? { createdAt: -1 } : { dueDate: 1 }, // atrasadas primeiro
    )
    .limit(200)
    .lean();

  const [clinics, patients, doctors] = await Promise.all([
    getActiveClinics(),
    Patient.find({ _id: { $in: cases.map(c => c.patientId) } })
      .select('name processNumber phone')
      .lean(),
    Doctor.find({ active: true }).select('name').sort({ name: 1 }).lean(),
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const doctorById = new Map(doctors.map(d => [String(d._id), d.name]));
  const clinicById = new Map(clinics.map(c => [String(c._id), c.name]));

  // Laboratórios já usados (datalist do modal — aprende com o histórico)
  const knownLabs: string[] = await LabCase.distinct('labName');

  const nowMs = today0.getTime();
  const daysLate = (due: Date) =>
    Math.max(1, Math.ceil((nowMs - due.getTime()) / (24 * 60 * 60 * 1000)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
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
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <FlaskConical size={22} />
            Próteses
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
            Trabalhos enviados ao laboratório — enviadas, previstas e atrasos a
            cobrar
          </p>
        </div>
        <LabCaseToolbar
          clinics={clinics.map(c => ({ id: String(c._id), name: c.name }))}
          doctors={doctors.map(d => ({ id: String(d._id), name: d.name }))}
          knownLabs={knownLabs}
        />
      </div>

      {/* Alerta de cobrança */}
      {nOverdue > 0 && filtro !== 'atrasadas' && (
        <Link
          href='/admin/proteses?filtro=atrasadas'
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid #F3CFCC',
            backgroundColor: '#FDF3F2',
            borderRadius: '12px',
            padding: '12px 16px',
            textDecoration: 'none',
          }}
        >
          <PhoneCall size={16} color='#B3261E' />
          <strong style={{ fontSize: '14px', color: '#B3261E' }}>
            {nOverdue}{' '}
            {nOverdue === 1 ? 'prótese atrasada' : 'próteses atrasadas'} — ligar
            ao laboratório a cobrar
          </strong>
        </Link>
      )}

      {/* Filtros com contadores */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = filtro === f.key;
          const danger = f.key === 'atrasadas' && counts.atrasadas > 0;
          return (
            <Link
              key={f.key}
              href={`/admin/proteses?filtro=${f.key}`}
              style={{
                padding: '7px 14px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                color: active ? '#FFFFFF' : danger ? '#B3261E' : '#1B2A6B',
                backgroundColor: active
                  ? danger
                    ? '#B3261E'
                    : '#1B2A6B'
                  : '#FFFFFF',
                border: `1px solid ${
                  active ? 'transparent' : danger ? '#F3CFCC' : '#D8DEEF'
                }`,
              }}
            >
              {f.label} · {counts[f.key]}
            </Link>
          );
        })}
      </div>

      {/* Fila */}
      {cases.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '28px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#6A7186',
            border: '1px dashed #D8DEEF',
            borderRadius: '12px',
            backgroundColor: '#FFFFFF',
          }}
        >
          Sem casos neste filtro.
        </p>
      ) : (
        <div
          style={{
            border: '1px solid #D8DEEF',
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
          }}
        >
          {cases.map((c, i) => {
            const p = patientById.get(String(c.patientId));
            const status = c.status as LabCaseStatus;
            const overdue = status === 'sent' && c.dueDate.getTime() < nowMs;
            const badge = STATUS_BADGE[status];
            return (
              <div
                key={String(c._id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  flexWrap: 'wrap',
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid #EEF0F4',
                  backgroundColor: overdue ? '#FFFBFA' : '#FFFFFF',
                  fontSize: '13px',
                }}
              >
                <div style={{ minWidth: 170 }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: '#1B2A6B',
                      fontSize: '14px',
                    }}
                  >
                    {c.labName}
                  </p>
                  <p style={{ margin: '2px 0 0', color: '#6A7186' }}>
                    {LAB_WORK_TYPE_LABEL[c.workType as LabWorkType]}
                    {c.toothNotes ? ` · ${c.toothNotes}` : ''}
                    {c.shade ? ` · cor ${c.shade}` : ''}
                  </p>
                </div>

                <div style={{ minWidth: 160, flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#1B2A6B' }}>
                    {p?.name ?? '(paciente removido)'}
                  </p>
                  <p style={{ margin: '2px 0 0', color: '#6A7186' }}>
                    {clinicById.get(String(c.clinicId)) ?? '—'}
                    {c.doctorId
                      ? ` · ${doctorById.get(String(c.doctorId)) ?? ''}`
                      : ''}
                  </p>
                </div>

                <div style={{ minWidth: 150 }}>
                  <p style={{ margin: 0, color: '#6A7186' }}>
                    Enviada {ptDate(c.sentAt)}
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontWeight: 700,
                      color: overdue ? '#B3261E' : '#1B2A6B',
                    }}
                  >
                    Prevista {ptDate(c.dueDate)}
                    {overdue ? ` · há ${daysLate(c.dueDate)} d` : ''}
                  </p>
                </div>

                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: overdue ? '#FDEDED' : badge.bg,
                    color: overdue ? '#B3261E' : badge.fg,
                  }}
                >
                  {overdue ? 'Atrasada' : LAB_CASE_STATUS_LABEL[status]}
                </span>

                <LabCaseRowActions id={String(c._id)} status={status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
