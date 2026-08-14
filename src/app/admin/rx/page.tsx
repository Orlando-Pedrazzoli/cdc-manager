// 📄 src/app/admin/rx/page.tsx
// =============================================================================
// CDC Manager — Sala de RX: fila de pedidos
// -----------------------------------------------------------------------------
// O ecrã que fica ABERTO no PC da sala de RX. O médico pede na consulta e o
// pedido aparece aqui na hora (AutoRefresh 30s — mais agressivo que as
// dashboards: o paciente está literalmente a caminhar para a sala). O
// operador vê QUEM vem, O QUE captar (modalidade + dentes + nota do médico)
// e marca Iniciar/Concluir — o estado volta ao médico na consulta.
//
// Fila POR CLÍNICA (seletor no topo; cada unidade tem a sua sala/equipa).
// Secções: Por captar (requested+in-progress, mais antigos primeiro) e
// Concluídos hoje (confirmação visual do turno). Cancelados não aparecem.
//
// FASE 2 (ponte iRYS/CS Imaging): quando as imagens entrarem em imageRefs,
// esta página ganha a coluna de miniaturas — o fluxo do operador não muda.
// RBAC: layout /admin (admin + receção). force-dynamic (fila viva).
// =============================================================================

import Link from 'next/link';
import { dbConnect } from '@/lib/mongodb';
import AutoRefresh from '@/components/ui/AutoRefresh';
import RxRequest from '@/models/RxRequest';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import {
  RX_MODALITY_LABEL,
  RX_STATUS_LABEL,
  type RxModality,
  type RxStatus,
} from '@/lib/domain';
import { RxQueueActions } from '@/components/rx/RxQueueActions';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  requested: { bg: '#FFF4DE', fg: '#8A5A00' },
  'in-progress': { bg: '#E4EBFF', fg: '#2743A6' },
  done: { bg: '#E0F5EA', fg: '#0F7B4D' },
};

const timeFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Lisbon',
});

