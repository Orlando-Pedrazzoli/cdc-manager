// 📄 src/components/agenda/AgendaGrid.tsx
// =============================================================================
// CDC Manager — Agenda: grelha do dia
// -----------------------------------------------------------------------------
// Vista diária de UMA clínica: coluna por médico a trabalhar nesse dia
// (+ coluna "Sem médico" quando há marcações por atribuir). Cada marcação é
// um cartão posicionado por hora, com a COR do médico na barra lateral e o
// estado. Clicar num cartão abre o painel de ações com as transições válidas
// da máquina de estados (confirmar, check-in, iniciar, concluir, falta,
// cancelar com motivo).
//
// Fundo de cada coluna: faixas claras = horário de trabalho do médico nesta
// clínica; a pausa de almoço da Buraca aparece naturalmente como faixa cinza.
//
// Fase 2 (paridade Dentoral): o painel mostra QUEM marcou, QUANDO e por que
// canal (P1); urgências têm badge vermelho (P5); o cancelamento exige
// motivo (P7) e as canceladas mostram quem/quando/porquê.
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { transitionAppointmentAction } from '@/actions/appointments';
import type { AppointmentStatus } from '@/models/Appointment';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

const PX_PER_MIN = 1.2;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  'checked-in': 'Chegou',
  'in-progress': 'Em consulta',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  'no-show': 'Falta',
};

const STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  pending: 'warning',
  confirmed: 'info',
  'checked-in': 'success',
  'in-progress': 'success',
  completed: 'neutral',
  cancelled: 'danger',
  'no-show': 'danger',
};

// Ações oferecidas por estado (espelho de TRANSITIONS nas actions)
const ACTIONS_BY_STATUS: Record<
  string,
  { to: AppointmentStatus; label: string }[]
> = {
  pending: [{ to: 'confirmed', label: 'Confirmar' }],
  confirmed: [
    { to: 'checked-in', label: 'Check-in (chegou)' },
    { to: 'no-show', label: 'Marcar falta' },
  ],
  'checked-in': [
    { to: 'in-progress', label: 'Iniciar consulta' },
    { to: 'no-show', label: 'Marcar falta' },
  ],
  'in-progress': [{ to: 'completed', label: 'Concluir' }],
  completed: [],
  cancelled: [],
  'no-show': [],
};

const CANCELLABLE: string[] = ['pending', 'confirmed', 'checked-in'];

/**
 * Sobreposições (ex.: urgência às 12:48 + marcação às 13:00): agrupa as
 * marcações que se tocam no tempo e atribui a cada uma uma "faixa" dentro do
 * grupo, para se mostrarem LADO A LADO em vez de uma em cima da outra.
 * Devolve, por id, { lane, lanes }.
 */
function packLanes(
  items: { id: string; startMin: number; endMin: number }[],
): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: {
    id: string;
    startMin: number;
    endMin: number;
    lane: number;
  }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 1);
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes });
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length > 0 && it.startMin >= clusterEnd) flush();
    // primeira faixa livre neste instante
    const busy = new Set(
      cluster.filter(c => c.endMin > it.startMin).map(c => c.lane),
    );
    let lane = 0;
    while (busy.has(lane)) lane++;
    cluster.push({ ...it, lane });
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length) flush();
  return out;
}

export interface AgendaAppointment {
  id: string;
  doctorId: string | null;
  startMin: number;
  endMin: number;
  start: string; // 'HH:mm'
  end: string;
  patientLabel: string;
  treatmentName: string;
  status: string;
  // --- Fase 2 ---
  isUrgent: boolean;
  /** "Karla Ferraz" (nome do utilizador) ou null (website / sistema) */
  createdByName: string | null;
  /** "09-09-2026 11:41" (Lisboa) */
  createdAtLabel: string;
  channelLabel: string;
  note: string | null;
  cancelledByName: string | null;
  cancelledAtLabel: string | null;
  cancelReason: string | null;
  /** Remarcada → id/hora da nova marcação */
  rescheduledToLabel: string | null;
  /** P2: trabalho de laboratório com retorno previsto NESTE dia */
  labDue: { work: string; lab: string; status: string }[];
}

const CHANNEL_LABEL: Record<string, string> = {
  website: 'Site',
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  'front-desk': 'Balcão',
  doctor: 'Médico',
  system: 'Sistema',
};
export { CHANNEL_LABEL };

export interface AgendaDoctorColumn {
  id: string;
  name: string;
  color: string;
  /** Faixas de trabalho (minutos) nesta clínica neste dia */
  ranges: { start: number; end: number }[];
}

