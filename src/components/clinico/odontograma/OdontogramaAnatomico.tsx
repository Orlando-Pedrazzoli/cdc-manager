// 📄 src/components/clinico/odontograma/OdontogramaAnatomico.tsx
// =============================================================================
// CDC Manager — Odontograma: vista ANATÓMICA (um único SVG)
// -----------------------------------------------------------------------------
// As duas arcadas com dentes de anatomia real (silhueta, n.º de raízes e
// proporções medidas), em três filas por arcada, como no Dentoral:
//   · VESTIBULAR — dente inteiro (coroa + raiz): é aqui que se vê endodontia,
//                  espigão, implante, coroa, resto radicular, ausência
//   · OCLUSAL    — face de mastigação (incisal nos anteriores), com as 5 faces
//   · FACES      — a grelha de 5 faces que os médicos já conhecem
//
// NÃO tem dados próprios: recebe o MESMO `ToothChartState` derivado
// (lib/odontogram-chart) que a vista em esquema, e pinta com as MESMAS cores
// de camada — existente (verde), executado (azul), planeado (laranja,
// tracejado). As duas vistas nunca divergem.
//
// Arte: tooth-art.generated.ts (derivada de React Advanced Odontogram, MIT).
// Os templates existem para os quadrantes 1 e 3; o 2 e o 4 são espelho, e a
// arcada inferior é invertida na vertical. Vista incisal dos anteriores e o
// implante são desenhados aqui (não existem na arte de origem).
// =============================================================================

'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  UPPER_TEETH,
  LOWER_TEETH,
  UPPER_PRIMARY_TEETH,
  LOWER_PRIMARY_TEETH,
  TOOTH_STATUS_LABEL,
  type Dentition,
} from '@/lib/domain';
import type {
  ChartLayer,
  ToothChartState,
  ToothFaceKey,
} from '@/lib/odontogram-chart';
import {
  EMPTY_STATE,
  FACE_PATHS,
  FINDING_COLOR,
  LAYER_COLOR,
  LAYER_LABEL,
  STATUS_CHAR,
  faceStyle,
  visualFaceMap,
} from '@/components/clinico/odontograma/chart-style';
import { SIDE_ART, OCCLUSAL_ART } from '@/components/clinico/odontograma/tooth-art.generated';
import type { ArtShape, SideArt } from '@/components/clinico/odontograma/tooth-art.types';

// --- Geometria do quadro (unidades do SVG = unidades dos templates) ----------
const COL = 46; // largura de cada coluna de dente
const MID_GAP = 12; // folga na linha média
const PAD_L = 28; // margem esquerda (rótulos das filas)
const PAD_R = 10;
const WIDTH = PAD_L + 16 * COL + MID_GAP + PAD_R;
const HEIGHT = 394;

const ROW = {
  upperNumber: 12,
  upperSideEdge: 108, // bordo oclusal dos dentes superiores
  upperOcclusal: 132, // centro da fila oclusal
  upperGrid: 158, // topo da grelha (30 de altura)
  separator: 198,
  lowerGrid: 208,
  lowerOcclusal: 264,
  lowerSideEdge: 288, // bordo oclusal dos dentes inferiores
  lowerNumber: 388,
} as const;
const GRID = 30;

// --- Paleta do dente -----------------------------------------------------------
const TOOTH_OUTLINE = '#A4ABBD';
const ENAMEL = '#FBFBF7';
const ROOT = '#EBDDBC';
const ROOT_APEX = '#DCCBA2';
const GROOVE = '#9C9A8F';
const GHOST = '#C7CEE0';

type Paint = {
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
};

/** Pintura de TRABALHO (coroa, faceta, restauração…) pela camada */
function workPaint(layer: ChartLayer): Paint {
  const color = LAYER_COLOR[layer];
  if (layer === 'planned')
    return { fill: color, fillOpacity: 0.2, stroke: color, strokeWidth: 1.3, dash: '2.6 1.8' };
  return { fill: color, fillOpacity: 0.88, stroke: color, strokeWidth: 0.6 };
}

