// 📄 src/components/clinico/Odontograma.tsx
// =============================================================================
// CDC Manager — Clínico: Odontograma interativo (Client Component)
// -----------------------------------------------------------------------------
// Mapa das 2 arcadas da dentição definitiva (32 dentes, FDI), em duas vistas
// comutáveis sobre os MESMOS dados:
//   · ANATÓMICO (por omissão) — dentes de anatomia real em vista vestibular e
//     oclusal + grelha de 5 faces (odontograma/OdontogramaAnatomico)
//   · ESQUEMA — arcadas em vista oclusal + diagrama de 5 faces (O central,
//     M/D/V/L em trapézios) com zona radicular, como no papel
//   · PACIENTE 3D — boca em 3D que roda e abre, uma cor por dente, para
//     mostrar ao paciente (odontograma/OdontogramaPaciente3D)
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
import { Save, Layers, CalendarClock, LayoutGrid, Smile, Rotate3d } from 'lucide-react';
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
import {
  EMPTY_STATE,
  FACE_PATHS,
  FACE_STROKE,
  FINDING_COLOR,
  LAYER_COLOR,
  LAYER_LABEL,
  STATUS_CHAR,
  faceStyle,
  visualFaceMap,
} from '@/components/clinico/odontograma/chart-style';
import { OdontogramaAnatomico } from '@/components/clinico/odontograma/OdontogramaAnatomico';
import { OdontogramaPaciente3D } from '@/components/clinico/odontograma/OdontogramaPaciente3D';
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

// Cores e regras de pintura: odontograma/chart-style (fonte única das 2 vistas)
export { LAYER_COLOR, LAYER_LABEL };

type ChartView = 'anatomico' | 'esquema' | 'paciente';

