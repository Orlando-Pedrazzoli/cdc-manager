// 📄 src/components/agenda/DoctorDaysModal.tsx
// =============================================================================
// CDC Manager — Agenda: abrir, fechar ou repor dias da agenda de um médico
// -----------------------------------------------------------------------------
// Pedidos do Victor de 11/11/2026: (1) poder FECHAR ou reduzir um horário, não
// só abrir; (2) fazê-lo para VÁRIOS DIAS de uma vez. Substitui o antigo
// "Estender horário" (ExtendDayModal), que só sabia prolongar um dia.
//
// Um médico, um ou mais dias (calendário com seleção múltipla; clicar no dia
// da semana seleciona a coluna inteira), três ações:
//   · Abrir / definir horário — substitui a escala nesses dias (abre um dia
//     fechado, estende ou REDUZ um dia aberto)
//   · Fechar — o médico não atende nesses dias nesta clínica
//   · Repor a escala normal — desfaz o que foi aberto ou fechado à mão
// Convenção do projeto: visual crítico em inline style.
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  setDoctorDaysAction,
  type DoctorDaysMode,
} from '@/actions/doctor-days';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export interface DoctorDayOption {
  id: string;
  name: string;
  /** Horário no dia aberto na agenda ("09:00–16:00") ou null = fechado */
  hours: string | null;
  /** Tem um horário especial/fecho manual nesse dia */
  manual: boolean;
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const PRESETS: { label: string; from: string; until: string }[] = [
  { label: 'Manhã 09–16', from: '09:00', until: '16:00' },
  { label: 'Tarde 16–23', from: '16:00', until: '23:00' },
  { label: 'Dia todo 09–23', from: '09:00', until: '23:00' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Dias do mês numa grelha de semanas a começar à segunda (null = vazio) */
function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // segunda = 0
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(iso(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DoctorDaysButton({
  clinicId,
  date,
  today,
  doctors,
}: {
  clinicId: string;
  /** Dia aberto na agenda (YYYY-MM-DD) */
  date: string;
  /** Hoje em Lisboa (YYYY-MM-DD) — dias anteriores não se alteram */
  today: string;
  doctors: DoctorDayOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '');
  const [mode, setMode] = useState<DoctorDaysMode>('open');
  const [from, setFrom] = useState('09:00');
  const [until, setUntil] = useState('16:00');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(date >= today ? [date] : []),
  );
  const [view, setView] = useState(() => {
    const [y, m] = date.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const cells = useMemo(() => monthCells(view.year, view.month), [view]);
  const doctor = doctors.find(d => d.id === doctorId);
  const count = selected.size;

  const toggle = (d: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  /** Clicar no dia da semana: seleciona (ou limpa) a coluna inteira do mês */
  const toggleColumn = (col: number) => {
    const column = cells.filter(
      (c, i): c is string => !!c && i % 7 === col && c >= today,
    );
    if (column.length === 0) return;
    setSelected(prev => {
      const next = new Set(prev);
      const all = column.every(c => next.has(c));
      for (const c of column) {
        if (all) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  };

  const moveMonth = (delta: number) =>
    setView(v => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const openModal = () => {
    // Recomeça sempre no dia aberto na agenda
    const [y, m] = date.split('-').map(Number);
    setView({ year: y, month: m - 1 });
    setSelected(new Set(date >= today ? [date] : []));
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    const r = await setDoctorDaysAction({
      doctorId,
      clinicId,
      dates: [...selected],
      mode,
      from,
      until,
    });
    setBusy(false);
    if (r.error) {
      toast.error(r.error, { duration: 7000 });
      return;
    }
    const n = r.changed ?? 0;
    const dias = `${n} dia${n === 1 ? '' : 's'}`;
    toast.success(
      mode === 'open'
        ? `${dias}: agenda aberta ${from}–${until}.`
        : mode === 'close'
          ? `${dias}: agenda fechada.`
          : `${dias}: reposta a escala normal.`,
    );
    if (r.conflicts) {
      toast(
        `${r.conflicts} marcaç${r.conflicts === 1 ? 'ão ficou' : 'ões ficaram'} fora do horário — aparece${r.conflicts === 1 ? '' : 'm'} na agenda para remarcar.`,
        { icon: '⚠️', duration: 9000 },
      );
    }
    if (r.blockedByAbsence) {
      toast(
        `${r.blockedByAbsence} dia(s) continuam fechados: o médico tem férias/ausência registada na ficha.`,
        { icon: '⚠️', duration: 9000 },
      );
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        variant='outline'
        onClick={openModal}
        title='Abrir, fechar ou repor a agenda de um médico — num dia ou em vários de uma vez'
      >
        <CalendarClock size={15} style={{ marginRight: 6 }} />
        Abrir / fechar dias
      </Button>

      <Modal
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title='Abrir ou fechar a agenda de um médico'
        maxWidth={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label='Médico'
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
            help={
              doctor
                ? `No dia aberto na agenda: ${doctor.hours ?? 'fechado'}${doctor.manual ? ' (alterado à mão)' : ''}.`
                : undefined
            }
          >
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.hours ?? 'fechado'}
              </option>
            ))}
          </Select>

          {/* Calendário com seleção múltipla */}
          <div
            style={{
              border: '1px solid #EEF1F8',
              borderRadius: '12px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <button type='button' onClick={() => moveMonth(-1)} aria-label='Mês anterior' style={navBtn}>
                <ChevronLeft size={16} />
              </button>
              <strong style={{ fontSize: '14px', color: '#1B2A6B' }}>
                {MONTHS[view.month]} {view.year}
              </strong>
              <button type='button' onClick={() => moveMonth(1)} aria-label='Mês seguinte' style={navBtn}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {WEEKDAYS.map((w, col) => (
                <button
                  key={w}
                  type='button'
                  onClick={() => toggleColumn(col)}
                  title={`Selecionar todas as ${w} deste mês`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '4px 0',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#2743A6',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {w}
                </button>
              ))}
              {cells.map((c, i) => {
                if (!c) return <span key={`e${i}`} />;
                const past = c < today;
                const on = selected.has(c);
                return (
                  <button
                    key={c}
                    type='button'
                    disabled={past}
                    onClick={() => toggle(c)}
                    aria-pressed={on}
                    style={{
                      height: 34,
                      borderRadius: '8px',
                      border: on
                        ? '1px solid #1B2A6B'
                        : c === date
                          ? '1px solid #9FB1E8'
                          : '1px solid #EEF1F8',
                      backgroundColor: on ? '#1B2A6B' : '#FFFFFF',
                      color: on ? '#FFFFFF' : past ? '#C4C9D6' : '#1C2233',
                      fontSize: '13px',
                      fontWeight: on ? 700 : 500,
                      cursor: past ? 'default' : 'pointer',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Number(c.slice(8))}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                fontSize: '12px',
                color: '#6A7186',
              }}
            >
              <span>
                <strong style={{ color: '#1B2A6B' }}>{count}</strong> dia
                {count === 1 ? '' : 's'} selecionado{count === 1 ? '' : 's'} · clique no dia
                da semana para a coluna inteira
              </span>
              {count > 0 && (
                <button
                  type='button'
                  onClick={() => setSelected(new Set())}
                  style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, color: '#2743A6' }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Ação */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['open', 'Abrir / definir horário'],
                ['close', 'Fechar'],
                ['reset', 'Repor a escala normal'],
              ] as [DoctorDaysMode, string][]
            ).map(([value, label]) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type='button'
                  onClick={() => setMode(value)}
                  aria-pressed={active}
                  style={{
                    borderRadius: '10px',
                    border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#3A3F4A',
                    padding: '8px 14px',
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

          {mode === 'open' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    type='button'
                    onClick={() => {
                      setFrom(p.from);
                      setUntil(p.until);
                    }}
                    style={{
                      borderRadius: '999px',
                      border: '1px solid #D8DEEF',
                      backgroundColor:
                        from === p.from && until === p.until ? '#E8EEFF' : '#FFFFFF',
                      color: '#1B2A6B',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input type='time' label='Das' value={from} onChange={e => setFrom(e.target.value)} step={300} />
                <Input type='time' label='Às' value={until} onChange={e => setUntil(e.target.value)} step={300} />
              </div>
            </div>
          )}

          <p style={{ margin: 0, fontSize: '12px', color: '#6A7186', lineHeight: 1.5 }}>
            {mode === 'open'
              ? 'Nos dias escolhidos o médico atende neste horário, em vez do da escala. Serve para abrir um dia fechado, estender ou reduzir um dia aberto.'
              : mode === 'close'
                ? 'Nos dias escolhidos a agenda do médico fica fechada nesta clínica. As marcações que já existirem não são apagadas: ficam à vista para remarcar.'
                : 'Desfaz o que foi aberto ou fechado à mão: os dias escolhidos voltam a seguir a escala normal do médico.'}{' '}
            Só nesta clínica.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant='secondary' disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={!doctorId || count === 0} onClick={submit}>
              {mode === 'open' ? 'Abrir' : mode === 'close' ? 'Fechar' : 'Repor'} {count} dia
              {count === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const navBtn: React.CSSProperties = {
  display: 'inline-flex',
  padding: 6,
  borderRadius: 8,
  border: '1px solid #EEF1F8',
  background: '#FFFFFF',
  color: '#1B2A6B',
  cursor: 'pointer',
};
