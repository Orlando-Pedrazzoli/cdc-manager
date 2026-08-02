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
}

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
                        left: 4,
                        right: 4,
                        textAlign: 'left',
                        border: '1px solid #E3E8F5',
                        borderLeft: `4px solid ${'color' in col ? col.color : '#9AA1B4'}`,
                        borderRadius: '8px',
                        backgroundColor: cancelled ? '#F7F8FC' : '#EAF0FF',
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
                        {a.start} · {a.patientLabel}
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
              <div style={{ marginTop: 8 }}>
                <Badge variant={STATUS_VARIANT[selected.status] ?? 'neutral'}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </Badge>
              </div>
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
                  label='Motivo do cancelamento (opcional)'
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  maxLength={300}
                  placeholder='Ex.: pedido do paciente'
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    size='sm'
                    variant='danger'
                    loading={busy}
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