/** Coroa / faceta / pôntico: translúcido, para a anatomia continuar visível */
function coverPaint(layer: ChartLayer): Paint {
  const p = workPaint(layer);
  return layer === 'planned' ? p : { ...p, fillOpacity: 0.7, strokeWidth: 0.9 };
}

/** Pintura de uma FACE: achado tem cor própria; trabalho tem a cor da camada */
function facePaint(f: NonNullable<ToothChartState['faces'][ToothFaceKey]>): Paint {
  const finding = FINDING_COLOR[f.condition];
  if (finding) return { fill: finding, fillOpacity: 0.92, stroke: finding, strokeWidth: 0.6 };
  const p = workPaint(f.layer);
  if (f.condition === 'sealant' && f.layer !== 'planned') return { ...p, fillOpacity: 0.55 };
  return p;
}

const isHighlight = (f: string) => /^#f[ef]/i.test(f);

/** Desenha uma lista de formas da arte; com `paint`, recolore-as */
function Shapes({ shapes, paint }: { shapes: ArtShape[]; paint?: Paint }) {
  return (
    <>
      {shapes.map((s, i) => {
        let fill = s.f;
        let fillOpacity: number | undefined = s.o;
        let stroke = s.s;
        let strokeWidth = s.w;
        let dash: string | undefined;
        if (paint) {
          if (isHighlight(s.f)) {
            // brilho da lesão/restauração: mantém-se branco, discreto
            fill = '#FFFFFF';
            fillOpacity = 0.45;
            stroke = undefined;
          } else if (s.f === 'none') {
            // forma só de traço (ex.: selante na vista oclusal)
            stroke = paint.fill;
            dash = paint.dash;
          } else {
            fill = paint.fill;
            fillOpacity = paint.fillOpacity;
            stroke = paint.stroke;
            strokeWidth = paint.strokeWidth;
            dash = paint.dash;
          }
        }
        const common = {
          fill,
          fillOpacity,
          stroke: stroke ?? 'none',
          strokeWidth: stroke ? strokeWidth : undefined,
          strokeDasharray: dash,
          strokeLinejoin: 'round' as const,
        };
        return s.c ? (
          <circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} {...common} />
        ) : (
          <path key={i} d={s.d} {...common} />
        );
      })}
    </>
  );
}

// --- Orientação por quadrante ---------------------------------------------------
// 7.ª ronda/B6: dentição decídua (quadrantes 5–8). A arte de origem só tem
// dentes definitivos; os de leite usam a silhueta do definitivo equivalente:
// incisivos e canino iguais, e os dois molares de leite (posições 4 e 5)
// desenham-se como 1.º e 2.º molar.
const PRIMARY_POSITION: Record<string, string> = { '1': '1', '2': '2', '3': '3', '4': '6', '5': '7' };

function orient(n: string): { upper: boolean; mirror: boolean; template: string } {
  const q = n[0];
  const primary = q >= '5';
  const upper = q === '1' || q === '2' || q === '5' || q === '6';
  return {
    upper,
    // espelho em x (mesial para a linha média)
    mirror: q === '2' || q === '3' || q === '6' || q === '7',
    template: `${upper ? '1' : '3'}${primary ? (PRIMARY_POSITION[n[1]] ?? n[1]) : n[1]}`,
  };
}

function columnX(index: number): number {
  return PAD_L + index * COL + (index >= 8 ? MID_GAP : 0);
}

/** Cruz (dente a extrair / ausente) */
function Cross({ x1, y1, x2, y2, color, width }: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }) {
  return (
    <g stroke={color} strokeWidth={width} strokeLinecap='round' opacity={0.92}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1} y1={y2} x2={x2} y2={y1} />
    </g>
  );
}