export function AgendaGrid({
  gridStart,
  gridEnd,
  doctors,
  appointments,
}: {
  gridStart: number; // minutos (abertura da clínica)
  gridEnd: number; // minutos (fecho)
  doctors: AgendaDoctorColumn[];
  appointments: AgendaAppointment[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const totalMin = gridEnd - gridStart;
  const height = totalMin * PX_PER_MIN;

  const hasUnassigned = appointments.some(a => a.doctorId === null);
  const columns: (AgendaDoctorColumn | { id: null; name: string })[] = [
    ...doctors,
    ...(hasUnassigned ? [{ id: null as null, name: 'Sem médico' }] : []),
  ];

  // Marcas de hora (de hora a hora)
  const hourMarks: number[] = [];
  for (let m = Math.ceil(gridStart / 60) * 60; m <= gridEnd; m += 60) {
    hourMarks.push(m);
  }
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const doTransition = async (to: AppointmentStatus, reason?: string) => {
    if (!selected) return;
    setBusy(true);
    const res = await transitionAppointmentAction(selected.id, to, {
      cancelReason: reason,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Marcação atualizada.');
      setSelected(null);
      setCancelMode(false);
      setCancelReason('');
      router.refresh();
    }
  };

  if (columns.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
          color: '#9AA1B4',
          fontSize: '14px',
        }}
      >
        Nenhum médico trabalha nesta clínica neste dia.
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '12px',
          overflowX: 'auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `56px repeat(${columns.length}, minmax(180px, 1fr))`,
            minWidth: 56 + columns.length * 180,
          }}
        >
          {/* Cabeçalhos */}
          <div style={{ borderBottom: '1px solid #EEF1F8' }} />
          {columns.map(col => (
            <div
              key={col.id ?? 'unassigned'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderBottom: '1px solid #EEF1F8',
                borderLeft: '1px solid #F0F2F7',
              }}
            >
              {'color' in col && (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '999px',
                    backgroundColor: col.color,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {col.name}
              </span>
            </div>
          ))}

          {/* Coluna das horas */}
          <div style={{ position: 'relative', height }}>
            {hourMarks.map(m => (
              <span
                key={m}
                style={{
                  position: 'absolute',
                  top: (m - gridStart) * PX_PER_MIN - 7,
                  right: 8,
                  fontSize: '11px',
                  color: '#9AA1B4',
                }}
              >
                {hhmm(m)}
              </span>
            ))}
          </div>

          {/* Colunas */}
          {columns.map(col => {
            const colAppts = appointments.filter(a =>
              col.id === null ? a.doctorId === null : a.doctorId === col.id,
            );
            // Canceladas/faltas não disputam espaço com as ativas
            const laneMap = packLanes(
              colAppts.filter(
                a => a.status !== 'cancelled' && a.status !== 'no-show',
              ),
            );
            const workRanges = 'ranges' in col ? col.ranges : [];
            return (
              <div
                key={col.id ?? 'unassigned'}
                style={{
                  position: 'relative',
                  height,
                  borderLeft: '1px solid #F0F2F7',
                  backgroundColor: '#F7F8FC', // fora do horário = cinza
                }}
              >
                {/* Faixas de horário de trabalho (fundo branco) */}
                {workRanges.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: (r.start - gridStart) * PX_PER_MIN,
                      height: (r.end - r.start) * PX_PER_MIN,
                      left: 0,
                      right: 0,
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                ))}
                {/* Linhas de hora */}
                {hourMarks.map(m => (
                  <div
                    key={m}
                    style={{
                      position: 'absolute',
                      top: (m - gridStart) * PX_PER_MIN,
                      left: 0,
                      right: 0,
                      borderTop: '1px solid #F0F2F7',
                    }}
                  />
                ))}
                {/* Marcações */}
                {colAppts.map(a => {
                  const cancelled =
                    a.status === 'cancelled' || a.status === 'no-show';
                  const lp = laneMap.get(a.id) ?? { lane: 0, lanes: 1 };
                  const laneW = 100 / lp.lanes;
                  return (
                    <button
                      key={a.id}
                      type='button'
                      onClick={() => setSelected(a)}
                      style={{
                        position: 'absolute',
                        top: (a.startMin - gridStart) * PX_PER_MIN,
                        height: Math.max(
                          (a.endMin - a.startMin) * PX_PER_MIN - 2,
                          24,
                        ),
                        left: `calc(${lp.lane * laneW}% + 4px)`,
                        width: `calc(${laneW}% - ${lp.lanes > 1 ? 6 : 8}px)`,
                        zIndex: a.isUrgent ? 2 : 1,
                        textAlign: 'left',
                        border: '1px solid #E3E8F5',
                        borderLeft: `4px solid ${'color' in col ? col.color : '#9AA1B4'}`,
                        borderRadius: '8px',
                        backgroundColor: cancelled
                          ? '#F7F8FC'
                          : a.isUrgent
                            ? '#FDEDED'
                            : '#EAF0FF',
                        opacity: cancelled ? 0.55 : 1,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1B2A6B',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textDecoration: cancelled ? 'line-through' : 'none',
                        }}
                      >
                        {a.isUrgent && (
                          <span
                            style={{
                              display: 'inline-block',
                              marginRight: 5,
                              padding: '0 5px',
                              borderRadius: '4px',
                              backgroundColor: '#B3261E',
                              color: '#FFFFFF',
                              fontSize: '9px',
                              fontWeight: 800,
                              letterSpacing: '0.5px',
                              verticalAlign: 'middle',
                            }}
                          >
                            URG
                          </span>
                        )}
                        {a.start} · {a.patientLabel}
                        {a.labDue.length > 0 && (
                          <span
                            title={a.labDue
                              .map(l => `${l.work} · ${l.lab} (${l.status})`)
                              .join('\n')}
                            style={{
                              display: 'inline-block',
                              marginLeft: 5,
                              padding: '0 5px',
                              borderRadius: '4px',
                              backgroundColor: '#2743A6',
                              color: '#FFFFFF',
                              fontSize: '9px',
                              fontWeight: 800,
                              letterSpacing: '0.5px',
                              verticalAlign: 'middle',
                            }}
                          >
                            LAB
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: '#6A7186',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {a.treatmentName} · {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Painel de ações da marcação */}
      <Modal
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setCancelMode(false);
          setCancelReason('');
        }}
        title='Marcação'
      >
        {selected && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                }}
              >
                {selected.patientLabel}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  color: '#6A7186',
                }}
              >
                {selected.treatmentName} · {selected.start}–{selected.end}
              </p>
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <Badge variant={STATUS_VARIANT[selected.status] ?? 'neutral'}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </Badge>
                {selected.isUrgent && <Badge variant='danger'>Urgência</Badge>}
              </div>
            </div>

            {/* Rastreabilidade (P1/P7): quem marcou, quando, canal */}
            <div
              style={{
                borderRadius: '10px',
                backgroundColor: '#F8F9FD',
                border: '1px solid #EEF1F8',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#3D4257',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span>
                <strong>Marcada por</strong>{' '}
                {selected.createdByName ?? selected.channelLabel} em{' '}
                {selected.createdAtLabel}
                {selected.createdByName ? ` · ${selected.channelLabel}` : ''}
              </span>
              {selected.note && (
                <span>
                  <strong>Obs.:</strong> {selected.note}
                </span>
              )}
              {selected.labDue.length > 0 && (
                <span style={{ color: '#2743A6' }}>
                  <strong>Laboratório hoje:</strong>{' '}
                  {selected.labDue
                    .map(l => `${l.work} · ${l.lab} — ${l.status}`)
                    .join('; ')}
                  {' — confirmar a entrega antes da consulta'}
                </span>
              )}
              {selected.status === 'cancelled' && (
                <span style={{ color: '#B3261E' }}>
                  <strong>
                    {selected.rescheduledToLabel ? 'Remarcada' : 'Cancelada'}
                  </strong>{' '}
                  por {selected.cancelledByName ?? 'paciente/sistema'}
                  {selected.cancelledAtLabel
                    ? ` em ${selected.cancelledAtLabel}`
                    : ''}
                  {selected.rescheduledToLabel
                    ? ` → ${selected.rescheduledToLabel}`
                    : selected.cancelReason
                      ? ` — ${selected.cancelReason}`
                      : ''}
                </span>
              )}
            </div>

            {!cancelMode ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(ACTIONS_BY_STATUS[selected.status] ?? []).map(a => (
                  <Button
                    key={a.to}
                    size='sm'
                    variant={a.to === 'no-show' ? 'outline' : 'primary'}
                    loading={busy}
                    onClick={() => doTransition(a.to)}
                  >
                    {a.label}
                  </Button>
                ))}
                {CANCELLABLE.includes(selected.status) && (
                  <Button
                    size='sm'
                    variant='danger'
                    disabled={busy}
                    onClick={() => setCancelMode(true)}
                  >
                    Cancelar marcação
                  </Button>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <Input
                  id='cancel-reason'
                  label='Motivo do cancelamento *'
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  maxLength={300}
                  required
                  placeholder='Ex.: pedido do paciente, médico indisponível…'
                  help='Obrigatório — fica no histórico de marcações apagadas'
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    size='sm'
                    variant='danger'
                    loading={busy}
                    disabled={cancelReason.trim().length < 3}
                    onClick={() => doTransition('cancelled', cancelReason)}
                  >
                    Confirmar cancelamento
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => setCancelMode(false)}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