export default async function RxQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string }>;
}) {
  const sp = await searchParams;
  await dbConnect();

  const clinics = await getActiveClinics();
  const selected =
    clinics.find(c => c.slug === sp.clinic) ?? clinics[0] ?? null;

  if (!selected) {
    return (
      <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
        Sem clínicas ativas configuradas.
      </p>
    );
  }

  const today = todayLisbon();
  const dayStart = lisbonToUtc(today, 0);
  const dayEnd = lisbonToUtc(today, 24 * 60);

  const [pendingRaw, doneRaw] = await Promise.all([
    // Por captar: pendentes de QUALQUER dia (um pedido de ontem esquecido
    // não pode desaparecer da fila), mais antigos primeiro
    RxRequest.find({
      clinicId: selected._id,
      status: { $in: ['requested', 'in-progress'] },
    })
      .sort({ requestedAt: 1 })
      .limit(30)
      .lean(),
    RxRequest.find({
      clinicId: selected._id,
      status: 'done',
      completedAt: { $gte: dayStart, $lt: dayEnd },
    })
      .sort({ completedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const all = [...pendingRaw, ...doneRaw];
  const patientIds = [...new Set(all.map(r => String(r.patientId)))];
  const doctorIds = [...new Set(all.map(r => String(r.doctorId)))];
  const [patients, doctors] = await Promise.all([
    Patient.find({ _id: { $in: patientIds } })
      .select('name processNumber')
      .lean(),
    Doctor.find({ _id: { $in: doctorIds } })
      .select('name')
      .lean(),
  ]);
  const patientById = new Map(
    patients.map(p => [
      String(p._id),
      { name: p.name, proc: String(p.processNumber ?? '') },
    ]),
  );
  const doctorById = new Map(doctors.map(d => [String(d._id), d.name]));

  const mapRow = (r: (typeof all)[number]) => ({
    id: String(r._id),
    time: timeFmt.format(
      (r.status === 'done' && r.completedAt
        ? r.completedAt
        : r.requestedAt) as Date,
    ),
    patient: patientById.get(String(r.patientId)) ?? {
      name: '(paciente)',
      proc: '',
    },
    patientId: String(r.patientId),
    doctorName: doctorById.get(String(r.doctorId)) ?? '(médico)',
    modality: RX_MODALITY_LABEL[r.modality as RxModality] ?? r.modality,
    teeth: ((r.toothNumbers as string[]) ?? []).join(', '),
    notes: (r.notes as string | null) ?? null,
    status: r.status as RxStatus,
  });
  const pending = pendingRaw.map(mapRow);
  const done = doneRaw.map(mapRow);

  const Row = ({
    row,
    withActions,
  }: {
    row: ReturnType<typeof mapRow>;
    withActions: boolean;
  }) => {
    const st = STATUS_STYLE[row.status] ?? { bg: '#EAECF3', fg: '#3D4257' };
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '12px 20px',
          borderTop: '1px solid #F4F6FB',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
            width: 46,
            flexShrink: 0,
          }}
        >
          {row.time}
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
            <Link
              href={`/admin/pacientes/${row.patientId}`}
              style={{ color: '#1C2233', textDecoration: 'none' }}
            >
              {row.patient.name}
            </Link>
            {row.patient.proc && (
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6A7186',
                }}
              >
                Proc. {row.patient.proc}
              </span>
            )}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {row.modality}
            {row.teeth && ` · Dentes ${row.teeth}`}
            {' · '}
            {row.doctorName}
            {row.notes && (
              <span style={{ color: '#8A5A00' }}> · “{row.notes}”</span>
            )}
          </p>
        </div>
        <span
          style={{
            borderRadius: '999px',
            padding: '2px 10px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: st.bg,
            color: st.fg,
            flexShrink: 0,
          }}
        >
          {RX_STATUS_LABEL[row.status]}
        </span>
        {withActions && (
          <RxQueueActions requestId={row.id} status={row.status} />
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Fila viva: o paciente está a caminho da sala — 30s */}
      <AutoRefresh intervalMs={30_000} />

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
            Sala de Raio-X
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            Pedidos enviados pelos médicos durante a consulta
          </p>
        </div>
        {/* Seletor de clínica (mesmo padrão de tabs por slug do resto) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {clinics.map(c => {
            const active = c.slug === selected.slug;
            return (
              <Link
                key={c.slug}
                href={`/admin/rx?clinic=${c.slug}`}
                style={{
                  borderRadius: '999px',
                  padding: '7px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: active ? '#FFFFFF' : '#1B2A6B',
                  backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                  border: active ? 'none' : '1px solid #D8DEEF',
                }}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Por captar */}
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
            padding: '13px 20px',
            borderBottom: '1px solid #EEF1F8',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Por captar
          {pending.length > 0 && (
            <span
              style={{
                marginLeft: '8px',
                borderRadius: '999px',
                padding: '1px 8px',
                fontSize: '12px',
                backgroundColor: '#FFF4DE',
                color: '#8A5A00',
              }}
            >
              {pending.length}
            </span>
          )}
        </div>
        {pending.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '20px',
              fontSize: '13px',
              color: '#9AA1B4',
            }}
          >
            Sem pedidos pendentes — os novos aparecem aqui automaticamente.
          </p>
        ) : (
          pending.map(row => <Row key={row.id} row={row} withActions />)
        )}
      </div>

      {/* Concluídos hoje */}
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
            padding: '13px 20px',
            borderBottom: '1px solid #EEF1F8',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Concluídos hoje
        </div>
        {done.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '20px',
              fontSize: '13px',
              color: '#9AA1B4',
            }}
          >
            Ainda nenhum concluído hoje.
          </p>
        ) : (
          done.map(row => <Row key={row.id} row={row} withActions={false} />)
        )}
      </div>
    </div>
  );
}