/** Implante (desenhado aqui): corpo cónico roscado + pilar */
function Implant({ art, color }: { art: SideArt; color: string }) {
  const [l, r, platform] = art.implant;
  const w = r - l;
  const apex = art.vb[1] + 12;
  const taper = w * 0.22;
  const threads: ReactNode[] = [];
  for (let y = platform - 5; y > apex + 5; y -= 4.6) {
    const t = (platform - y) / (platform - apex);
    threads.push(
      <line key={y} x1={l + taper * t - 0.8} y1={y + 1.1} x2={r - taper * t + 0.8} y2={y - 1.1} />,
    );
  }
  return (
    <g>
      <path
        d={`M${l + w * 0.2},${platform} L${r - w * 0.2},${platform} L${r - w * 0.3},${platform + 7} L${l + w * 0.3},${platform + 7} Z`}
        fill='#8B95A1'
        stroke='#5E6873'
        strokeWidth={0.5}
      />
      <path
        d={`M${l},${platform} L${r},${platform} L${r - taper},${apex} Q${(l + r) / 2},${apex - 5} ${l + taper},${apex} Z`}
        fill='#C3CAD1'
        stroke={color}
        strokeWidth={1.1}
        strokeLinejoin='round'
      />
      <g stroke={color} strokeWidth={0.9} strokeLinecap='round' opacity={0.85}>
        {threads}
      </g>
    </g>
  );
}

// --- Vista VESTIBULAR -----------------------------------------------------------
function SideTooth({ state, uid }: { state: ToothChartState; uid: string }) {
  const { template } = orient(state.number);
  const art = SIDE_ART[template];
  const bodyFill = `url(#${uid}-root-${template})`;
  const volume = `url(#${uid}-volume)`;
  const [cl, cr] = art.crown;
  const top = art.vb[1];
  const bottom = art.vb[1] + art.vb[3];
  const layer = state.statusLayer ?? 'existing';
  const color = LAYER_COLOR[layer];
  const status = state.status;

  const body = (shapes: ArtShape[]) => (
    <>
      {shapes.map((s, i) => (
        <g key={i}>
          <path d={s.d} fill={bodyFill} stroke={TOOTH_OUTLINE} strokeWidth={0.9} strokeLinejoin='round' />
          <path d={s.d} fill={volume} />
        </g>
      ))}
    </>
  );
  const neutralCrown = (
    <>
      {art.crownShape.map((s, i) => (
        <g key={i}>
          <path d={s.d} fill={ENAMEL} stroke={TOOTH_OUTLINE} strokeWidth={0.9} strokeLinejoin='round' />
          <path d={s.d} fill={volume} />
        </g>
      ))}
    </>
  );

  if (status === 'missing') {
    return (
      <g>
        <g opacity={0.75}>
          {art.body.map((s, i) => (
            <path key={i} d={s.d} fill='none' stroke={GHOST} strokeWidth={0.9} strokeDasharray='2.2 2' />
          ))}
        </g>
        <Cross x1={cl + 5} y1={art.cejY + 5} x2={cr - 5} y2={bottom - 5} color={color} width={2} />
      </g>
    );
  }

  if (status === 'bridge-pontic') {
    return (
      <g>
        <Shapes shapes={art.connector} paint={coverPaint(layer)} />
        <Shapes shapes={art.crownShape} paint={coverPaint(layer)} />
      </g>
    );
  }

  if (status === 'implant') {
    return (
      <g>
        <Implant art={art} color={color} />
        {neutralCrown}
      </g>
    );
  }

  const faces = (['V', 'M', 'D', 'O'] as ToothFaceKey[]).map(face => {
    const f = state.faces[face];
    if (!f) return null;
    const paint = facePaint(f);
    if (f.condition === 'caries' && art.caries[face])
      return <Shapes key={face} shapes={art.caries[face]!} paint={paint} />;
    if (f.condition === 'sealant' && face === 'O' && art.seal)
      return <Shapes key={face} shapes={art.seal} paint={paint} />;
    const region = art.face[face];
    return region ? <Shapes key={face} shapes={region} paint={paint} /> : null;
  });

  return (
    <g>
      {status === 'root-only' ? body(art.radix) : body(art.body)}
      {status !== 'root-only' && <Shapes shapes={art.highlight} />}
      {state.endo && (
        <Shapes
          shapes={art.endo}
          paint={{ fill: LAYER_COLOR[state.endo], fillOpacity: state.endo === 'planned' ? 0.35 : 0.95 }}
        />
      )}
      {state.post && (
        <Shapes
          shapes={art.post}
          paint={{ fill: '#3D4257', fillOpacity: state.post === 'planned' ? 0.45 : 1, stroke: LAYER_COLOR[state.post], strokeWidth: 0.7 }}
        />
      )}
      {status !== 'root-only' && faces}
      {state.veneer && <Shapes shapes={art.veneer} paint={coverPaint(state.veneer)} />}
      {status === 'crown' && <Shapes shapes={art.crownShape} paint={coverPaint(layer)} />}
      {status === 'to-extract' && (
        <Cross x1={cl + 1} y1={top + 9} x2={cr - 1} y2={bottom - 4} color={color} width={2.6} />
      )}
    </g>
  );
}

