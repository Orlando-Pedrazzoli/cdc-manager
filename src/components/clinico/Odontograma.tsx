// 📄 src/components/clinico/Odontograma.tsx
// =============================================================================
// CDC Manager — Clínico: Odontograma interativo (Client Component)
// -----------------------------------------------------------------------------
// Mapa das 2 arcadas da dentição definitiva (32 dentes, FDI) em SVG: cada
// dente é um diagrama de 5 faces (O central, M/D/V/L em trapézios) + zona
// radicular (endodontia / espigão) — a representação que os médicos conhecem
// do papel e do Dentoral.
//
// O MAPA É DERIVADO, não desenhado à mão (Open Dental / CareStack / Curve):
//   · EXISTENTE  (verde)  — registo manual do médico: estado inicial, achados
//                           (cárie, fratura, desgaste), trabalho feito noutro lado
//   · EXECUTADO  (azul)   — atos completados/faturados na clínica (Procedures)
//   · PLANEADO   (laranja, contorno) — itens de plano / atos planeados
// Camadas comutáveis; LINHA TEMPORAL para ver "como estava em…".
// Só a camada EXISTENTE é editável aqui (painel ToothDetail) e grava uma
// NOVA VERSÃO (snapshot imutável). Executado/planeado mudam ao registar atos
// e planos — nunca há dupla entrada.
//
// Orientação anatómica: MESIAL para a linha média (Q1/Q4 → direita; Q2/Q3 →
// esquerda); VESTIBULAR para fora da boca (superior → cima; inferior → baixo).
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Save, Layers, CalendarClock } from 'lucide-react';
import {
  saveOdontogramAction,
  type ConsultationActionState,
} from '@/actions/procedures';
import {
  UPPER_TEETH,
  LOWER_TEETH,
  TOOTH_STATUS_LABEL,
  FACE_CONDITION_LABEL,
  type FaceCondition,
  type ToothFace,
  type ToothStatus,
} from '@/lib/domain';
import {
  deriveToothStates,
  type ChartEvent,
  type ChartLayer,
  type ToothChartState,
  type FaceConditionKey,
} from '@/lib/odontogram-chart';
import type { SerializedChartEvent } from '@/lib/odontogram-events';
import {
  ToothDetail,
  emptyTooth,
  isToothEmpty,
  type ToothEntry,
  type ToothProcedure,
} from '@/components/clinico/ToothDetail';
import { Button } from '@/components/ui/Button';
import { OdontogramaArcada } from '@/components/clinico/OdontogramaArcada';

// --- Cores (inline SEMPRE — convenção do projeto) -----------------------------
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
const FINDING_COLOR: Partial<Record<FaceConditionKey, string>> = {
  caries: '#B3261E',
  fracture: '#C2620A',
  wear: '#7A4FB0',
};
const FACE_EMPTY = '#F4F6FB';
const FACE_STROKE = '#C7CEE0';

const STATUS_CHAR: Partial<Record<ToothStatus, string>> = {
  missing: '✕',
  implant: 'I',
  crown: 'C',
  'bridge-pontic': 'P',
  'root-only': 'R',
  'to-extract': 'E',
};

const FACE_PATHS: Record<'top' | 'bottom' | 'left' | 'right', string> = {
  top: 'M2,2 L38,2 L27,13 L13,13 Z',
  bottom: 'M2,38 L38,38 L27,27 L13,27 Z',
  left: 'M2,2 L13,13 L13,27 L2,38 Z',
  right: 'M38,2 L38,38 L27,27 L27,13 Z',
};

/** Mapeia posições visuais → faces anatómicas conforme o quadrante FDI */
function visualFaceMap(
  toothNumber: string,
): Record<'top' | 'bottom' | 'left' | 'right' | 'center', ToothFace> {
  const quadrant = toothNumber[0];
  const isUpper = quadrant === '1' || quadrant === '2';
  const mesialRight = quadrant === '1' || quadrant === '4';
  return {
    center: 'O',
    top: isUpper ? 'V' : 'L',
    bottom: isUpper ? 'L' : 'V',
    left: mesialRight ? 'D' : 'M',
    right: mesialRight ? 'M' : 'D',
  };
}

