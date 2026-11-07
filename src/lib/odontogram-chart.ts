// 📄 src/lib/odontogram-chart.ts
// =============================================================================
// CDC Manager — Odontograma: efeito de cada ato no mapa dentário + derivação
// das 3 camadas (existente / executado / planeado) a partir dos dados que a
// clínica JÁ regista (procedures, planos, estado inicial). Sem mongoose —
// partilhado por server e client.
//
// Princípio (Open Dental, Dentoral, CareStack, Curve): o odontograma não é um
// desenho mantido à mão, é a PROJEÇÃO do historial clínico sobre os dentes:
//   · existente  — condições/estado encontrados na 1.ª avaliação (base chart)
//   · executado  — atos completados/faturados (azul)
//   · planeado   — itens de planos aprovados/propostos (vermelho/laranja)
// Cada TreatmentType tem um `chartEffect` que diz como o ato pinta o dente.
// =============================================================================

export const CHART_EFFECTS = [
  'none', // não afeta o mapa (consulta, RX, destartarização…)
  'restoration', // restauração direta/indireta → faces
  'sealant', // selante → face O
  'endo', // tratamento endodôntico → marca radicular
  'extraction', // exodontia → dente ausente
  'implant', // implante → estado implante
  'crown', // coroa / onlay / overlay → estado coroa
  'bridge', // ponte (pilar + pôntico) → coroa nos pilares, pôntico no vão
  'veneer', // faceta → face V
  'post', // espigão / falso coto → marca radicular
  'removable', // prótese removível (acrílica, esquelética) → marca de arcada
  'ortho', // aparelho / contenção → marca de arcada
  'perio', // raspagem / cirurgia perio → sem efeito no dente (perio chart)
] as const;
export type ChartEffect = (typeof CHART_EFFECTS)[number];

export const CHART_EFFECT_LABEL: Record<ChartEffect, string> = {
  none: 'Sem efeito no odontograma',
  restoration: 'Restauração (faces)',
  sealant: 'Selante (oclusal)',
  endo: 'Endodontia (raiz)',
  extraction: 'Extração (dente ausente)',
  implant: 'Implante',
  crown: 'Coroa / onlay',
  bridge: 'Ponte',
  veneer: 'Faceta (vestibular)',
  post: 'Espigão / falso coto',
  removable: 'Prótese removível',
  ortho: 'Ortodontia',
  perio: 'Periodontologia',
};

/**
 * Inferência por palavras-chave do nome/categoria do ato (nomenclatura OMD /
 * Dentoral). Usada para pré-preencher `chartEffect` dos 1 290 atos; o Victor
 * revê a lista exportada (CSV) e corrige na app. Ordem importa: do mais
 * específico para o mais geral.
 */