// --- Vista OCLUSAL (pré-molares e molares: arte; anteriores: incisal) ---------

/** Proporção profundidade/largura da coroa em vista incisal */
function incisalDepthRatio(n: string, upper: boolean): number {
  const pos = n[1];
  if (upper) return pos === '1' ? 0.8 : pos === '2' ? 0.9 : 1.02;
  return pos === '3' ? 1.02 : 1.1;
}

function IncisalTooth({ state, uid }: { state: ToothChartState; uid: string }) {
  const { upper, template } = orient(state.number);
  const side = SIDE_ART[template];
  const a = ((side.crown[1] - side.crown[0]) / 2) * 0.94;
  const b = Math.min(17, a * incisalDepthRatio(state.number, upper));
  const canine = state.number[1] === '3';
  // contorno: vestibular (convexa) em cima, cíngulo (lingual) em baixo; mesial à direita
  const outline = `M${-a},${-0.3 * b} C${-a},${-1.12 * b} ${a},${-1.12 * b} ${a},${-0.3 * b} C${a},${0.55 * b} ${0.5 * a},${b} 0,${b} C${-0.5 * a},${b} ${-a},${0.55 * b} ${-a},${-0.3 * b} Z`;
  const clipId = `${uid}-incisal-${state.number}`;
  const layer = state.statusLayer ?? 'existing';
  const color = LAYER_COLOR[layer];
  const status = state.status;

  if (status === 'missing' || status === 'root-only') {
    return (
      <g>
        <path d={outline} fill='none' stroke={GHOST} strokeWidth={0.9} strokeDasharray='2.2 2' opacity={0.75} />
        {status === 'root-only' && <ellipse cx={0} cy={0} rx={a * 0.42} ry={b * 0.42} fill={ROOT} stroke={TOOTH_OUTLINE} strokeWidth={0.8} />}
      </g>
    );
  }
  if (status === 'crown' || status === 'bridge-pontic') {
    const p = coverPaint(layer);
    return <path d={outline} fill={p.fill} fillOpacity={p.fillOpacity} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeDasharray={p.dash} />;
  }

  const regions: Record<ToothFaceKey, [number, number, number, number]> = {
    V: [-a, -1.2 * b, 2 * a, 0.72 * b],
    L: [-a, 0.46 * b, 2 * a, 0.6 * b],
    M: [0.46 * a, -0.48 * b, 0.6 * a, 0.94 * b],
    D: [-1.06 * a, -0.48 * b, 0.6 * a, 0.94 * b],
    O: [-0.46 * a, -0.48 * b, 0.92 * a, 0.94 * b],
  };

  return (
    <g>
      <clipPath id={clipId}>
        <path d={outline} />
      </clipPath>
      <path d={outline} fill={`url(#${uid}-occlusal)`} stroke={TOOTH_OUTLINE} strokeWidth={0.9} />
      <g clipPath={`url(#${clipId})`}>
        {(Object.keys(regions) as ToothFaceKey[]).map(face => {
          const f = state.faces[face];
          if (!f) return null;
          const p = facePaint(f);
          const [x, y, w, h] = regions[face];
          return <rect key={face} x={x} y={y} width={w} height={h} fill={p.fill} fillOpacity={p.fillOpacity} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeDasharray={p.dash} />;
        })}
        {state.veneer && (() => {
          const p = coverPaint(state.veneer);
          return <rect x={-a} y={-1.2 * b} width={2 * a} height={0.5 * b} fill={p.fill} fillOpacity={p.fillOpacity} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeDasharray={p.dash} />;
        })()}
      </g>
      {/* bordo incisal (cúspide no canino) */}
      {canine ? (
        <path d={`M${-0.7 * a},${-0.2 * b} L0,${-0.42 * b} L${0.7 * a},${-0.2 * b}`} fill='none' stroke={GROOVE} strokeWidth={0.7} strokeLinecap='round' strokeLinejoin='round' />
      ) : (
        <path d={`M${-0.78 * a},${-0.3 * b} Q0,${-0.42 * b} ${0.78 * a},${-0.3 * b}`} fill='none' stroke={GROOVE} strokeWidth={0.7} strokeLinecap='round' />
      )}
      {status === 'implant' && <circle cx={0} cy={0.1 * b} r={Math.min(a, b) * 0.36} fill='#C3CAD1' stroke={color} strokeWidth={1.1} />}
      {status === 'to-extract' && <Cross x1={-a} y1={-b} x2={a} y2={b} color={color} width={2.2} />}
    </g>
  );
}

