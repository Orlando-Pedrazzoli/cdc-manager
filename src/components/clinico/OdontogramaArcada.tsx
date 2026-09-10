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

// --- Formas por tipo de dente (coords locais, coroa a apontar para +y) --------
// Posição no quadrante (último dígito FDI): 1–2 incisivos, 3 canino,
// 4–5 pré-molares, 6–8 molares. Paths desenhados à mão em caixa ~34×40.
function toothPath(fdi: string): { d: string; grooves: string | null } {
  const pos = Number(fdi[1]);
  if (pos <= 2) {
    // Incisivo: coroa em pá, bordo largo
    return {
      d: 'M-9,-20 C-11,-8 -11,8 -8,18 C-4,21 4,21 8,18 C11,8 11,-8 9,-20 C4,-23 -4,-23 -9,-20 Z',
      grooves: null,
    };
  }
  if (pos === 3) {
    // Canino: cúspide única
    return {
      d: 'M-8,-14 C-11,-4 -10,10 0,21 C10,10 11,-4 8,-14 C4,-19 -4,-19 -8,-14 Z',
      grooves: null,
    };
  }
  if (pos <= 5) {
    // Pré-molar: oval com sulco central
    return {
      d: 'M-11,-14 C-15,-4 -15,6 -11,14 C-5,19 5,19 11,14 C15,6 15,-4 11,-14 C5,-19 -5,-19 -11,-14 Z',
      grooves: 'M0,-11 C-2,-4 -2,4 0,11',
    };
  }
  // Molar: mais largo, sulcos em cruz
  return {
    d: 'M-15,-14 C-19,-5 -19,6 -15,14 C-7,19 7,19 15,14 C19,6 19,-5 15,-14 C7,-19 -7,-19 -15,-14 Z',
    grooves: 'M0,-12 C-2,-4 -2,4 0,12 M-12,0 C-4,-2 4,-2 12,0',
  };
}

// Cor de destaque do dente: estado marcado > primeira condição de face
function toothTint(t: ToothEntry): string | null {
  const mark = STATUS_MARK[t.status];
  if (mark) return mark.color;
  const c = t.faces[0]?.condition;
  return c ? CONDITION_COLOR[c] : null;
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
}: {
  entries: ToothEntry[];
  selected: string | null;
  onSelect: (toothNumber: string) => void;
}) {
  const byNumber = new Map(entries.map(t => [t.number, t]));
  const empty = (n: string): ToothEntry => ({
    number: n,
    status: 'present',
    faces: [],
    note: null,
  });

  const renderTooth = (fdi: string, index: number, arch: 'upper' | 'lower') => {
    const t = byNumber.get(fdi) ?? empty(fdi);
    const { x, y, rot, labelX, labelY } = place(index, 16, arch);
    const { d, grooves } = toothPath(fdi);
    const tint = toothTint(t);
    const mark = STATUS_MARK[t.status];
    const isMissing = t.status === 'missing';
    const isSelected = selected === fdi;

    return (
      <g
        key={fdi}
        onClick={() => onSelect(fdi)}
        style={{ cursor: 'pointer' }}
        role='button'
        aria-label={`Dente ${fdi}${mark ? ` — ${TOOTH_STATUS_LABEL[t.status]}` : ''}`}
      >
        <title>
          {`Dente ${fdi}${mark ? ` · ${TOOTH_STATUS_LABEL[t.status]}` : ''}`}
        </title>
        <g transform={`translate(${x},${y}) rotate(${rot})`}>
          <path
            d={d}
            fill={isMissing ? '#F4F6FB' : tint ? `${tint}22` : '#FFFFFF'}
            stroke={isSelected ? '#2743A6' : (tint ?? '#8A93AC')}
            strokeWidth={isSelected ? 3 : 1.6}
            strokeDasharray={isMissing ? '4 3' : undefined}
          />
          {grooves && !isMissing && (
            <path
              d={grooves}
              fill='none'
              stroke={tint ?? '#B8C0D4'}
              strokeWidth={1.2}
              strokeLinecap='round'
            />
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
          — clique num dente para abrir o detalhe
        </span>
      </p>
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
        {UPPER_TEETH.map((fdi, i) => renderTooth(fdi, i, 'upper'))}
        {LOWER_TEETH.map((fdi, i) => renderTooth(fdi, i, 'lower'))}
      </svg>
    </div>
  );
}
