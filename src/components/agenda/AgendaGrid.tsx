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
//
// 3.ª reunião (Victor, 09/10/2026):
// · 01 ERRO — canceladas NÃO entram na grelha (cancelar e remarcar no mesmo
//   horário sobrepunha os dois cartões). Ficam no Histórico e na vista
//   Lista; a grelha mostra só um contador discreto com atalho.
// · 02 — o nome do paciente no painel é link para a ficha → Consultas.
// · 03 — a pastilha LAB diz QUE trabalho e de QUE laboratório; a
//   observação da marcação aparece no próprio cartão.
//
// 4.ª ronda (Victor, nov. 2026):
// · 01 — marcações legíveis: a grelha é mais alta (2,4 px/min) para cada
//   cartão mostrar a hora, o nome e as OBSERVAÇÕES sem clicar.
// · 03 — clicar num horário livre abre a nova marcação com a hora e o
//   médico dessa coluna já preenchidos.
// · 04 — cores fortes: o cartão tem a COR DO MÉDICO (fundo e barra).
// · 05 — clicar no NOME do paciente abre a ficha rápida (contacto, alertas,
//   saldo, próximas marcações) sem sair da agenda; o resto do cartão
//   continua a abrir as ações da marcação.
//
// 5.ª ronda (Victor, nov. 2026):
// · 01 — a janela da marcação tem a caixa "Observações", editável em
//   qualquer altura; o que lá se escreve aparece na linha da marcação.
// · 07 — fora do turno do médico a coluna fica FECHADA (escuro, tracejado)
//   e não aceita cliques; médico fora da escala nesse dia só aparece se
//   tiver marcações, com a coluna toda fechada e o aviso "Fora da escala".
//
// Cancelamentos (Victor, email de 11/11 e áudio de 12/11/2026) — INVERTE a
// 3.ª reunião/01: a cancelada volta a ficar na grelha, a laranja, com o
// motivo à vista, a ocupar o seu horário "até se ir marcar outra pessoa".
// Aí a receção retira-a ("Retirar da agenda") — ou sai sozinha quando se
// marca por cima — e fica na caixa "Canceladas" por baixo do calendário.
// Ao cancelar indica-se QUEM cancelou (paciente ou clínica).
// · 13 — pré-marcações (ficha por completar) levam a pastilha "S/ FICHA".
// =============================================================================

'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ExternalLink, Plus, StickyNote } from 'lucide-react';
import { tint } from '@/lib/branding';
import {
  NewAppointmentModal,
  type NewAppointmentLabTarget,
} from '@/components/agenda/NewAppointmentModal';
import { PatientQuickView } from '@/components/agenda/PatientQuickView';
import {
  transitionAppointmentAction,
  updateAppointmentDurationAction,
  updateAppointmentNoteAction,
  removeCancelledFromGridAction,
  setAttendanceClosedAction,
  undoCheckInAction,
} from '@/actions/appointments';
import { AGENDA_COLORS, AGENDA_LEGEND, agendaColor } from '@/lib/agenda-colors';
import type { AppointmentStatus } from '@/models/Appointment';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { ConsultProgress } from '@/components/agenda/ConsultProgress';
import {
  RescheduleForm,
  type RescheduleClinic,
} from '@/components/agenda/RescheduleForm';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  NewLabCaseModal,
  type LabOption,
} from '@/components/proteses/NewLabCaseModal';

