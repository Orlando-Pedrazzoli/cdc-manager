// 📄 src/components/clinico/Odontograma.tsx
// =============================================================================
// CDC Manager — Clínico: Odontograma interativo (Client Component)
// -----------------------------------------------------------------------------
// Mapa das 2 arcadas da dentição definitiva (32 dentes, FDI), em duas vistas
// comutáveis sobre os MESMOS dados:
//   · ANATÓMICO (por omissão) — dentes de anatomia real em vista vestibular e
//     oclusal + grelha de 5 faces (odontograma/OdontogramaAnatomico)
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
import { Save, Layers, CalendarClock, Smile, Rotate3d } from 'lucide-react';
import {
  saveOdontogramAction,
  type ConsultationActionState,
} from '@/actions/procedures';
import {
  TOOTH_STATUS_LABEL,
  FACE_CONDITION_LABEL,
  type FaceCondition,
  type ToothStatus,
} from '@/lib/domain';
import {
  deriveToothStates,
  type ChartEvent,
  type ChartLayer,
  type FaceConditionKey,
} from '@/lib/odontogram-chart';
import {
  EMPTY_STATE,
  FINDING_COLOR,
  LAYER_COLOR,
  LAYER_LABEL,
  STATUS_CHAR,
} from '@/components/clinico/odontograma/chart-style';
import { OdontogramaAnatomico } from '@/components/clinico/odontograma/OdontogramaAnatomico';
import { OdontogramaPaciente3D } from '@/components/clinico/odontograma/OdontogramaPaciente3D';
import { OdontogramaHistorico } from '@/components/clinico/odontograma/OdontogramaHistorico';
import type { OdontogramHistoryEntry } from '@/lib/odontogram-history';
import type { SerializedChartEvent } from '@/lib/odontogram-events';
import {
  ToothDetail,
  emptyTooth,
  isToothEmpty,
  type ToothEntry,
  type ToothProcedure,
} from '@/components/clinico/ToothDetail';
import { Button } from '@/components/ui/Button';

// Cores e regras de pintura: odontograma/chart-style (fonte única das 2 vistas)
export { LAYER_COLOR, LAYER_LABEL };

type ChartView = 'anatomico' | 'paciente';

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
  history,
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
  /** 4.ª ronda/07 (Victor): histórico de tratamentos no mesmo ecrã (atos por
   *  data, com médico e observações). Sem a prop, a tabela não aparece. */
  history?: OdontogramHistoryEntry[];
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
          ) : (
            <OdontogramaAnatomico states={states} notes={notes} selected={selected} onSelect={setSelected} />
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
              Canal pintado = endodontia
            </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '3px 3px 5px 5px', backgroundColor: `${LAYER_COLOR.completed}B3`, border: `1px solid ${LAYER_COLOR.completed}`, display: 'inline-block' }} />
                  Coroa pintada = coroa / faceta / pôntico
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3D4257' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, border: '1px dashed #9AA1B4', display: 'inline-block' }} />
                  Contorno tracejado = dente ausente
                </span>
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

      {/* 4.ª ronda/07: histórico e observações no mesmo ecrã */}
      {history && <OdontogramaHistorico history={history} selected={selected} onSelect={setSelected} />}

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
