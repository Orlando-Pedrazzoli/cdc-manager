// 📄 src/components/clinico/OdontogramaArcada.tsx
// =============================================================================
// CDC Manager — Odontograma: vista anatómica de arcadas (SVG original)
// -----------------------------------------------------------------------------
// As duas arcadas (superior e inferior) em vista oclusal, com formas
// anatómicas simplificadas por tipo de dente (incisivo/canino/pré-molar/
// molar) e numeração FDI. NÃO é decoração: cada dente é pintado pelo
// ESTADO REAL do odontograma (ausente, implante, coroa, cárie…) e é
// clicável — seleciona o dente e abre o detalhe, exatamente como a grelha.
// Fonte única: recebe as MESMAS ToothEntry do componente Odontograma; a
// arcada e a grelha nunca divergem. Ilustração desenhada de raiz (paths
// próprios) — sem qualquer arte de terceiros.
//
// Geometria: dentes distribuídos ao longo de semi-elipses; cada dente
// roda para apontar radialmente para fora (coroa para o exterior da
// arcada), como nos diagramas clínicos.
// =============================================================================

'use client';

import {
  UPPER_TEETH,
  LOWER_TEETH,
  TOOTH_STATUS_LABEL,
  type FaceCondition,
  type ToothStatus,
} from '@/lib/domain';
import type { ToothEntry } from '@/components/clinico/ToothDetail';

/** Dentição decídua em notação FDI. O modelo já aceita estes 20 dentes. */
// Mesmas cores da grelha (inline SEMPRE — convenção do projeto)
const CONDITION_COLOR: Record<FaceCondition, string> = {
  caries: '#B3261E',
  restoration: '#2743A6',
  fracture: '#C2620A',
  sealant: '#0F7B4D',
  wear: '#7A4FB0',
};

const STATUS_MARK: Partial<
  Record<ToothStatus, { char: string; color: string }>
> = {
  missing: { char: '✕', color: '#9AA1B4' },
  implant: { char: 'I', color: '#0F7B4D' },
  crown: { char: 'C', color: '#2743A6' },
  'bridge-pontic': { char: 'P', color: '#7A4FB0' },
  'root-only': { char: 'R', color: '#C2620A' },
  'to-extract': { char: 'E', color: '#B3261E' },
};

// --- Silhuetas oclusais por grupo dentário ----------------------------------
function toothPath(fdi: string): { d: string; grooves: string | null; highlight: string } {
  const pos = Number(fdi[1]);
  const primary = ['5', '6', '7', '8'].includes(fdi[0]);
  const molar = primary ? pos >= 4 : pos >= 6;
  if (pos <= 2) {
    return {
      d: 'M-8,-21 C-12,-17 -12,-7 -10,2 C-10,10 -8,17 -4,20 C-1,22 1,22 4,20 C8,17 10,10 10,2 C12,-7 12,-17 8,-21 C4,-24 -4,-24 -8,-21 Z',
      grooves: 'M-5,-14 C-2,-17 2,-17 5,-14',
      highlight: 'M-5,-15 C-7,-5 -6,8 -3,15',
    };
  }
  if (pos === 3) {
    return {
      d: 'M-7,-18 C-4,-22 4,-22 7,-18 C11,-10 10,2 6,13 C4,18 1,23 0,24 C-1,23 -4,18 -6,13 C-10,2 -11,-10 -7,-18 Z',
      grooves: 'M-4,-12 C-2,-8 2,-8 4,-12',
      highlight: 'M-5,-13 C-7,-3 -4,8 -1,15',
    };
  }
  if (!molar) {
    return {
      d: 'M-10,-17 C-14,-12 -14,9 -9,16 C-5,22 5,22 9,16 C14,9 14,-12 10,-17 C5,-22 -5,-22 -10,-17 Z',
      grooves: 'M0,-14 C-4,-8 -3,-2 0,2 C3,6 4,10 0,15 M-7,-2 C-3,-5 3,-5 7,-2',
      highlight: 'M-7,-13 C-10,-5 -8,8 -4,14',
    };
  }
  return {
    d: 'M-13,-17 C-18,-12 -17,10 -12,17 C-7,23 7,23 12,17 C17,10 18,-12 13,-17 C7,-23 -7,-23 -13,-17 Z',
    grooves: 'M0,-17 C-4,-10 -4,-4 0,0 C4,4 4,10 0,17 M-12,0 C-6,-4 -3,-3 0,0 C3,3 7,4 12,0 M-8,-12 C-4,-8 -3,-4 0,0',
    highlight: 'M-9,-14 C-13,-5 -11,8 -6,14',
  };
}