function OcclusalTooth({ state, uid }: { state: ToothChartState; uid: string }) {
  const { template } = orient(state.number);
  const art = OCCLUSAL_ART[template];
  const layer = state.statusLayer ?? 'existing';
  const color = LAYER_COLOR[layer];
  const status = state.status;
  const outline = art.body[0];
  const cx = (art.crown[0] + art.crown[1]) / 2;
  const cy = art.vb[1] + art.vb[3] / 2;

  if (status === 'missing' || status === 'root-only') {
    return (
      <g>
        <path d={outline.d} fill='none' stroke={GHOST} strokeWidth={0.9} strokeDasharray='2.2 2' opacity={0.75} />
        {status === 'root-only' && <ellipse cx={cx} cy={cy} rx={8} ry={6.5} fill={ROOT} stroke={TOOTH_OUTLINE} strokeWidth={0.8} />}
      </g>
    );
  }
  if (status === 'crown' || status === 'bridge-pontic') {
    return <Shapes shapes={art.crownShape} paint={coverPaint(layer)} />;
  }

  return (
    <g>
      {art.body.map((s, i) =>
        s.f === 'body' ? (
          <path key={i} d={s.d} fill={`url(#${uid}-occlusal)`} stroke={TOOTH_OUTLINE} strokeWidth={0.9} strokeLinejoin='round' />
        ) : s.f === 'none' ? (
          <path key={i} d={s.d} fill='none' stroke={GROOVE} strokeWidth={0.7} strokeLinecap='round' strokeLinejoin='round' />
        ) : (
          <path key={i} d={s.d} fill='#FFFFFF' fillOpacity={0.75} />
        ),
      )}
      {(['V', 'L', 'M', 'D', 'O'] as ToothFaceKey[]).map(face => {
        const f = state.faces[face];
        if (!f) return null;
        const paint = facePaint(f);
        if (f.condition === 'caries' && art.caries[face])
          return <Shapes key={face} shapes={art.caries[face]!} paint={paint} />;
        if (f.condition === 'sealant' && face === 'O' && art.seal)
          return <Shapes key={face} shapes={art.seal} paint={paint} />;
        const region = art.face[face];
        return region ? <Shapes key={face} shapes={region} paint={paint} /> : null;
      })}
      {state.veneer && <Shapes shapes={art.veneer} paint={coverPaint(state.veneer)} />}
      {status === 'implant' && <circle cx={cx} cy={cy} r={6.5} fill='#C3CAD1' stroke={color} strokeWidth={1.1} />}
      {status === 'to-extract' && (
        <Cross x1={art.crown[0] + 2} y1={art.vb[1] + 5} x2={art.crown[1] - 2} y2={art.vb[1] + art.vb[3] - 5} color={color} width={2.2} />
      )}
    </g>
  );
}

