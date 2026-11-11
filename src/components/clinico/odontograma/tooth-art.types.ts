// 📄 src/components/clinico/odontograma/tooth-art.types.ts
// =============================================================================
// CDC Manager — Odontograma: tipos da arte anatómica gerada
// (ver scripts/odontograma/build-tooth-art.mjs)
// =============================================================================

import type { ToothFaceKey } from '@/lib/odontogram-chart';

/** Uma forma do desenho: path (`d`) ou círculo (`c` = cx, cy, r). */
export type ArtShape = {
  d?: string;
  c?: number[];
  /** cor de origem do preenchimento: hex, 'none' ou 'body' (corpo do dente) */
  f: string;
  /** contorno de origem (cor) e espessura */
  s?: string;
  w?: number;
  o?: number;
};

type ArtBase = {
  /** viewBox do template: x, y, largura, altura */
  vb: number[];
  /** limites esquerdo/direito da coroa (para centrar e encostar os dentes) */
  crown: number[];
  body: ArtShape[];
  crownShape: ArtShape[];
  veneer: ArtShape[];
  connector: ArtShape[];
  seal: ArtShape[] | null;
  /** região de cada face (restauração / achado) */
  face: Partial<Record<ToothFaceKey, ArtShape[]>>;
  /** lesão de cárie por face (forma orgânica + brilhos) */
  caries: Partial<Record<ToothFaceKey, ArtShape[]>>;
};

export type OcclusalArt = ArtBase;

export type SideArt = ArtBase & {
  /** y da junção amelo-cementária (separa coroa de raiz) */
  cejY: number;
  /** implante: limite esquerdo, direito e y da plataforma */
  implant: number[];
  highlight: ArtShape[];
  /** resto radicular */
  radix: ArtShape[];
  /** obturação canalar */
  endo: ArtShape[];
  /** espigão */
  post: ArtShape[];
};