function faceStyle(f: ToothChartState['faces'][ToothFace] | undefined): {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
} {
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

const EMPTY_STATE = (n: string): ToothChartState => ({
  number: n,
  status: 'present',
  statusLayer: null,
  endo: null,
  post: null,
  veneer: null,
  faces: {},
  events: [],
});

// --- Dente anatómico (SVG): coroa por grupo dentário + raízes -----------------
function ToothSvg({
  state, note, selected, upper, onSelect,
}: {
  state: ToothChartState; note: string | null; selected: boolean; upper: boolean; onSelect: () => void;
}) {
  const map = visualFaceMap(state.number);
  const mark = STATUS_CHAR[state.status];
  const markColor = state.statusLayer ? LAYER_COLOR[state.statusLayer] : '#9AA1B4';
  const dimmed = state.status === 'missing';
  const rootColor = state.endo ? LAYER_COLOR[state.endo] : null;
  const postColor = state.post ? LAYER_COLOR[state.post] : null;
  const veneerColor = state.veneer ? LAYER_COLOR[state.veneer] : null;
  const position = Number(state.number[1]);
  const primary = ['5', '6', '7', '8'].includes(state.number[0]);
  const molar = primary ? position >= 4 : position >= 6;
  const premolar = !primary && position >= 4 && position <= 5;
  const canine = position === 3;
  const crown = molar
    ? 'M8 19 C5 16 7 11 12 10 C15 6 21 7 24 10 C29 7 35 11 34 16 C39 20 36 28 33 31 C32 38 27 43 21 42 C15 44 9 40 9 34 C4 30 4 23 8 19 Z'
    : premolar
      ? 'M10 17 C8 12 12 8 17 10 C21 6 28 9 30 13 C35 17 34 25 31 30 C30 38 25 42 20 41 C14 42 9 37 9 31 C5 26 6 20 10 17 Z'
      : canine
        ? 'M10 18 C10 11 14 8 20 5 C26 8 30 12 30 19 C32 28 27 38 20 43 C13 38 8 28 10 18 Z'
        : 'M10 14 C13 9 27 9 30 14 C33 20 32 31 29 37 C26 42 14 42 11 37 C8 30 7 20 10 14 Z';
  const roots = molar
    ? (upper
      ? 'M11 17 C8 10 7 5 9 1 C13 0 15 8 17 15 Z M17 16 C17 8 18 2 21 0 C25 2 23 10 23 17 Z M25 16 C28 8 30 3 34 4 C36 8 32 14 30 19 Z'
      : 'M11 43 C8 50 7 57 10 65 C14 66 16 55 18 44 Z M22 43 C22 52 23 59 27 64 C31 62 28 51 28 43 Z')
    : (upper
      ? 'M15 17 C13 10 12 4 17 0 C21 0 21 10 22 17 Z'
      : 'M15 42 C13 50 13 58 18 65 C22 64 21 52 22 42 Z');
  const titleBits = [
    'Dente ' + state.number,
    mark ? TOOTH_STATUS_LABEL[state.status] : null,
    state.endo ? 'Endodontia (' + LAYER_LABEL[state.endo] + ')' : null,
    state.post ? 'Espigão' : null,
    state.veneer ? 'Faceta' : null,
  ].filter(Boolean);

  return (
    <button type='button' onClick={onSelect} title={titleBits.join(' · ')}
      aria-label={titleBits.join(', ')} aria-pressed={selected}
      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', lineHeight: 0, borderRadius: 5 }}>
      <svg width={46} height={68} viewBox='0 0 42 68' role='img' aria-hidden='true'>
        <defs>
          <linearGradient id={'enamel-' + state.number} x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stopColor='#FFFFFF' /><stop offset='48%' stopColor='#F5F1E8' /><stop offset='100%' stopColor='#DED8C9' />
          </linearGradient>
          <linearGradient id={'root-' + state.number} x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0%' stopColor='#D8D0C0' /><stop offset='48%' stopColor='#FFFDF7' /><stop offset='100%' stopColor='#D5CDBD' />
          </linearGradient>
          <clipPath id={'tooth-crown-' + state.number}><path d={crown} /></clipPath>
        </defs>
        <path d={roots} fill={rootColor || 'url(#root-' + state.number + ')'} stroke={rootColor || '#BEB6A7'} strokeWidth='1' opacity={dimmed ? 0.25 : 1} />
        {postColor && <path d={upper ? 'M19 4 L22 4 L22 17 L19 17 Z' : 'M19 45 L22 45 L22 59 L19 59 Z'} fill={postColor} />}
        <g transform={upper ? 'translate(0 12)' : 'translate(0 0)'} opacity={dimmed ? 0.28 : 1}>
          <path d={crown} fill={dimmed ? '#F2F3F5' : 'url(#enamel-' + state.number + ')'} stroke={selected ? '#2743A6' : '#B8B09F'} strokeWidth={selected ? 2 : 1.1} />
          <path d='M12 16 C15 12 25 11 29 16' fill='none' stroke='#FFFFFF' strokeWidth='2' opacity='.85' strokeLinecap='round' />
          <g clipPath={'url(#tooth-crown-' + state.number + ')'}>
            <g transform='translate(1 1) scale(.95 .95)'>
              {(['top', 'bottom', 'left', 'right'] as const).map(pos => {
                const st = faceStyle(state.faces[map[pos]]);
                return <path key={pos} d={FACE_PATHS[pos]} fill={st.fill} fillOpacity='.9' stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} />;
              })}
              {(() => {
                const st = faceStyle(state.faces.O);
                return <rect x='13' y='13' width='14' height='14' fill={st.fill} fillOpacity='.92' stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} />;
              })()}
            </g>
          </g>
          {molar && <path d='M12 24 C16 20 18 21 21 25 C24 21 28 21 31 24 M21 25 C18 29 17 32 18 35 M21 25 C25 29 26 32 24 36' fill='none' stroke='#B8AE9B' strokeWidth='1' opacity='.8' />}
          {premolar && <path d='M15 22 C18 19 22 19 26 22 M20 20 L21 34' fill='none' stroke='#B8AE9B' strokeWidth='1' opacity='.75' />}
          {veneerColor && <path d={upper ? 'M10 14 Q20 7 30 14' : 'M10 36 Q20 44 30 36'} fill='none' stroke={veneerColor} strokeWidth='3' />}
          {mark && <text x='21' y='27' textAnchor='middle' dominantBaseline='central' fontSize={state.status === 'missing' ? 19 : 13} fontWeight='800' fill={markColor} stroke='#FFFFFF' strokeWidth='2' paintOrder='stroke'>{mark}</text>}
          {note && <circle cx='34' cy='12' r='3.2' fill='#C2620A' stroke='#FFFFFF' strokeWidth='1' />}
        </g>
        {selected && <path d={upper ? 'M5 20 Q21 13 37 20 L37 58 Q21 65 5 58 Z' : 'M5 8 Q21 1 37 8 L37 46 Q21 53 5 46 Z'} fill='none' stroke='#2743A6' strokeWidth='1.5' strokeDasharray='3 2' />}
      </svg>
    </button>
  );
}