// --- Dente (SVG 40×50: 40×40 faces + 10 de zona radicular) -------------------
function ToothSvg({
  state,
  note,
  selected,
  upper,
  onSelect,
}: {
  state: ToothChartState;
  note: string | null;
  selected: boolean;
  upper: boolean;
  onSelect: () => void;
}) {
  const map = visualFaceMap(state.number);
  const mark = STATUS_CHAR[state.status];
  const markColor = state.statusLayer
    ? LAYER_COLOR[state.statusLayer]
    : '#9AA1B4';
  const dimmed = state.status === 'missing';
  const rootColor = state.endo ? LAYER_COLOR[state.endo] : null;
  const postColor = state.post ? LAYER_COLOR[state.post] : null;
  const veneerColor = state.veneer ? LAYER_COLOR[state.veneer] : null;
  // raiz desenhada do lado oposto à vestibular… simplificação: raiz "para fora" da arcada
  const rootY = upper ? 0 : 40;
  const faceOffset = upper ? 10 : 0;
  const titleBits = [
    `Dente ${state.number}`,
    mark ? TOOTH_STATUS_LABEL[state.status] : null,
    state.endo ? `Endodontia (${LAYER_LABEL[state.endo]})` : null,
    state.post ? 'Espigão' : null,
    state.veneer ? 'Faceta' : null,
  ].filter(Boolean);

  return (
    <button
      type='button'
      onClick={onSelect}
      title={titleBits.join(' · ')}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        lineHeight: 0,
      }}
    >
      <svg width={40} height={50} viewBox='0 0 40 50'>
        {/* zona radicular */}
        <g transform={`translate(0 ${rootY})`}>
          <path
            d={
              upper
                ? 'M12,10 L16,1 L24,1 L28,10 Z'
                : 'M12,0 L16,9 L24,9 L28,0 Z'
            }
            fill={rootColor ?? '#FFFFFF'}
            stroke={rootColor ?? FACE_STROKE}
            strokeWidth={rootColor ? 1.5 : 1}
            opacity={dimmed ? 0.3 : 1}
          />
          {postColor && (
            <rect
              x={18.5}
              y={upper ? 2 : 2}
              width={3}
              height={6}
              fill={postColor}
            />
          )}
        </g>
        <g transform={`translate(0 ${faceOffset})`} opacity={dimmed ? 0.35 : 1}>
          {(['top', 'bottom', 'left', 'right'] as const).map(pos => {
            const st = faceStyle(state.faces[map[pos]]);
            return (
              <path
                key={pos}
                d={FACE_PATHS[pos]}
                fill={st.fill}
                stroke={st.stroke}
                strokeWidth={st.strokeWidth}
                strokeDasharray={st.dash}
              />
            );
          })}
          {(() => {
            const st = faceStyle(state.faces.O);
            return (
              <rect
                x={13}
                y={13}
                width={14}
                height={14}
                fill={st.fill}
                stroke={st.stroke}
                strokeWidth={st.strokeWidth}
                strokeDasharray={st.dash}
              />
            );
          })()}
          {veneerColor && (
            <path
              d={FACE_PATHS[upper ? 'top' : 'bottom']}
              fill='none'
              stroke={veneerColor}
              strokeWidth={3}
            />
          )}
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
              style={{ pointerEvents: 'none' }}
            >
              {mark}
            </text>
          )}
          {note && <circle cx={35} cy={5} r={3.5} fill='#C2620A' />}
        </g>
        {selected && (
          <rect
            x={0.5}
            y={0.5}
            width={39}
            height={49}
            fill='none'
            stroke='#2743A6'
            strokeWidth={2.5}
            rx={4}
          />
        )}
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
    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
      {teethNumbers.map((n, idx) => (
        <div
          key={n}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            marginLeft: idx === 8 ? '12px' : 0, // linha média
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
  const [dirty, setDirty] = useState(false);
  const [layers, setLayers] = useState<Record<ChartLayer, boolean>>({ existing: true, completed: true, planned: true });
  const [view, setView] = useState<ChartView>('anatomico');

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
        <div
          role='group'
          aria-label='Vista do odontograma'
          style={{ display: 'inline-flex', border: '1px solid #D5DBEA', borderRadius: '9px', overflow: 'hidden' }}
        >
          {(
            [
              { id: 'anatomico', label: 'Anatómico', Icon: Smile },
              { id: 'esquema', label: 'Esquema', Icon: LayoutGrid },
              { id: 'paciente', label: 'Paciente 3D', Icon: Rotate3d },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type='button'
              onClick={() => setView(id)}
              aria-pressed={view === id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: view === id ? '#2743A6' : '#FFFFFF',
                color: view === id ? '#FFFFFF' : '#3D4257',
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
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

      {/* Vista em esquema: arcadas em vista oclusal — mesma fonte de dados, mesma seleção */}
      {view === 'esquema' && (
        <OdontogramaArcada
          entries={archEntries}
          selected={selected}
          onSelect={setSelected}
          plannedTeeth={new Set([...states.values()].filter(s => s.statusLayer === 'planned' || Object.values(s.faces).some(f => f.layer === 'planned')).map(s => s.number))}
        />
      )}

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
          {view === 'paciente' ? (
            <OdontogramaPaciente3D states={states} selected={selected} onSelect={setSelected} />
          ) : view === 'anatomico' ? (
            <OdontogramaAnatomico states={states} notes={notes} selected={selected} onSelect={setSelected} />
          ) : (
            <>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6A7186', textAlign: 'center' }}>
                Arcada superior
              </p>
              <Arch teethNumbers={UPPER_TEETH} states={states} notes={notes} selected={selected} onSelect={setSelected} upper />
              <div style={{ height: 10 }} />
              <Arch teethNumbers={LOWER_TEETH} states={states} notes={notes} selected={selected} onSelect={setSelected} upper={false} />
              <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#6A7186', textAlign: 'center' }}>
                Arcada inferior
              </p>
            </>
          )}

          {/* Legenda (a vista do paciente tem a sua, mais simples) */}
          {view !== 'paciente' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F4F6FB', justifyContent: 'center' }}>
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
              {view === 'anatomico' ? 'Canal pintado = endodontia' : 'Raiz pintada = endodontia'}
            </span>
            {view === 'anatomico' && (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '3px 3px 5px 5px', backgroundColor: `${LAYER_COLOR.completed}B3`, border: `1px solid ${LAYER_COLOR.completed}`, display: 'inline-block' }} />
                  Coroa pintada = coroa / faceta / pôntico
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, border: '1px dashed #9AA1B4', display: 'inline-block' }} />
                  Contorno tracejado = dente ausente
                </span>
              </>
            )}
            {Object.entries(STATUS_CHAR).map(([st, ch]) => (
              <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                <span style={{ fontWeight: 800, color: '#3D4257' }}>{ch}</span>
                {TOOTH_STATUS_LABEL[st as ToothStatus]}
              </span>
            ))}
          </div>}
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