// 4.ª ronda/01: 2,4 px/min → 15 min = 2 linhas, 20 min = 3, 30 min = 5
const PX_PER_MIN = 2.4;
const LINE_PX = 14;
/** 4.ª ronda/03: o clique num horário livre arredonda a 5 min */
const CLICK_STEP_MIN = 5;
const HOVER_BAND_MIN = 15;

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
  // 6.ª ronda/06: "lançar" o paciente quando chega — aparece no ecrã do
  // médico (O meu dia → Na sala de espera), que o chama e abre a ficha
  pending: [
    { to: 'checked-in', label: 'Chegou — enviar ao médico' },
    { to: 'confirmed', label: 'Confirmar' },
  ],
  confirmed: [
    { to: 'checked-in', label: 'Chegou — enviar ao médico' },
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
// Apontamento 01 (2.ª reunião): estender/encurtar a marcação na própria
// agenda. Em curso também — o médico pode estar a passar do tempo.
const DURATION_EDITABLE: string[] = [
  'pending',
  'confirmed',
  'checked-in',
  'in-progress',
];
// Apontamento 05: ligar trabalho de laboratório à marcação de retorno
const LAB_LINKABLE: string[] = ['pending', 'confirmed', 'checked-in'];
// 3.ª reunião/03: pastilha de laboratório ("LAB · Coroa · MPR")
const labPillStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 5,
  marginRight: 5,
  padding: '0 5px',
  borderRadius: '4px',
  backgroundColor: '#2743A6',
  color: '#FFFFFF',
  fontSize: '9px',
  fontWeight: 800,
  letterSpacing: '0.5px',
  verticalAlign: 'middle',
  maxWidth: '100%',
};
const DURATION_STEPS: { delta: number; label: string }[] = [
  { delta: -15, label: '−15' },
  { delta: 15, label: '+15' },
  { delta: 30, label: '+30' },
  { delta: 60, label: '+60' },
];

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
  /** 7.ª ronda/A3: "Tudo OK" — quando e quem fechou o atendimento */
  closedAtLabel?: string | null;
  closedByName?: string | null;
  /** Remarcada → id/hora da nova marcação */
  rescheduledToLabel: string | null;
  /** P2 + apontamento 05: trabalhos de laboratório ligados a esta marcação
   *  (explicitamente) ou com retorno previsto NESTE dia */
  labDue: { work: string; lab: string; status: string }[];
  /** Apontamento 05: para ligar um novo pedido de laboratório à marcação */
  patientId: string;
  /** P3: para o formulário de remarcação */
  clinicId: string;
  date: string; // YYYY-MM-DD
  /** 5.ª ronda/13: ficha criada numa pré-marcação, ainda por completar */
  provisional?: boolean;
  /** Cancelada que ainda ocupa o lugar na grelha (lib/attendance.ts) */
  cancelledOnGrid?: boolean;
  /** 'patient' | 'clinic' | 'system' */
  cancelledBy?: string | null;
  /** Início e fim reais (epoch ms) — para a barra de tempo da consulta */
  startMs?: number;
  endMs?: number;
  /** 5.ª ronda/09: como nos conheceu (rótulo pronto a mostrar) */
  referralLabel?: string | null;
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
  /** 5.ª ronda/07: não está escalado neste dia — a coluna só existe porque
   *  tem marcações; fica toda fechada */
  offSchedule?: boolean;
}

// 5.ª ronda/07: fora do turno = fechado (escuro, tracejado) — a receção vê
// de imediato que ali não se marca
const CLOSED_BG =
  'repeating-linear-gradient(135deg, #C9CEDB 0px, #C9CEDB 8px, #BEC4D3 8px, #BEC4D3 16px)';
const provisionalPillStyle: React.CSSProperties = {
  display: 'inline-block',
  marginRight: 5,
  padding: '0 5px',
  borderRadius: '4px',
  backgroundColor: '#9A6700',
  color: '#FFFFFF',
  fontSize: '9px',
  fontWeight: 800,
  letterSpacing: '0.5px',
  verticalAlign: 'middle',
  lineHeight: '14px',
};