// --- Arcada -------------------------------------------------------------------
function Arch({
  teethNumbers,
  states,
  notes,
  selected,
  onSelect,
  upper,
}: {
  teethNumbers: readonly string[];
  states: Map<string, ToothChartState>;
  notes: Map<string, string | null>;
  selected: string | null;
  onSelect: (n: string) => void;
  upper: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
      {teethNumbers.map((n, idx) => (
        <div
          key={n}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            marginLeft: idx === Math.floor(teethNumbers.length / 2) ? '12px' : 0, // linha média, também na dentição decídua
          }}
        >
          {upper && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#6A7186' }}>
              {n}
            </span>
          )}
          <ToothSvg
            state={states.get(n) ?? EMPTY_STATE(n)}
            note={notes.get(n) ?? null}
            selected={selected === n}
            upper={upper}
            onSelect={() => onSelect(n)}
          />
          {!upper && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#6A7186' }}>
              {n}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Helpers -------------------------------------------------------------------
/** Registo manual (ToothEntry) → eventos da camada EXISTENTE */
function manualToEvents(teeth: Map<string, ToothEntry>): ChartEvent[] {
  const out: ChartEvent[] = [];
  for (const t of teeth.values()) {
    if (t.status !== 'present') {
      const effect =
        t.status === 'missing' ? 'extraction'
        : t.status === 'implant' ? 'implant'
        : t.status === 'crown' ? 'crown'
        : t.status === 'bridge-pontic' ? 'bridge'
        : t.status === 'root-only' ? 'root-only'
        : 'to-extract';
      out.push({ layer: 'existing', effect, tooth: t.number, at: null, label: `Registo: ${TOOTH_STATUS_LABEL[t.status]}`, ref: { kind: 'initial', id: t.number } });
    }
    for (const f of t.faces) {
      out.push({ layer: 'existing', effect: f.condition === 'sealant' ? 'sealant' : 'restoration', condition: f.condition, tooth: t.number, faces: [f.face], at: null, label: `Registo: ${FACE_CONDITION_LABEL[f.condition]} (${f.face})`, ref: { kind: 'initial', id: `${t.number}:${f.face}` } });
    }
  }
  return out;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(d);
}

// --- Componente principal -----------------------------------------------------
export function Odontograma({
  patientId,
  initialTeeth,
  events = [],
  versionLabel,
  readOnly,
  proceduresByTooth = {},
  planBaseHref = null,
  consultationHref = null,
}: {
  patientId: string;
  /** Registo manual (camada existente) da versão em vista */
  initialTeeth: ToothEntry[];
  /** Eventos executados/planeados (lib/odontogram-events) — sem os 'initial' */
  events?: SerializedChartEvent[];
  versionLabel: string | null;
  readOnly: boolean;
  proceduresByTooth?: Record<string, ToothProcedure[]>;
  planBaseHref?: string | null;
  /** /doutor/consulta/<id> da consulta EM CURSO com este paciente (ou null) */
  consultationHref?: string | null;
}) {
  const router = useRouter();
  const [teeth, setTeeth] = useState<Map<string, ToothEntry>>(
    () => new Map(initialTeeth.map(t => [t.number, t])),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dentition, setDentition] = useState<'permanent' | 'primary'>('permanent');
  const [dirty, setDirty] = useState(false);
  const [layers, setLayers] = useState<Record<ChartLayer, boolean>>({ existing: true, completed: true, planned: true });

  // eventos externos (executado/planeado), já com Date
  const external = useMemo<ChartEvent[]>(
    () =>
      events
        .filter(e => e.refKind !== 'initial')
        .map(e => ({ layer: e.layer, effect: e.effect, tooth: e.tooth, faces: e.faces, condition: e.condition, at: e.at ? new Date(e.at) : null, label: e.label, ref: { kind: e.refKind, id: e.refId } })),
    [events],
  );

  // linha temporal: datas distintas (mês) dos eventos executados
  const timeline = useMemo(() => {
    const months = new Set<number>();
    for (const e of external) if (e.at && e.layer === 'completed') months.add(new Date(e.at.getFullYear(), e.at.getMonth() + 1, 0, 23, 59, 59).getTime());
    return [...months].sort((a, b) => a - b).map(t => new Date(t));
  }, [external]);
  const [timeIdx, setTimeIdx] = useState<number | null>(null); // null = hoje
  const cutoff = timeIdx === null ? null : timeline[timeIdx];

  const states = useMemo(() => {
    const evs = [
      ...(layers.existing ? manualToEvents(teeth) : []),
      // a ver o passado: planeado some; executado só até à data
      ...external.filter(e => layers[e.layer] && (cutoff ? e.layer !== 'planned' && !!e.at && e.at <= cutoff : true)),
    ];
    return deriveToothStates(evs);
  }, [teeth, external, layers, cutoff]);

  const notes = useMemo(() => new Map([...teeth.values()].map(t => [t.number, t.note])), [teeth]);

  // entradas para a arcada anatómica (mesma fonte)
  const archEntries = useMemo<ToothEntry[]>(
    () =>
      [...states.values()].map(s => ({
        number: s.number,
        status: s.status,
        faces: Object.entries(s.faces).map(([face, f]) => ({ face: face as ToothFace, condition: f.condition as FaceCondition })),
        note: notes.get(s.number) ?? null,
      })),
    [states, notes],
  );

  const [state, action, pending] = useActionState<ConsultationActionState, FormData>(saveOdontogramAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) {
      toast.success('Odontograma gravado (nova versão)');
      router.push(`/doutor/pacientes/${patientId}`);
    }
  }, [state, router, patientId]);

  const updateTooth = (next: ToothEntry) => {
    setTeeth(prev => {
      const map = new Map(prev);
      if (isToothEmpty(next)) map.delete(next.number);
      else map.set(next.number, next);
      return map;
    });
    setDirty(true);
  };

  const teethJson = useMemo(() => JSON.stringify([...teeth.values()].filter(t => !isToothEmpty(t))), [teeth]);
  const selectedTooth = selected ? (teeth.get(selected) ?? emptyTooth(selected)) : null;
  const selectedState = selected ? (states.get(selected) ?? EMPTY_STATE(selected)) : null;

  const toggle = (l: ChartLayer) => setLayers(prev => ({ ...prev, [l]: !prev[l] }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Barra: camadas + linha temporal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          flexWrap: 'wrap',
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '10px 16px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700, color: '#6A7186' }}>
          <Layers size={14} /> Camadas
        </span>
        {(['existing', 'completed', 'planned'] as ChartLayer[]).map(l => (
          <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '13px', color: '#1C2233', cursor: 'pointer' }}>
            <input type='checkbox' checked={layers[l]} onChange={() => toggle(l)} />
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: l === 'planned' ? `${LAYER_COLOR[l]}33` : LAYER_COLOR[l],
                border: `2px ${l === 'planned' ? 'dashed' : 'solid'} ${LAYER_COLOR[l]}`,
                display: 'inline-block',
              }}
            />
            {LAYER_LABEL[l]}
          </label>
        ))}
        {timeline.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', minWidth: 280, flex: '1 1 280px' }}>
            <CalendarClock size={14} style={{ color: '#6A7186' }} />
            <input
              type='range'
              min={0}
              max={timeline.length}
              value={timeIdx === null ? timeline.length : timeIdx}
              onChange={e => { const v = Number(e.target.value); setTimeIdx(v >= timeline.length ? null : v); }}
              style={{ flex: 1 }}
              aria-label='Linha temporal do odontograma'
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: cutoff ? '#8A5A00' : '#1B2A6B', whiteSpace: 'nowrap', minWidth: 92, textAlign: 'right' }}>
              {cutoff ? `até ${fmtDate(cutoff)}` : 'Hoje'}
            </span>
          </div>
        )}
      </div>

      {/* Vista anatómica das arcadas — mesma fonte de dados, mesma seleção */}
      <OdontogramaArcada
        entries={archEntries}
        selected={selected}
        onSelect={setSelected}
        dentition={dentition}
        onDentitionChange={value => { setDentition(value); setSelected(null); }}
        plannedTeeth={new Set([...states.values()].filter(s => s.statusLayer === 'planned' || Object.values(s.faces).some(f => f.layer === 'planned')).map(s => s.number))}
      />

      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Mapa das arcadas */}
        <div
          style={{
            flex: '1 1 700px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: 0,
            overflowX: 'auto',
          }}
        >
          <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6A7186', textAlign: 'center' }}>
            Arcada superior
          </p>
          <Arch teethNumbers={dentition === 'permanent' ? UPPER_TEETH : ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65']} states={states} notes={notes} selected={selected} onSelect={setSelected} upper />
          <div style={{ height: 10 }} />
          <Arch teethNumbers={dentition === 'permanent' ? LOWER_TEETH : ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75']} states={states} notes={notes} selected={selected} onSelect={setSelected} upper={false} />
          <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6A7186', textAlign: 'center' }}>
            Arcada inferior
          </p>

          {/* Legenda */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F4F6FB', justifyContent: 'center' }}>
            {(Object.entries(FINDING_COLOR) as [FaceConditionKey, string][]).map(([c, color]) => (
              <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, display: 'inline-block' }} />
                {FACE_CONDITION_LABEL[c as FaceCondition]}
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: LAYER_COLOR.completed, display: 'inline-block' }} />
              Restauração / selante (cor da camada)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
              <span style={{ width: 10, height: 6, borderRadius: 1, backgroundColor: LAYER_COLOR.completed, display: 'inline-block' }} />
              Raiz pintada = endodontia
            </span>
            {Object.entries(STATUS_CHAR).map(([st, ch]) => (
              <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                <span style={{ fontWeight: 800, color: '#3D4257' }}>{ch}</span>
                {TOOTH_STATUS_LABEL[st as ToothStatus]}
              </span>
            ))}
          </div>
        </div>

        {/* Painel do dente */}
        <div style={{ flex: '0 1 340px', minWidth: 300 }}>
          {selectedTooth && selectedState ? (
            <ToothDetail
              tooth={selectedTooth}
              derived={selectedState}
              onChange={updateTooth}
              readOnly={readOnly}
              procedures={proceduresByTooth[selectedTooth.number] ?? []}
              planHref={planBaseHref ? `${planBaseHref}&dentes=${selectedTooth.number}` : null}
              consultationHref={consultationHref}
            />
          ) : (
            <div style={{ backgroundColor: '#FFFFFF', border: '1px dashed #C7CEE0', borderRadius: '14px', padding: '24px 18px', fontSize: '13px', color: '#6A7186', textAlign: 'center' }}>
              Clique num dente para {readOnly ? 'ver o detalhe' : 'ver o historial e editar o registo'}.
            </div>
          )}
        </div>
      </div>

      {/* Rodapé: versão + gravação */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
          {versionLabel ?? 'Sem registo manual anterior — esta será a versão 1.'}
          {' · '}
          Executado e planeado vêm dos atos e planos; só o registo manual (camada existente) se grava aqui.
        </span>
        {!readOnly && (
          <form action={action}>
            <input type='hidden' name='patientId' value={patientId} />
            <input type='hidden' name='teeth' value={teethJson} />
            <Button type='submit' disabled={pending || !dirty}>
              <Save size={15} style={{ marginRight: 6 }} />
              {pending ? 'A gravar…' : 'Gravar registo (nova versão)'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