export function inferChartEffect(name: string, category: string | null | undefined): ChartEffect {
  const n = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  const c = (category ?? '').toUpperCase();

  if (/\b(CONSULTA|ORCAMENTO|RADIOGRAF|ORTOPANTOMOGRAF|TAC\b|CBCT|TELERRADIOGRAF|FOTOGRAF|IMAGIOLOG|INTERPRETACAO|RELATORIO|DECLARACAO|ATESTADO|ANESTESIA|MEDICACAO|RECEITA|PENSO|AJUSTE|CONTROLO|CONTROLE|REAVALIACAO|URGENCIA|SUTURA|REMOCAO DE SUTURA|DESTARTARIZ|POLIMENTO|JACTO|BICARBONATO|BRANQUEAMENTO|CLAREAMENTO|FLUOR|VERNIZ|REVELADOR|DESSENSIBIL|PROFILAXIA|INSTRUCAO|MOTIVACAO|ACONSELHAMENTO|HIGIENE|GOTEIRA|PLACA DE RELAXAMENTO|PLACA OCLUSAL|PROTECTOR|BOTOX|TOXINA|ACIDO HIALURONICO|PREENCHIMENTO|HARMONIZ|FACIAL|BIOPSIA|FRENECTOMIA|FRENULECTOMIA|QUISTO|DRENAGEM|ABCESSO|LASER|OZONO)\b/.test(n)) {
    // frenectomia/biópsia são cirurgias mas não mudam o dente
    return 'none';
  }
  if (/SELANTE|SELAMENTO/.test(n)) return 'sealant';
  if (/FACETA|LAMINADO/.test(n)) return 'veneer';
  if (/ESPIGAO|FALSO COTO|NUCLEO|PINO|RETENTOR INTRA/.test(n)) return 'post';
  if (/\bPONTE\b|PONTICO|PILAR DE PONTE/.test(n)) return 'bridge';
  if (/IMPLANTE|IMPLANTO/.test(n) && !/SOBRE IMPLANTE|PROTESE SOBRE|COROA SOBRE/.test(n)) return 'implant';
  if (/COROA|ONLAY|OVERLAY|INLAY|ENDOCROWN|SOBRE IMPLANTE/.test(n)) return 'crown';
  if (/EXODONTIA|EXTRACAO|EXTRACCAO|AVULSAO|ODONTOSECCAO|GERMECTOMIA|SISO|INCLUSO|SEMI-INCLUSO|RESTO RADICULAR/.test(n)) return 'extraction';
  if (/ENDODON|PULPOTOMIA|PULPECTOMIA|CANAL|TRATAMENTO DO CANAL|RETRATAMENTO|APICECTOMIA|APEXIFICA|OBTURACAO DO CANAL|MICROCIRURGIA ENDO/.test(n) || /ENDODONTIA|RETRATAMENTO|MICROCIRURGIA ENDOD/.test(c)) return 'endo';
  if (/RESTAURA|RECONSTRU|OBTURACAO|RESINA|COMPOSITO|AMALGAMA|IONOMERO|CLASSE\s*[IV]+|CAVIDADE/.test(n) || c === 'DENTISTERIA OPERATORIA') return 'restoration';
  if (/PROTESE (ACRILICA|ESQUELETICA|CROMO|NYLON|TITANIO|REMOVIVEL|TOTAL|PARCIAL)|REBASAMENTO|CONSERTO DE PROTESE|ACRESCENTO DE DENTE|GANCHO/.test(n) || /PROTESE ACRILICA|PROTESE CROMO|PROTESE EM NYLON|PROTESE EM TITANIO/.test(c)) return 'removable';
  if (/APARELHO|BRACKET|ORTODON|CONTENCAO|ALINHADOR|ARCO\b|DISJUNTOR|EXPANSOR|INVISALIGN/.test(n) || c === 'ORTODONTIA') return 'ortho';
  if (/RASPAGEM|ALISAMENTO|CURETAGEM|PERIODONT|GENGIV|ENXERTO GENGIVAL|RETALHO|ALONGAMENTO CORONARIO/.test(n) || c === 'PERIODONTOLOGIA') return 'perio';
  if (c === 'PROTESE FIXA') return 'crown';
  if (c === 'IMPLANTOLOGIA') return 'implant';
  if (c === 'CIRURGIA ORAL') return 'extraction';
  return 'none';
}

// -----------------------------------------------------------------------------
// Derivação das camadas
// -----------------------------------------------------------------------------

export type ChartLayer = 'existing' | 'completed' | 'planned';
export type ToothFaceKey = 'O' | 'M' | 'D' | 'V' | 'L';

export type ChartEvent = {
  layer: ChartLayer;
  effect: ChartEffect;
  tooth: string; // FDI
  faces?: ToothFaceKey[];
  at: Date | null; // data do ato / do plano
  label: string; // nome do ato (tooltip)
  ref?: { kind: 'procedure' | 'plan-item' | 'initial'; id: string };
};

