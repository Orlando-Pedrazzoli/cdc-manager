// 📄 src/components/clinico/odontograma/chart-style.ts
// =============================================================================
// CDC Manager — Odontograma: cores e regras de pintura partilhadas
// -----------------------------------------------------------------------------
// Fonte única das cores por camada (existente / executado / planeado), das
// cores dos achados e do mapeamento posição visual → face anatómica. Usado
// pela vista anatómica e pela vista em esquema, para que nunca divirjam.
// =============================================================================

import type { ToothFace, ToothStatus } from '@/lib/domain';
import type {
  ChartLayer,
  FaceConditionKey,
  ToothChartState,
} from '@/lib/odontogram-chart';

/** Cor por camada para TRABALHO (restauração, selante, coroa, implante…) */
export const LAYER_COLOR: Record<ChartLayer, string> = {
  existing: '#0F7B4D', // verde — já existia
  completed: '#2743A6', // azul — feito na clínica
  planned: '#E0A100', // laranja — a fazer
};
export const LAYER_LABEL: Record<ChartLayer, string> = {
  existing: 'Existente',
  completed: 'Executado',
  planned: 'Planeado',
};

/** ACHADOS (sempre camada existente) têm cor própria, independente da camada */
export const FINDING_COLOR: Partial<Record<FaceConditionKey, string>> = {
  caries: '#B3261E',
  fracture: '#C2620A',
  wear: '#7A4FB0',
};
export const FACE_EMPTY = '#F4F6FB';
export const FACE_STROKE = '#C7CEE0';

export const STATUS_CHAR: Partial<Record<ToothStatus, string>> = {
  missing: '✕',
  implant: 'I',
  crown: 'C',
  'bridge-pontic': 'P',
  'root-only': 'R',
  'to-extract': 'E',
};

/** Diagrama de 5 faces em caixa 40×40 (O é o quadrado central 13..27) */
export const FACE_PATHS: Record<'top' | 'bottom' | 'left' | 'right', string> = {
  top: 'M2,2 L38,2 L27,13 L13,13 Z',
  bottom: 'M2,38 L38,38 L27,27 L13,27 Z',
  left: 'M2,2 L13,13 L13,27 L2,38 Z',
  right: 'M38,2 L38,38 L27,27 L27,13 Z',
};

/** Mapeia posições visuais → faces anatómicas conforme o quadrante FDI */
export function visualFaceMap(
  toothNumber: string,
): Record<'top' | 'bottom' | 'left' | 'right' | 'center', ToothFace> {
  const quadrant = toothNumber[0];
  // decíduos (7.ª ronda/B6): 5 e 6 são superiores; 5 e 8 ficam à direita
  // do paciente, como 1 e 4
  const isUpper = quadrant === '1' || quadrant === '2' || quadrant === '5' || quadrant === '6';
  const mesialRight = quadrant === '1' || quadrant === '4' || quadrant === '5' || quadrant === '8';
  return {
    center: 'O',
    top: isUpper ? 'V' : 'L',
    bottom: isUpper ? 'L' : 'V',
    left: mesialRight ? 'D' : 'M',
    right: mesialRight ? 'M' : 'D',
  };
}

export type FacePaint = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
};

/** Pintura de uma face na grelha de 5 faces */
export function faceStyle(
  f: ToothChartState['faces'][ToothFace] | undefined,
): FacePaint {
  if (!f) return { fill: FACE_EMPTY, stroke: FACE_STROKE, strokeWidth: 1 };
  const finding = FINDING_COLOR[f.condition];
  if (finding) return { fill: finding, stroke: FACE_STROKE, strokeWidth: 1 };
  const color = LAYER_COLOR[f.layer];
  if (f.layer === 'planned')
    return { fill: `${color}33`, stroke: color, strokeWidth: 2, dash: '3 2' };
  if (f.condition === 'sealant')
    return { fill: `${color}99`, stroke: color, strokeWidth: 1 };
  return { fill: color, stroke: FACE_STROKE, strokeWidth: 1 };
}

export const EMPTY_STATE = (n: string): ToothChartState => ({
  number: n,
  status: 'present',
  statusLayer: null,
  endo: null,
  post: null,
  veneer: null,
  faces: {},
  events: [],
});