// --- Grelha de 5 faces (igual à vista em esquema) -------------------------------
function FaceGrid({ state, note }: { state: ToothChartState; note: string | null }) {
  const map = visualFaceMap(state.number);
  const mark = STATUS_CHAR[state.status];
  const markColor = state.statusLayer ? LAYER_COLOR[state.statusLayer] : '#9AA1B4';
  const dimmed = state.status === 'missing';
  const center = faceStyle(state.faces.O);
  return (
    <g>
      <g opacity={dimmed ? 0.35 : 1}>
        {(['top', 'bottom', 'left', 'right'] as const).map(pos => {
          const st = faceStyle(state.faces[map[pos]]);
          return <path key={pos} d={FACE_PATHS[pos]} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} />;
        })}
        <rect x={13} y={13} width={14} height={14} fill={center.fill} stroke={center.stroke} strokeWidth={center.strokeWidth} strokeDasharray={center.dash} />
      </g>
      {mark && (
        <text
          x={20}
          y={20}
          textAnchor='middle'
          dominantBaseline='central'
          fontSize={state.status === 'missing' ? 22 : 15}
          fontWeight={800}
          fill={markColor}
          stroke='#FFFFFF'
          strokeWidth={state.status === 'missing' ? 0 : 2}
          paintOrder='stroke'
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {mark}
        </text>
      )}
      {note && <circle cx={35} cy={5} r={3.5} fill='#C2620A' />}
    </g>
  );
}

