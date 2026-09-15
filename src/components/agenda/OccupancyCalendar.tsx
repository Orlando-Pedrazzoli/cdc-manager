// 📄 src/components/agenda/OccupancyCalendar.tsx
// =============================================================================
// CDC Manager — Agenda: calendário mensal com cores de ocupação (Fase 4B, P4)
// -----------------------------------------------------------------------------
// "Calendário com cores para facilitar as marcações futuras" — o mini
// calendário lateral do Dentoral. Cada dia recebe a cor da taxa de ocupação
// (minutos marcados / minutos de horário dos médicos da clínica, ou do
// médico filtrado):
//   cinzento  fechado / sem médicos       verde   < 50 %
//   amarelo   50–85 %                     vermelho ≥ 85 %
// Server component: os dados vêm calculados da página. Navegação de mês por
// links (?cal=YYYY-MM); clicar num dia abre esse dia na agenda.
// =============================================================================

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface DayOccupancy {
  date: string; // YYYY-MM-DD
  ratio: number | null; // null = fechado
  booked: number; // nº de marcações
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function colorFor(ratio: number | null): { bg: string; fg: string } {
  if (ratio == null) return { bg: '#F1F3F8', fg: '#B0B6C6' };
  if (ratio >= 0.85) return { bg: '#F7D6D3', fg: '#8E1F19' };
  if (ratio >= 0.5) return { bg: '#FBEBC2', fg: '#7A5800' };
  return { bg: '#D7F0E1', fg: '#0F5C3A' };
}

export function OccupancyCalendar({
  month, // YYYY-MM
  days,
  selectedDate,
  todayStr,
  makeDayHref,
  makeMonthHref,
}: {
  month: string;
  days: DayOccupancy[];
  selectedDate: string;
  todayStr: string;
  makeDayHref: (date: string) => string;
  makeMonthHref: (month: string) => string;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Semana começa à segunda
  const lead = (first.getUTCDay() + 6) % 7;
  const byDate = new Map(days.map(d => [d.date, d]));
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const navBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid #D8DEEF',
    color: '#1B2A6B',
    backgroundColor: '#FFFFFF',
    textDecoration: 'none',
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '12px',
        padding: '10px 12px',
        width: 264,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <Link
          href={makeMonthHref(prev)}
          style={navBtn}
          aria-label='Mês anterior'
        >
          <ChevronLeft size={14} />
        </Link>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#1B2A6B',
            textTransform: 'capitalize',
          }}
        >
          {MONTHS[m - 1]} {y}
        </span>
        <Link
          href={makeMonthHref(next)}
          style={navBtn}
          aria-label='Mês seguinte'
        >
          <ChevronRight size={14} />
        </Link>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
        }}
      >
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
          <span
            key={i}
            style={{
              textAlign: 'center',
              fontSize: '10px',
              fontWeight: 700,
              color: '#9AA1B4',
            }}
          >
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const occ = byDate.get(date);
          const c = colorFor(occ?.ratio ?? null);
          const isSel = date === selectedDate;
          const isToday = date === todayStr;
          return (
            <Link
              key={date}
              href={makeDayHref(date)}
              title={
                occ?.ratio == null
                  ? 'Fechado / sem médicos'
                  : `${Math.round(occ.ratio * 100)}% ocupado · ${occ.booked} marcação(ões)`
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 28,
                borderRadius: 6,
                fontSize: '12px',
                fontWeight: isToday || isSel ? 800 : 600,
                backgroundColor: c.bg,
                color: c.fg,
                textDecoration: 'none',
                outline: isSel
                  ? '2px solid #2743A6'
                  : isToday
                    ? '1.5px dashed #2743A6'
                    : 'none',
                outlineOffset: -1,
              }}
            >
              {Number(date.slice(8, 10))}
            </Link>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 8,
          fontSize: '10px',
          color: '#6A7186',
          flexWrap: 'wrap',
        }}
      >
        {[
          ['#D7F0E1', 'livre'],
          ['#FBEBC2', 'meio'],
          ['#F7D6D3', 'cheio'],
          ['#F1F3F8', 'fechado'],
        ].map(([bg, l]) => (
          <span
            key={l}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: bg,
                display: 'inline-block',
              }}
            />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