// Ponto e rotação de um dente na semi-elipse
function place(
  index: number,
  total: number,
  arch: 'upper' | 'lower',
): { x: number; y: number; rot: number; labelX: number; labelY: number } {
  const cx = 360;
  const rx = 305;
  const ry = 158;
  const theta = Math.PI - ((index + 0.5) / total) * Math.PI; // 180°→0°
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  if (arch === 'upper') {
    const cy = 208;
    return {
      x: cx + rx * cos,
      y: cy - ry * sin,
      rot: 90 - (theta * 180) / Math.PI,
      labelX: cx + (rx + 34) * cos,
      labelY: cy - (ry + 30) * sin,
    };
  }
  const cy = 222;
  return {
    x: cx + rx * cos,
    y: cy + ry * sin,
    rot: 90 - (theta * 180) / Math.PI + 180,
    labelX: cx + (rx + 34) * cos,
    labelY: cy + (ry + 30) * sin,
  };
}

export function OdontogramaArcada({
  entries,
  selected,
  onSelect,
  plannedTeeth = new Set<string>(),
  dentition = 'permanent',
  onDentitionChange,
}: {
  entries: ToothEntry[];
  selected: string | null;
  onSelect: (toothNumber: string) => void;
  /** Fase 4C: dentes com tratamento PLANEADO (ponto âmbar) */
  plannedTeeth?: Set<string>;
  dentition?: 'permanent' | 'primary';
  onDentitionChange?: (value: 'permanent' | 'primary') => void;
}) {
  const upperTeeth = dentition === 'permanent' ? UPPER_TEETH : ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
  const lowerTeeth = dentition === 'permanent' ? LOWER_TEETH : ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];
  const byNumber = new Map(entries.map(t => [t.number, t]));
  const empty = (n: string): ToothEntry => ({
    number: n,
    status: 'present',
    faces: [],
    note: null,
  });

  const renderTooth = (fdi: string, index: number, total: number, arch: 'upper' | 'lower') => {
    const t = byNumber.get(fdi) ?? empty(fdi);
    const { x, y, rot, labelX, labelY } = place(index, total, arch);
    const { d, grooves, highlight } = toothPath(fdi);
    const mark = STATUS_MARK[t.status];
    const faceDots = t.faces.map(face => ({
      face: face.face,
      color: CONDITION_COLOR[face.condition],
    }));
    const isMissing = t.status === 'missing';
    const isSelected = selected === fdi;
    const isPlanned = plannedTeeth.has(fdi);

    return (
      <g
        key={fdi}
        onClick={() => onSelect(fdi)}
        style={{ cursor: 'pointer' }}
        role='button'
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`Dente ${fdi}${mark ? ` · ${TOOTH_STATUS_LABEL[t.status]}` : ''}${t.faces.length ? ` · ${t.faces.map(face => face.face + ' ' + face.condition).join(', ')}` : ''}${isPlanned ? ' · tratamento planeado' : ''}`}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(fdi);
          }
        }}
      >
        <title>
          {`Dente ${fdi}${mark ? ` · ${TOOTH_STATUS_LABEL[t.status]}` : ''}`}
        </title>
        <g transform={`translate(${x},${y}) rotate(${rot})`}>
          <defs>
            <linearGradient id={`tooth-enamel-${fdi}`} x1='0' y1='0' x2='1' y2='1'>
              <stop offset='0%' stopColor='#FFFFFF' />
              <stop offset='52%' stopColor='#F5F1E8' />
              <stop offset='100%' stopColor='#DCD5C6' />
            </linearGradient>
          </defs>
          <path
            d={d}
            fill={isMissing ? '#F4F6FB' : `url(#tooth-enamel-${fdi})`}
            stroke={isSelected ? '#2743A6' : '#AFA795'}
            strokeWidth={isSelected ? 2.8 : 1.35}
            strokeDasharray={isMissing ? '4 3' : undefined}
          />
          {!isMissing && <path d={highlight} fill='none' stroke='#FFFFFF' strokeWidth='2' strokeLinecap='round' opacity='.9' />}
          {grooves && !isMissing && (
            <path d={grooves} fill='none' stroke='#AFA795' strokeWidth={1.15} strokeLinecap='round' opacity='.9' />
          )}
          {!isMissing && faceDots.map((dot, dotIndex) => (
            <circle key={dot.face} cx={-7 + (dotIndex % 3) * 7} cy={-2 + Math.floor(dotIndex / 3) * 7} r='2.5' fill={dot.color} stroke='#FFFFFF' strokeWidth='.8'>
              <title>{dot.face}: {t.faces.find(face => face.face === dot.face)?.condition}</title>
            </circle>
          ))}
          {isPlanned && (
            <circle
              cx={0}
              cy={-22}
              r={4.5}
              fill='#E0A100'
              stroke='#FFFFFF'
              strokeWidth={1.5}
              transform={`rotate(${-rot})`}
            >
              <title>Tratamento planeado</title>
            </circle>
          )}
          {mark && (
            <text
              textAnchor='middle'
              dominantBaseline='central'
              transform={`rotate(${-rot})`}
              style={{
                fontSize: '13px',
                fontWeight: 800,
                fill: mark.color,
                userSelect: 'none',
              }}
            >
              {mark.char}
            </text>
          )}
        </g>
        <text
          x={labelX}
          y={labelY}
          textAnchor='middle'
          dominantBaseline='central'
          style={{
            fontSize: '11px',
            fontWeight: isSelected ? 800 : 600,
            fill: isSelected ? '#2743A6' : '#6A7186',
            userSelect: 'none',
          }}
        >
          {fdi}
        </text>
      </g>
    );
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '16px 20px 8px',
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontSize: '13px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        Arcadas
        <span
          style={{
            marginLeft: 8,
            fontSize: '12px',
            fontWeight: 500,
            color: '#6A7186',
          }}
        >
          · selecione um dente para abrir o detalhe
        </span>
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {onDentitionChange && (
          <div role='group' aria-label='Tipo de dentição' style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: '#F4F6FB' }}>
            {([
              ['permanent', 'Permanente'],
              ['primary', 'Decídua'],
            ] as const).map(([value, label]) => {
              const active = dentition === value;
              return (
                <button
                  key={value}
                  type='button'
                  aria-pressed={active}
                  onClick={() => onDentitionChange(value)}
                  style={{ border: active ? '1px solid #C9D6F5' : '1px solid transparent', borderRadius: 8, padding: '7px 12px', background: active ? '#FFFFFF' : 'transparent', color: active ? '#1B2A6B' : '#6A7186', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: active ? '0 1px 2px rgba(20,35,80,.08)' : 'none' }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        <span style={{ fontSize: 12, color: '#6A7186' }}>
          {dentition === 'permanent' ? '32 dentes · FDI 11–48' : '20 dentes · FDI 51–85'}
        </span>
      </div>
      <svg
        viewBox='0 0 720 430'
        role='img'
        aria-label='Vista das arcadas dentárias'
        style={{
          width: '100%',
          maxWidth: 760,
          display: 'block',
          margin: '0 auto',
        }}
      >
        <text
          x={360}
          y={200}
          textAnchor='middle'
          style={{ fontSize: '11px', fontWeight: 700, fill: '#B8C0D4' }}
        >
          SUPERIOR
        </text>
        <text
          x={360}
          y={238}
          textAnchor='middle'
          style={{ fontSize: '11px', fontWeight: 700, fill: '#B8C0D4' }}
        >
          INFERIOR
        </text>
        {upperTeeth.map((fdi, i) => renderTooth(fdi, i, upperTeeth.length, 'upper'))}
        {lowerTeeth.map((fdi, i) => renderTooth(fdi, i, lowerTeeth.length, 'lower'))}
      </svg>
    </div>
  );
}