export function AgendaGrid({
  gridStart,
  gridEnd,
  doctors,
  appointments,
  rescheduleClinics = [],
  labOptions = [],
  historyHref,
  newAppointment,
}: {
  gridStart: number; // minutos (abertura da clínica)
  gridEnd: number; // minutos (fecho)
  doctors: AgendaDoctorColumn[];
  appointments: AgendaAppointment[];
  /** P3: clínicas + médicos para o formulário de remarcação */
  rescheduleClinics?: RescheduleClinic[];
  /** Apontamento 05: laboratórios ativos — "Trabalho de laboratório" na
   *  marcação. Sem lista, o botão não aparece. */
  labOptions?: LabOption[];
  /** 3.ª reunião/01: atalho para o Histórico quando há canceladas no dia */
  historyHref?: string;
  /** 4.ª ronda/03: dados para abrir "Nova marcação" ao clicar num horário
   *  livre. Sem isto (ou em dias passados) a grelha não é clicável. */
  newAppointment?: {
    clinicId: string;
    clinic?: { label: string; color: string };
    date: string; // YYYY-MM-DD do dia em vista
    canCreate: boolean; // false em dias passados
    doctors: { id: string; name: string }[];
    treatments: { id: string; name: string; category?: string | null }[];
    rooms?: { id: string; name: string }[];
    /** 5.ª ronda/09: promoção do mês em vigor */
    promo?: string | null;
  };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  // Só os campos que o pedido ao laboratório usa — serve tanto para uma
  // marcação da grelha como para uma acabada de criar (7.ª ronda/B1)
  const [labFor, setLabFor] = useState<NewAppointmentLabTarget | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelWho, setCancelWho] = useState<'patient' | 'clinic'>('patient');
  const [busy, setBusy] = useState(false);
  // 4.ª ronda/03: horário livre sob o rato + nova marcação a partir dele
  const [hover, setHover] = useState<{ col: string; min: number } | null>(null);
  const [slot, setSlot] = useState<{ doctorId: string; start: string } | null>(null);
  // 4.ª ronda/05: ficha rápida do paciente
  const [quick, setQuick] = useState<{ id: string; name: string } | null>(null);
  const clickable = !!newAppointment?.canCreate;
  // 5.ª ronda/01: observação em edição na janela da marcação
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);
  const noteText =
    selected && noteDraft?.id === selected.id ? noteDraft.text : (selected?.note ?? '');
  const noteDirty = !!selected && noteText.trim() !== (selected.note ?? '');
  const saveNote = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await updateAppointmentNoteAction(selected.id, noteText);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Observação guardada.');
    setSelected(s => (s ? { ...s, note: res.note ?? null } : s));
    setNoteDraft(null);
    router.refresh();
  };
  /** 5.ª ronda/07: o minuto está dentro do turno desta coluna? */
  const inShift = (
    col: AgendaDoctorColumn | { id: null; name: string },
    min: number,
  ) =>
    col.id === null ||
    ('ranges' in col && col.ranges.some(r => min >= r.start && min < r.end));

  const totalMin = gridEnd - gridStart;
  const height = totalMin * PX_PER_MIN;

  // Canceladas: ficam na grelha enquanto ocuparem o lugar (cancelledOnGrid);
  // as retiradas, remarcadas ou com o horário já reaproveitado só aparecem
  // na caixa "Canceladas" e no Histórico. Faltas mantêm-se sempre.
  const visible = appointments.filter(
    a => a.status !== 'cancelled' || a.cancelledOnGrid,
  );
  const cancelledCount = appointments.length - visible.length;

  const hasUnassigned = visible.some(a => a.doctorId === null);
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

  /** Minuto (arredondado) do ponto onde o rato está numa coluna */
  const minuteAt = (e: MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const raw = gridStart + y / PX_PER_MIN;
    const m = Math.floor(raw / CLICK_STEP_MIN) * CLICK_STEP_MIN;
    return Math.min(Math.max(m, gridStart), gridEnd - CLICK_STEP_MIN);
  };

  const doTransition = async (to: AppointmentStatus, reason?: string) => {
    if (!selected) return;
    setBusy(true);
    const res = await transitionAppointmentAction(selected.id, to, {
      cancelReason: reason,
      cancelledBy: cancelWho,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Marcação atualizada.');
      setSelected(null);
      setCancelMode(false);
      setRescheduleMode(false);
      setCancelReason('');
      router.refresh();
    }
  };

  /** 7.ª ronda/A3: "Tudo OK" — fechar (ou reabrir) o atendimento */
  const setClosed = async (closed: boolean) => {
    if (!selected) return;
    setBusy(true);
    const res = await setAttendanceClosedAction(selected.id, closed);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      closed ? 'Atendimento fechado. Tudo OK.' : 'Atendimento reaberto.',
    );
    setSelected(null);
    router.refresh();
  };

  /** 7.ª ronda/A5: tirar o paciente da sala de espera (anular a chegada) */
  const undoCheckIn = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await undoCheckInAction(selected.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Chegada anulada. O paciente saiu da sala de espera.');
    setSelected(null);
    router.refresh();
  };

  /** Tirar uma cancelada da grelha para libertar o horário */
  const removeFromGrid = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await removeCancelledFromGridAction(selected.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Retirada da agenda. O registo fica na caixa "Canceladas".');
    setSelected(null);
    router.refresh();
  };

  const changeDuration = async (deltaMin: number) => {
    if (!selected) return;
    setBusy(true);
    const res = await updateAppointmentDurationAction(selected.id, deltaMin);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Termina às ${res.end} (${res.durationMin} min).`);
    // Reflete já no painel; a grelha atualiza no refresh
    setSelected(s =>
      s && res.end
        ? { ...s, end: res.end, endMin: s.startMin + (res.durationMin ?? 0) }
        : s,
    );
    router.refresh();
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
        {/* 7.ª ronda/A2: legenda das cores por estado */}
        <div
          aria-label='Legenda das cores das marcações'
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 12px',
            padding: '6px 12px',
            fontSize: '11px',
            color: '#4A5169',
            borderBottom: '1px solid #EEF1F8',
          }}
        >
          {AGENDA_LEGEND.map(k => (
            <span
              key={k}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: AGENDA_COLORS[k].bg,
                  border: `1px solid ${AGENDA_COLORS[k].border}`,
                }}
              />
              {AGENDA_COLORS[k].label}
            </span>
          ))}
          <span style={{ color: '#9AA1B4' }}>
            · barra à esquerda = cor do médico
          </span>
        </div>
        {/* 3.ª reunião/01: as canceladas não se desenham; fica só o rasto */}
        {cancelledCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              fontSize: '12px',
              color: '#6A7186',
              backgroundColor: '#FAFBFE',
              borderBottom: '1px solid #EEF1F8',
            }}
          >
            <span>
              {cancelledCount === 1
                ? '1 marcação cancelada neste dia — não aparece na grelha'
                : `${cancelledCount} marcações canceladas neste dia — não aparecem na grelha`}
            </span>
            {historyHref && (
              <Link
                href={historyHref}
                style={{
                  color: '#2743A6',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Ver no Histórico
              </Link>
            )}
          </div>
        )}
        <div
          className='cdc-agenda-grid'
          style={{
            display: 'grid',
            // --cdc-col-min vem do globals.css: 180px desktop, 150px mobile
            gridTemplateColumns: `56px repeat(${columns.length}, minmax(var(--cdc-col-min, 180px), 1fr))`,
            minWidth: `calc(56px + ${columns.length} * var(--cdc-col-min, 180px))`,
          }}
        >
          {/* Cabeçalhos — canto e coluna das horas fixos à esquerda para o
              scroll horizontal com muitos médicos não perder a referência */}
          <div
            style={{
              borderBottom: '1px solid #EEF1F8',
              position: 'sticky',
              left: 0,
              zIndex: 4,
              backgroundColor: '#FFFFFF',
            }}
          />
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
              {'offSchedule' in col && col.offSchedule && (
                <span
                  title='Não está escalado neste dia — aparece porque tem marcações'
                  style={{
                    flexShrink: 0,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    backgroundColor: '#4A5169',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  Fora da escala
                </span>
              )}
            </div>
          ))}

          {/* Coluna das horas (sticky) */}
          <div
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 4,
              height,
              backgroundColor: '#FFFFFF',
              borderRight: '1px solid #F0F2F7',
            }}
          >
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
            const colAppts = visible.filter(a =>
              col.id === null ? a.doctorId === null : a.doctorId === col.id,
            );
            // Faltas não disputam espaço com as ativas
            const laneMap = packLanes(
              colAppts.filter(a => a.status !== 'no-show'),
            );
            const workRanges = 'ranges' in col ? col.ranges : [];
            const colColor = 'color' in col ? col.color : '#6A7186';
            return (
              <div
                key={col.id ?? 'unassigned'}
                style={{
                  position: 'relative',
                  height,
                  borderLeft: '1px solid #F0F2F7',
                  // 5.ª ronda/07: fora do turno = fechado; "Sem médico"
                  // não tem turno (fundo neutro)
                  background: col.id === null ? '#F7F8FC' : CLOSED_BG,
                  cursor:
                    hover && hover.col === (col.id ?? 'unassigned')
                      ? 'copy'
                      : clickable && col.id !== null
                        ? 'not-allowed'
                        : clickable
                          ? 'copy'
                          : 'default',
                }}
                onMouseMove={
                  clickable
                    ? e => {
                        // só sobre o fundo da coluna (não sobre um cartão)
                        if (e.target !== e.currentTarget) {
                          if (hover) setHover(null);
                          return;
                        }
                        const min = minuteAt(e);
                        if (!inShift(col, min)) {
                          if (hover) setHover(null);
                          return;
                        }
                        const key = col.id ?? 'unassigned';
                        if (!hover || hover.col !== key || hover.min !== min) setHover({ col: key, min });
                      }
                    : undefined
                }
                onMouseLeave={clickable ? () => setHover(null) : undefined}
                onClick={
                  clickable
                    ? e => {
                        if (e.target !== e.currentTarget) return;
                        const min = minuteAt(e);
                        if (!inShift(col, min)) {
                          toast('Fora do turno do médico — use "Abrir / fechar dias" para marcar aqui.', { icon: '🔒' });
                          return;
                        }
                        setSlot({ doctorId: col.id ?? '', start: hhmm(min) });
                        setHover(null);
                      }
                    : undefined
                }
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
                      pointerEvents: 'none',
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
                      borderTop: '1px solid #E9ECF4',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {/* 4.ª ronda/03: horário livre sob o rato */}
                {hover && hover.col === (col.id ?? 'unassigned') && (
                  <div
                    style={{
                      position: 'absolute',
                      top: (hover.min - gridStart) * PX_PER_MIN,
                      height: HOVER_BAND_MIN * PX_PER_MIN,
                      left: 3,
                      right: 3,
                      borderRadius: '8px',
                      border: `1.5px dashed ${colColor}`,
                      backgroundColor: tint(colColor, 0.1),
                      color: colColor,
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '0 8px',
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  >
                    <Plus size={13} /> {hhmm(hover.min)}
                  </div>
                )}
                {/* Marcações */}
                {colAppts.map(a => {
                  const isCancelled = a.status === 'cancelled';
                  // 7.ª ronda/A2: a cor do cartão é a do ESTADO (semáforo);
                  // a cor do médico fica na barra lateral esquerda
                  const sc = agendaColor(a.status, !!a.closedAtLabel);
                  // Na cancelada, o que interessa ler é o MOTIVO
                  const cardNote = isCancelled
                    ? `Motivo: ${a.cancelReason ?? '—'}${a.cancelledBy === 'patient' ? ' (paciente)' : ''}`
                    : a.note;
                  const lp = laneMap.get(a.id) ?? { lane: 0, lanes: 1 };
                  const laneW = 100 / lp.lanes;
                  // Altura real do intervalo; nunca menos de uma linha
                  const slotPx = (a.endMin - a.startMin) * PX_PER_MIN - 2;
                  const cardPx = Math.max(slotPx, 22);
                  // 4.ª ronda/01: quantas linhas cabem → hora+nome, depois a
                  // OBSERVAÇÃO (prioridade), depois ato · estado
                  const lines = Math.max(1, Math.floor((cardPx - 4) / LINE_PX));
                  // com 3+ linhas o nome pode ocupar duas (nomes compridos em
                  // colunas estreitas deixam de ficar cortados)
                  const nameLines = lines >= 3 ? 2 : 1;
                  const noteLine = !!cardNote && lines >= nameLines + 1;
                  const metaLine = lines >= nameLines + (noteLine ? 1 : 0) + 1;
                  // 3.ª reunião/03: "LAB · Coroa · MPR" em vez de só "LAB"
                  const labLabel =
                    a.labDue.length === 1
                      ? `LAB · ${a.labDue[0].work} · ${a.labDue[0].lab}`
                      : a.labDue.length > 1
                        ? `LAB ×${a.labDue.length}`
                        : '';
                  const labTitle = a.labDue.map(l => `${l.work} · ${l.lab} (${l.status})`).join('\n');
                  const open = () => setSelected(a);
                  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open();
                    }
                  };
                  return (
                    <div
                      key={a.id}
                      role='button'
                      tabIndex={0}
                      onClick={open}
                      onKeyDown={onKey}
                      title={[`${a.start}–${a.end} · ${a.patientLabel}`, `${a.treatmentName} · ${sc.label}`, cardNote ? (isCancelled ? cardNote : `Obs.: ${cardNote}`) : null]
                        .filter(Boolean)
                        .join('\n')}
                      style={{
                        position: 'absolute',
                        top: (a.startMin - gridStart) * PX_PER_MIN,
                        height: cardPx,
                        left: `calc(${lp.lane * laneW}% + 4px)`,
                        width: `calc(${laneW}% - ${lp.lanes > 1 ? 6 : 8}px)`,
                        zIndex: a.isUrgent ? 2 : 1,
                        textAlign: 'left',
                        // 7.ª ronda/A2: fundo e contorno pelo estado; a
                        // barra da esquerda mantém a cor do médico (ou
                        // vermelho numa urgência)
                        border: `1px solid ${sc.border}`,
                        borderLeft: `5px solid ${a.isUrgent ? '#B3261E' : colColor}`,
                        borderRadius: '8px',
                        backgroundColor: sc.bg,
                        padding: lines >= 2 ? '2px 8px' : '0 8px',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        lineHeight: `${LINE_PX}px`,
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#141B33',
                          overflow: 'hidden',
                          textDecoration: a.status === 'no-show' ? 'line-through' : 'none',
                          ...(nameLines === 2
                            ? {
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical' as const,
                                whiteSpace: 'normal' as const,
                                lineHeight: `${LINE_PX + 1}px`,
                              }
                            : {
                                display: 'block',
                                whiteSpace: 'nowrap' as const,
                                textOverflow: 'ellipsis',
                                lineHeight: lines >= 2 ? `${LINE_PX + 2}px` : `${cardPx - 2}px`,
                              }),
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
                              lineHeight: '14px',
                            }}
                          >
                            URG
                          </span>
                        )}
                        {isCancelled && (
                          <span
                            title={`Cancelada${a.cancelReason ? ` — ${a.cancelReason}` : ''}`}
                            style={{ ...provisionalPillStyle, backgroundColor: '#B3261E' }}
                          >
                            CANCELADA
                          </span>
                        )}
                        {a.provisional && (
                          <span title='Pré-marcação: ficha por completar' style={provisionalPillStyle}>
                            S/ FICHA
                          </span>
                        )}
                        {a.start} ·{' '}
                        {/* 4.ª ronda/05: o nome abre a ficha rápida */}
                        {/* <span> e não <button>: um botão é um bloco atómico e
                            o "…" do cartão cortava o nome inteiro */}
                        <span
                          role='button'
                          tabIndex={0}
                          onClick={e => {
                            e.stopPropagation();
                            setQuick({ id: a.patientId, name: a.patientLabel });
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuick({ id: a.patientId, name: a.patientLabel });
                            }
                          }}
                          title='Ver dados do paciente'
                          className='cdc-agenda-patient'
                          style={{ cursor: 'pointer' }}
                        >
                          {a.patientLabel}
                        </span>
                        {/* Sem linha própria: pastilha / observação compactas */}
                        {a.labDue.length > 0 && !metaLine && (
                          <span title={labTitle} style={labPillStyle}>
                            LAB
                          </span>
                        )}
                        {cardNote && !noteLine && (
                          <span style={{ marginLeft: 6, fontWeight: 500, fontStyle: 'italic', color: '#7A4B00' }}>
                            <StickyNote size={11} aria-label='Observação' style={{ marginRight: 3, verticalAlign: 'middle', color: '#9A6700' }} />
                            {cardNote}
                          </span>
                        )}
                      </span>
                      {noteLine ? (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '11.5px',
                            fontStyle: 'italic',
                            fontWeight: 600,
                            color: '#7A4B00',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cardNote}
                        </span>
                      ) : null}
                      {metaLine ? (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            color: '#4A5169',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {labLabel && (
                            <span title={labTitle} style={{ ...labPillStyle, marginLeft: 0 }}>
                              {labLabel}
                            </span>
                          )}
                          {a.treatmentName} · {sc.label}
                        </span>
                      ) : null}
                      {/* Barra de tempo: enche enquanto a consulta decorre */}
                      {a.status === 'in-progress' && a.startMs != null && a.endMs != null && (
                        <ConsultProgress startMs={a.startMs} endMs={a.endMs} variant='card' />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4.ª ronda/03: nova marcação a partir de um horário livre */}
      {newAppointment && (
        <NewAppointmentModal
          open={slot !== null}
          onClose={() => setSlot(null)}
          clinicId={newAppointment.clinicId}
          clinic={newAppointment.clinic}
          initialDate={newAppointment.date}
          initialDoctorId={slot?.doctorId ?? ''}
          preferredStart={slot?.start ?? ''}
          doctors={newAppointment.doctors}
          treatments={newAppointment.treatments}
          rooms={newAppointment.rooms ?? []}
          promo={newAppointment.promo ?? null}
          labEnabled={labOptions.length > 0}
          onCreatedWithLab={setLabFor}
        />
      )}

      {/* 4.ª ronda/05: ficha rápida do paciente */}
      <PatientQuickView patientId={quick?.id ?? null} fallbackName={quick?.name} onClose={() => setQuick(null)} />

      {/* Painel de ações da marcação */}
      <Modal
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setCancelMode(false);
          setRescheduleMode(false);
          setCancelReason('');
          setNoteDraft(null);
        }}
        title='Marcação'
      >
        {selected && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div>
              {/* 4.ª ronda/05: o nome abre a ficha rápida por cima da
                  agenda; o ícone abre a ficha completa (nova aba — 3.ª
                  reunião/02: a receção não perde a agenda) */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <button
                  type='button'
                  onClick={() => setQuick({ id: selected.patientId, name: selected.patientLabel })}
                  title='Ver dados do paciente (contacto, alertas, saldo, próximas marcações)'
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                    textDecoration: 'underline',
                    textDecorationColor: '#C9D2EE',
                    textUnderlineOffset: '3px',
                  }}
                >
                  {selected.patientLabel}
                </button>
                <Link
                  href={`/admin/pacientes/${selected.patientId}?tab=consultas`}
                  target='_blank'
                  rel='noopener'
                  title='Abrir a ficha completa numa nova aba'
                  aria-label='Abrir a ficha completa numa nova aba'
                  style={{ display: 'inline-flex', color: '#2743A6' }}
                >
                  <ExternalLink size={14} />
                </Link>
              </span>
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
                {selected.status === 'completed' && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: agendaColor('completed', !!selected.closedAtLabel).bg,
                      color: agendaColor('completed', !!selected.closedAtLabel).fg,
                      border: `1px solid ${agendaColor('completed', !!selected.closedAtLabel).border}`,
                    }}
                  >
                    {selected.closedAtLabel ? 'Tudo OK' : 'Por fechar'}
                  </span>
                )}
                {selected.isUrgent && <Badge variant='danger'>Urgência</Badge>}
                {selected.provisional && (
                  <Link
                    href={`/admin/pacientes/${selected.patientId}?tab=dados`}
                    target='_blank'
                    rel='noopener'
                    title='Pré-marcação: abrir a ficha para a completar'
                    style={{ textDecoration: 'none' }}
                  >
                    <Badge variant='warning'>Ficha por completar</Badge>
                  </Link>
                )}
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
              {selected.referralLabel && (
                <span>
                  <strong>Como nos conheceu:</strong> {selected.referralLabel}
                </span>
              )}
              {selected.closedAtLabel && (
                <span style={{ color: AGENDA_COLORS.closed.fg }}>
                  <strong>Atendimento fechado (Tudo OK)</strong> por{' '}
                  {selected.closedByName ?? 'utilizador removido'} em{' '}
                  {selected.closedAtLabel}
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
                  {selected.cancelledBy === 'patient' ? '(paciente cancelou) ' : ''}
                  — registado por {selected.cancelledByName ?? 'sistema'}
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

            {/* 5.ª ronda/01: observações — sempre à vista e editáveis */}
            {!rescheduleMode && !cancelMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Textarea
                  id='appt-note'
                  label='Observações'
                  value={noteText}
                  onChange={e => setNoteDraft({ id: selected.id, text: e.target.value })}
                  maxLength={500}
                  rows={2}
                  placeholder='Ex.: PDD da Dra. / MPR OK · avisar a Dra. para trazer procaína'
                  help='Aparece na linha da marcação, na agenda.'
                />
                {noteDirty && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size='sm' loading={busy} onClick={saveNote}>
                      Guardar observação
                    </Button>
                    <Button size='sm' variant='outline' disabled={busy} onClick={() => setNoteDraft(null)}>
                      Desfazer
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Duração (apontamento 01): −15 / +15 / +30 / +60 sobre o fim */}
            {DURATION_EDITABLE.includes(selected.status) &&
              !rescheduleMode &&
              !cancelMode && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#3D4257',
                      marginRight: 2,
                    }}
                  >
                    Duração{' '}
                    <span style={{ color: '#6A7186', fontWeight: 500 }}>
                      {selected.endMin - selected.startMin} min · até{' '}
                      {selected.end}
                    </span>
                  </span>
                  {DURATION_STEPS.map(st => (
                    <button
                      key={st.delta}
                      type='button'
                      disabled={
                        busy ||
                        selected.endMin - selected.startMin + st.delta < 15
                      }
                      onClick={() => changeDuration(st.delta)}
                      title={
                        st.delta > 0
                          ? `Estender ${st.delta} min`
                          : `Encurtar ${-st.delta} min`
                      }
                      style={{
                        minWidth: 44,
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: '1px solid #D8DEEF',
                        backgroundColor: '#FFFFFF',
                        color: st.delta > 0 ? '#1B2A6B' : '#6A7186',
                        fontSize: '12px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        cursor: busy ? 'default' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}

            {rescheduleMode ? (
              <RescheduleForm
                appointmentId={selected.id}
                currentClinicId={selected.clinicId}
                currentDoctorId={selected.doctorId}
                currentDate={selected.date}
                currentStart={selected.start}
                clinics={rescheduleClinics}
                onDone={() => {
                  setRescheduleMode(false);
                  setSelected(null);
                }}
                onCancel={() => setRescheduleMode(false)}
              />
            ) : !cancelMode ? (
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
                {selected.status === 'completed' && !selected.closedAtLabel && (
                  <Button
                    size='sm'
                    loading={busy}
                    onClick={() => setClosed(true)}
                    title='Já cobrou e não há mais nada por tratar com o paciente: a marcação fica azul e regista quem fechou'
                    style={{
                      backgroundColor: AGENDA_COLORS.closed.border,
                      border: `1px solid ${AGENDA_COLORS.closed.border}`,
                    }}
                  >
                    Tudo OK — fechar atendimento
                  </Button>
                )}
                {selected.status === 'completed' && selected.closedAtLabel && (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => setClosed(false)}
                  >
                    Reabrir atendimento
                  </Button>
                )}
                {selected.status === 'checked-in' && (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={undoCheckIn}
                    title='O paciente sai da sala de espera do médico e a marcação volta ao estado anterior'
                  >
                    Anular chegada
                  </Button>
                )}
                {CANCELLABLE.includes(selected.status) &&
                  rescheduleClinics.length > 0 && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={busy}
                      onClick={() => setRescheduleMode(true)}
                    >
                      Remarcar
                    </Button>
                  )}
                {LAB_LINKABLE.includes(selected.status) &&
                  labOptions.length > 0 && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={busy}
                      onClick={() => setLabFor(selected)}
                      title='Registar um pedido ao laboratório ligado a esta marcação (ex.: coroa, prótese, moldeira para o retorno)'
                    >
                      Trabalho de laboratório
                    </Button>
                  )}
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
                {selected.status === 'cancelled' && selected.cancelledOnGrid && (
                  <Button
                    size='sm'
                    variant='outline'
                    loading={busy}
                    onClick={removeFromGrid}
                    title='Liberta o horário para outra marcação. O cancelamento fica registado na caixa "Canceladas", por baixo do calendário.'
                  >
                    Retirar da agenda (libertar o horário)
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
                {/* Quem cancelou — conta para o histórico de faltas do paciente */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(
                    [
                      ['patient', 'Paciente cancelou'],
                      ['clinic', 'Clínica / médico cancelou'],
                    ] as ['patient' | 'clinic', string][]
                  ).map(([value, label]) => {
                    const active = cancelWho === value;
                    return (
                      <button
                        key={value}
                        type='button'
                        onClick={() => setCancelWho(value)}
                        aria-pressed={active}
                        style={{
                          borderRadius: '10px',
                          border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                          backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                          color: active ? '#FFFFFF' : '#3A3F4A',
                          padding: '7px 12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <Input
                  id='cancel-reason'
                  label='Motivo do cancelamento *'
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  maxLength={300}
                  required
                  placeholder='Ex.: está doente, sem transporte, médico indisponível…'
                  help='Obrigatório — o médico vê o motivo na agenda. A marcação fica no horário, a laranja, até ser retirada.'
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

      {/* Apontamento 05: pedido ao laboratório ligado à marcação */}
      {labFor && (
        <NewLabCaseModal
          open
          onClose={() => setLabFor(null)}
          clinics={rescheduleClinics.map(c => ({ id: c.id, name: c.name }))}
          doctors={
            rescheduleClinics.find(c => c.id === labFor.clinicId)?.doctors ?? []
          }
          labs={labOptions}
          lockedPatient={{ id: labFor.patientId, label: labFor.patientLabel }}
          linkedAppointment={{
            id: labFor.id,
            clinicId: labFor.clinicId,
            doctorId: labFor.doctorId,
            date: labFor.date,
            label: `${labFor.date.split('-').reverse().join('/')} · ${labFor.start} · ${labFor.treatmentName}`,
          }}
        />
      )}
    </>
  );
}