// --- Componente ---------------------------------------------------------------
export function OdontogramaAnatomico({
  states,
  notes,
  selected,
  onSelect,
  dentition = 'permanent',
}: {
  states: Map<string, ToothChartState>;
  notes: Map<string, string | null>;
  selected: string | null;
  onSelect: (toothNumber: string) => void;
  /** 7.ª ronda/B6: definitiva (32 dentes) ou decídua (20 dentes de leite) */
  dentition?: Dentition;
}) {
  const primary = dentition === 'primary';
  const upperTeeth: readonly string[] = primary ? UPPER_PRIMARY_TEETH : UPPER_TEETH;
  const lowerTeeth: readonly string[] = primary ? LOWER_PRIMARY_TEETH : LOWER_TEETH;
  // 10 dentes por arcada em vez de 16: 3 colunas livres de cada lado, com a
  // linha média no mesmo sítio
  const colShift = primary ? 3 : 0;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [hovered, setHovered] = useState<string | null>(null);

  const renderTooth = (n: string, index: number) => {
    const state = states.get(n) ?? EMPTY_STATE(n);
    const note = notes.get(n) ?? null;
    const { upper, mirror, template } = orient(n);
    const x0 = columnX(index + colShift);
    const cx = x0 + COL / 2;
    const sx = mirror ? -1 : 1;
    const isSelected = selected === n;
    const mark = STATUS_CHAR[state.status];

    // vestibular: centra a coroa na coluna e encosta o bordo oclusal à fila
    const side = SIDE_ART[template];
    const sideCx = (side.crown[0] + side.crown[1]) / 2;
    const sideBottom = side.vb[1] + side.vb[3];
    const sideTransform = upper
      ? `translate(${cx - sx * sideCx} ${ROW.upperSideEdge - sideBottom}) scale(${sx} 1)`
      : `translate(${cx - sx * sideCx} ${ROW.lowerSideEdge + sideBottom}) scale(${sx} -1)`;

    // oclusal: arte nos posteriores, incisal desenhada nos anteriores
    const occlusal = OCCLUSAL_ART[template];
    const rowMid = upper ? ROW.upperOcclusal : ROW.lowerOcclusal;
    let occlusalNode: ReactNode;
    if (occlusal) {
      const oCx = (occlusal.crown[0] + occlusal.crown[1]) / 2;
      const oCy = occlusal.vb[1] + occlusal.vb[3] / 2;
      const t = upper
        ? `translate(${cx - sx * oCx} ${rowMid - oCy}) scale(${sx} 1)`
        : `translate(${cx - sx * oCx} ${rowMid + oCy}) scale(${sx} -1)`;
      occlusalNode = (
        <g transform={t}>
          <OcclusalTooth state={state} uid={uid} />
        </g>
      );
    } else {
      occlusalNode = (
        <g transform={`translate(${cx} ${rowMid}) scale(${sx} ${upper ? 1 : -1})`}>
          <IncisalTooth state={state} uid={uid} />
        </g>
      );
    }

    const blockTop = upper ? 1 : ROW.separator + 5;
    const blockHeight = upper ? ROW.separator - 6 : HEIGHT - ROW.separator - 6;
    const gridTop = upper ? ROW.upperGrid : ROW.lowerGrid;
    const title = [
      `Dente ${n}`,
      mark ? TOOTH_STATUS_LABEL[state.status] : null,
      state.endo ? `Endodontia (${LAYER_LABEL[state.endo]})` : null,
      state.post ? 'Espigão' : null,
      state.veneer ? 'Faceta' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const onKey = (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(n);
      }
    };

    return (
      <g
        key={n}
        role='button'
        tabIndex={0}
        aria-label={title}
        aria-pressed={isSelected}
        onClick={() => onSelect(n)}
        onKeyDown={onKey}
        onMouseEnter={() => setHovered(n)}
        onMouseLeave={() => setHovered(h => (h === n ? null : h))}
        style={{ cursor: 'pointer', outline: 'none' }}
      >
        <title>{title}</title>
        <rect
          x={x0 + 0.75}
          y={blockTop}
          width={COL - 1.5}
          height={blockHeight}
          rx={6}
          fill={isSelected ? '#EEF2FF' : hovered === n ? '#F6F8FD' : '#FFFFFF'}
          fillOpacity={isSelected || hovered === n ? 1 : 0}
          stroke={isSelected ? '#2743A6' : 'none'}
          strokeWidth={1.5}
        />
        <text
          x={cx}
          y={upper ? ROW.upperNumber : ROW.lowerNumber}
          textAnchor='middle'
          fontSize={10.5}
          fontWeight={isSelected ? 800 : 700}
          fill={isSelected ? '#2743A6' : '#6A7186'}
          style={{ userSelect: 'none' }}
        >
          {n}
        </text>
        <g transform={sideTransform}>
          <SideTooth state={state} uid={uid} />
        </g>
        {occlusalNode}
        <g transform={`translate(${cx - GRID / 2} ${gridTop}) scale(${GRID / 40})`}>
          <FaceGrid state={state} note={note} />
        </g>
      </g>
    );
  };

  const rowLabel = (text: string, y: number) => (
    <text
      key={`${text}-${y}`}
      transform={`translate(11 ${y}) rotate(-90)`}
      textAnchor='middle'
      fontSize={7.5}
      fontWeight={700}
      letterSpacing={0.5}
      fill='#9AA1B4'
      style={{ textTransform: 'uppercase', userSelect: 'none' }}
    >
      {text}
    </text>
  );

  const midX = PAD_L + 8 * COL + MID_GAP / 2;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role='group'
      aria-label={primary ? 'Odontograma anatómico — dentição decídua' : 'Odontograma anatómico'}
      style={{ width: '100%', minWidth: 720, maxWidth: 1120, display: 'block', margin: '0 auto' }}
    >
      <defs>
        {/* raiz (marfim) → coroa (esmalte), por template, cortado na JAC */}
        {Object.entries(SIDE_ART).map(([key, art]) => {
          const [, y0, , h] = art.vb;
          const at = (y: number) => Math.min(1, Math.max(0, (y - y0) / h));
          return (
            <linearGradient key={key} id={`${uid}-root-${key}`} gradientUnits='userSpaceOnUse' x1={0} y1={y0} x2={0} y2={y0 + h}>
              <stop offset={0} stopColor={ROOT_APEX} />
              <stop offset={at(art.cejY - 6)} stopColor={ROOT} />
              <stop offset={at(art.cejY + 3)} stopColor={ENAMEL} />
              <stop offset={1} stopColor='#FFFFFF' />
            </linearGradient>
          );
        })}
        {/* volume: sombra nas arestas, luz ao centro */}
        <linearGradient id={`${uid}-volume`} x1={0} y1={0} x2={1} y2={0}>
          <stop offset={0} stopColor='#3D4257' stopOpacity={0.24} />
          <stop offset={0.3} stopColor='#3D4257' stopOpacity={0.03} />
          <stop offset={0.52} stopColor='#FFFFFF' stopOpacity={0.28} />
          <stop offset={0.74} stopColor='#3D4257' stopOpacity={0.04} />
          <stop offset={1} stopColor='#3D4257' stopOpacity={0.28} />
        </linearGradient>
        <radialGradient id={`${uid}-occlusal`} cx={0.5} cy={0.5} r={0.62}>
          <stop offset={0} stopColor='#FFFFFF' />
          <stop offset={0.6} stopColor='#F4F2EA' />
          <stop offset={1} stopColor='#DDD9CB' />
        </radialGradient>
      </defs>

      {rowLabel('Vestibular', 62)}
      {rowLabel('Oclusal', ROW.upperOcclusal)}
      {rowLabel('Faces', ROW.upperGrid + GRID / 2)}
      {rowLabel('Faces', ROW.lowerGrid + GRID / 2)}
      {rowLabel('Oclusal', ROW.lowerOcclusal)}
      {rowLabel('Vestibular', 332)}

      {/* separador das arcadas + linha média */}
      <line x1={PAD_L} y1={ROW.separator} x2={WIDTH - PAD_R} y2={ROW.separator} stroke='#E3E7F1' strokeWidth={1} />
      <line x1={midX} y1={4} x2={midX} y2={HEIGHT - 4} stroke='#C7CEE0' strokeWidth={0.8} strokeDasharray='4 3' />
      <text x={PAD_L + 2} y={ROW.separator - 2.5} fontSize={7} fontWeight={700} fill='#9AA1B4' style={{ userSelect: 'none' }}>
        DIREITA DO PACIENTE
      </text>
      <text x={WIDTH - PAD_R - 2} y={ROW.separator - 2.5} textAnchor='end' fontSize={7} fontWeight={700} fill='#9AA1B4' style={{ userSelect: 'none' }}>
        ESQUERDA DO PACIENTE
      </text>

      {primary && (
        <text x={PAD_L + 2} y={12} fontSize={7} fontWeight={700} fill='#9AA1B4' style={{ userSelect: 'none' }}>
          DENTIÇÃO DECÍDUA (DENTES DE LEITE)
        </text>
      )}
      {upperTeeth.map((n, i) => renderTooth(n, i))}
      {lowerTeeth.map((n, i) => renderTooth(n, i))}
    </svg>
  );
}