export type ToothChartState = {
  number: string;
  status: 'present' | 'missing' | 'implant' | 'crown' | 'bridge-pontic' | 'root-only' | 'to-extract';
  statusLayer: ChartLayer | null;
  endo: ChartLayer | null; // tratamento endodôntico (existente/executado/planeado)
  post: ChartLayer | null;
  veneer: ChartLayer | null;
  faces: Partial<Record<ToothFaceKey, { layer: ChartLayer; condition: 'restoration' | 'sealant' | 'caries' | 'fracture' | 'wear' }>>;
  events: ChartEvent[]; // historial do dente, mais recente primeiro
};

const LAYER_RANK: Record<ChartLayer, number> = { existing: 0, completed: 1, planned: 2 };

/**
 * Projeta eventos (de qualquer origem) no estado por dente. Regras:
 *   · "o último executado ganha" para o estado do dente (extração > implante > coroa)
 *   · planeado nunca sobrepõe executado — fica como camada própria (`statusLayer`)
 *     só quando não há estado executado para esse dente; o evento fica sempre em `events`
 *   · faces: executado sobrepõe existente; planeado só se a face estiver livre
 */
export function deriveToothStates(events: ChartEvent[]): Map<string, ToothChartState> {
  const byTooth = new Map<string, ToothChartState>();
  const sorted = [...events].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0) || LAYER_RANK[a.layer] - LAYER_RANK[b.layer]);
  for (const ev of sorted) {
    const t = byTooth.get(ev.tooth) ?? { number: ev.tooth, status: 'present', statusLayer: null, endo: null, post: null, veneer: null, faces: {}, events: [] };
    byTooth.set(ev.tooth, t);
    t.events.unshift(ev);
    const canSetStatus = ev.layer !== 'planned' || t.statusLayer === null || t.statusLayer === 'planned';
    switch (ev.effect) {
      case 'extraction':
        if (ev.layer === 'planned') { if (canSetStatus) { t.status = 'to-extract'; t.statusLayer = 'planned'; } }
        else { t.status = 'missing'; t.statusLayer = ev.layer; t.faces = {}; t.endo = null; t.post = null; t.veneer = null; }
        break;
      case 'implant':
        if (canSetStatus) { t.status = 'implant'; t.statusLayer = ev.layer; }
        break;
      case 'crown':
        if (canSetStatus && t.status !== 'implant') { t.status = 'crown'; t.statusLayer = ev.layer; }
        else if (canSetStatus && t.status === 'implant' && ev.layer !== 'planned') { t.status = 'implant'; }
        break;
      case 'bridge':
        if (canSetStatus) { t.status = t.status === 'missing' ? 'bridge-pontic' : 'crown'; t.statusLayer = ev.layer; }
        break;
      case 'endo':
        if (ev.layer !== 'planned' || !t.endo) t.endo = ev.layer;
        break;
      case 'post':
        if (ev.layer !== 'planned' || !t.post) t.post = ev.layer;
        break;
      case 'veneer':
        if (ev.layer !== 'planned' || !t.veneer) t.veneer = ev.layer;
        break;
      case 'restoration':
      case 'sealant': {
        const faces = ev.faces?.length ? ev.faces : ev.effect === 'sealant' ? (['O'] as ToothFaceKey[]) : [];
        for (const f of faces) {
          const cur = t.faces[f];
          if (ev.layer === 'planned' && cur && cur.layer !== 'planned') continue;
          t.faces[f] = { layer: ev.layer, condition: ev.effect === 'sealant' ? 'sealant' : 'restoration' };
        }
        break;
      }
      default:
        break;
    }
  }
  return byTooth;
}

/** Bitmask de faces do Dentoral → letras. A correspondência bit→face é
 *  configurável porque ainda está a ser confirmada com a clínica. */
export const DEFAULT_FACE_BITS: Record<number, ToothFaceKey> = { 1: 'O', 2: 'M', 4: 'D', 16: 'V', 32: 'L' };
export function facesFromMask(mask: number, bits: Record<number, ToothFaceKey> = DEFAULT_FACE_BITS): ToothFaceKey[] {
  const out: ToothFaceKey[] = [];
  for (const [bit, face] of Object.entries(bits)) if (mask & Number(bit)) out.push(face);
  return out;
}
