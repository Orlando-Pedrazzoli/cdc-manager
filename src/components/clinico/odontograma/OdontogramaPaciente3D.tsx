// 📄 src/components/clinico/odontograma/OdontogramaPaciente3D.tsx
// =============================================================================
// CDC Manager — Odontograma: vista do PACIENTE em 3D (boca aberta)
// -----------------------------------------------------------------------------
// Uma boca 3D que roda, abre e fecha, para o médico mostrar AO PACIENTE onde
// está cada problema e cada tratamento. É só de leitura e propositadamente
// simples: um dente = uma cor.
//   vermelho  → a precisar de atenção (cárie, fratura, desgaste, resto radicular)
//   laranja   → tratamento planeado
//   azul      → tratado nesta clínica
//   verde     → tratamento anterior (já existia)
//   apagado   → dente em falta
// O detalhe por face, raízes e materiais continua na vista Anatómico.
//
// Recebe o MESMO `ToothChartState` derivado das outras vistas (as camadas e a
// linha temporal do topo aplicam-se aqui também). Clicar num dente seleciona-o
// e abre o mesmo painel de detalhe.
//
// Motor: @oozkul/dental-3d (MIT, modelo incluído) sobre three.js. Ambos são
// carregados só quando esta vista é aberta (import dinâmico) — quem nunca
// abre o 3D não descarrega nada.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import type { DentalViewer, Fdi, TeethStates, ToothState, ViewName } from '@oozkul/dental-3d';
import { RotateCcw } from 'lucide-react';
import type { ToothChartState } from '@/lib/odontogram-chart';
import { FINDING_COLOR, LAYER_COLOR } from '@/components/clinico/odontograma/chart-style';

// --- Cores para o paciente ------------------------------------------------------
const PATIENT_COLOR = {
  attention: '#C62828',
  planned: LAYER_COLOR.planned,
  completed: LAYER_COLOR.completed,
  existing: LAYER_COLOR.existing,
} as const;

const LEGEND: { color: string; label: string; ghost?: boolean }[] = [
  { color: PATIENT_COLOR.attention, label: 'A precisar de atenção' },
  { color: PATIENT_COLOR.planned, label: 'Tratamento planeado' },
  { color: PATIENT_COLOR.completed, label: 'Tratado nesta clínica' },
  { color: PATIENT_COLOR.existing, label: 'Tratamento anterior' },
  { color: '#C7CEE0', label: 'Dente em falta', ghost: true },
];

/** Estado clínico derivado → um estado simples (uma cor) para o modelo 3D */
function toPatientTooth(s: ToothChartState): ToothState | null {
  if (s.status === 'missing') return { status: 'missing' };

  const faces = Object.values(s.faces);
  const layers = [s.statusLayer, s.endo, s.post, s.veneer, ...faces.filter(f => !FINDING_COLOR[f.condition]).map(f => f.layer)];
  const hasFinding = faces.some(f => FINDING_COLOR[f.condition]) || s.status === 'root-only';

  // rótulo (tooltip / leitor de ecrã)
  const status: ToothState['status'] =
    s.status === 'to-extract' ? 'extraction-planned'
    : s.status === 'implant' ? 'implant'
    : s.status === 'crown' ? 'crown'
    : s.status === 'bridge-pontic' ? 'bridge'
    : hasFinding ? 'attention'
    : s.endo ? 'root-canal'
    : s.veneer ? 'veneer'
    : faces.length ? 'filling'
    : 'present';

  // cor: o que falta fazer vem primeiro, depois o que já foi feito
  const tint =
    hasFinding ? PATIENT_COLOR.attention
    : layers.includes('planned') ? PATIENT_COLOR.planned
    : layers.includes('completed') ? PATIENT_COLOR.completed
    : layers.includes('existing') ? PATIENT_COLOR.existing
    : null;

  if (!tint) return null;
  return { status, tint };
}

function toViewerStates(states: Map<string, ToothChartState>): TeethStates {
  const out: TeethStates = {};
  for (const s of states.values()) {
    const t = toPatientTooth(s);
    if (t) out[s.number as Fdi] = t;
  }
  return out;
}

// --- Textos pt-PT (tooltip e leitores de ecrã) ----------------------------------
const POSITION_PT = [
  'incisivo central',
  'incisivo lateral',
  'canino',
  'primeiro pré-molar',
  'segundo pré-molar',
  'primeiro molar',
  'segundo molar',
  'terceiro molar (siso)',
];
const QUADRANT_PT = ['superior direito', 'superior esquerdo', 'inferior esquerdo', 'inferior direito'];

function stringsPt() {
  const names = {} as Record<Fdi, string>;
  for (let q = 1; q <= 4; q++)
    for (let p = 1; p <= 8; p++) {
      const name = `${POSITION_PT[p - 1]} ${QUADRANT_PT[q - 1]}`;
      names[`${q}${p}` as Fdi] = name.charAt(0).toUpperCase() + name.slice(1);
    }
  return {
    tooth: 'Dente',
    statuses: {
      present: 'Presente',
      missing: 'Em falta',
      implant: 'Implante',
      crown: 'Coroa',
      filling: 'Restauração',
      'root-canal': 'Desvitalização',
      bridge: 'Ponte',
      veneer: 'Faceta',
      'extraction-planned': 'A extrair',
      attention: 'A precisar de atenção',
    },
    names,
    teethList: 'Dentes',
    loading: 'A carregar a vista 3D…',
    loadError: 'Não foi possível carregar a vista 3D.',
  };
}

// --- Vistas -----------------------------------------------------------------------
type PatientView = 'front' | 'right' | 'left' | 'upper' | 'lower';
const VIEWS: { id: PatientView; label: string }[] = [
  { id: 'front', label: 'Frente' },
  { id: 'right', label: 'Lado direito' },
  { id: 'left', label: 'Lado esquerdo' },
  { id: 'upper', label: 'Arcada superior' },
  { id: 'lower', label: 'Arcada inferior' },
];
const VIEW_NAME: Record<PatientView, ViewName> = {
  front: 'front',
  right: 'right',
  left: 'left',
  upper: 'upper-occlusal',
  lower: 'lower-occlusal',
};

/**
 * Enquadramento. O motor calcula a câmara para a boca FECHADA; com a boca
 * aberta a arcada inferior desce e sai do ecrã. Nesse caso afasta-se a câmara
 * e baixa-se o ponto para onde ela olha, usando o movimento de câmara interno
 * do motor (a versão do pacote está fixada no package.json). Se esses campos
 * internos deixarem de existir, cai-se na vista pública normal.
 */
type Vec3 = { x: number; y: number; z: number; clone(): Vec3; set(x: number, y: number, z: number): Vec3 };
type EngineInternals = {
  fitDistance?: number;
  center?: Vec3;
  moveCamera?: (position: Vec3, target: Vec3, animate: boolean) => void;
};
function applyView(viewer: DentalViewer, open: boolean, view: PatientView) {
  const engine = (viewer as unknown as { engine?: EngineInternals }).engine;
  const wide = open && view !== 'upper' && view !== 'lower';
  if (!wide || !engine || typeof engine.fitDistance !== 'number' || !engine.center || typeof engine.moveCamera !== 'function') {
    viewer.setView(VIEW_NAME[view]);
    return;
  }
  const d = engine.fitDistance * 1.32;
  const c = engine.center;
  const targetY = c.y - engine.fitDistance * 0.13; // a meio caminho entre as duas arcadas
  const target = c.clone().set(c.x, targetY, c.z);
  const position = c.clone();
  if (view === 'front') position.set(c.x, targetY + d * 0.12, c.z + d);
  else position.set(c.x + (view === 'left' ? 1 : -1) * d * 0.9, targetY + d * 0.1, c.z + d * 0.42);
  engine.moveCamera(position, target, true);
}

const pill = (active: boolean) =>
  ({
    padding: '6px 12px',
    borderRadius: '8px',
    border: `1px solid ${active ? '#2743A6' : '#D5DBEA'}`,
    backgroundColor: active ? '#2743A6' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#3D4257',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  }) as const;

// --- Componente -------------------------------------------------------------------
export function OdontogramaPaciente3D({
  states,
  selected,
  onSelect,
}: {
  states: Map<string, ToothChartState>;
  selected: string | null;
  onSelect: (toothNumber: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<DentalViewer | null>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<PatientView>('front');
  const [labels, setLabels] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // cria o visualizador uma vez; liberta a GPU ao sair da vista
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let viewer: DentalViewer | null = null;

    import('@oozkul/dental-3d')
      .then(({ DentalViewer: Viewer }) => {
        if (cancelled) return;
        viewer = new Viewer({
          container,
          numbering: 'fdi',
          labels: false,
          missingMode: 'ghost',
          locale: stringsPt(),
          cssVariables: false,
          theme: {
            tooth: '#F6F3EA',
            gums: '#E79A98',
            hover: '#5B9CFF',
            selected: '#2743A6',
            label: '#1C2233',
            labelBackground: 'rgba(255,255,255,0.85)',
            background: 'transparent',
            ghostOpacity: 0.16,
          },
          view: 'front',
        });
        viewer.on('select', e => {
          if (e.fdi && e.source !== 'api') onSelectRef.current(e.fdi);
        });
        viewer.on('error', () => {
          if (!cancelled) setStatus('error');
        });
        return viewer.ready.then(() => {
          if (cancelled) return;
          viewerRef.current = viewer;
          setStatus('ready');
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      viewerRef.current = null;
      viewer?.dispose();
    };
  }, []);

  // dados → modelo
  useEffect(() => {
    if (status !== 'ready') return;
    viewerRef.current?.setTeeth(toViewerStates(states));
  }, [status, states]);

  // seleção vinda das outras vistas / do painel
  useEffect(() => {
    if (status !== 'ready') return;
    const viewer = viewerRef.current;
    if (viewer && viewer.selected !== selected) viewer.select((selected as Fdi | null) ?? null);
  }, [status, selected]);

  // boca aberta/fechada + vista + arcada visível
  useEffect(() => {
    if (status !== 'ready') return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setJaw(view === 'upper' ? 'upper' : view === 'lower' ? 'lower' : 'both');
    viewer.setOpen(open);
    applyView(viewer, open, view);
  }, [status, open, view]);

  useEffect(() => {
    if (status !== 'ready') return;
    viewerRef.current?.setLabels(labels);
  }, [status, labels]);

  const single = view === 'upper' || view === 'lower';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {VIEWS.map(v => (
          <button key={v.id} type='button' onClick={() => setView(v.id)} aria-pressed={view === v.id} style={pill(view === v.id)}>
            {v.label}
          </button>
        ))}
        <span style={{ width: 1, height: 22, backgroundColor: '#E3E7F1', margin: '0 4px' }} />
        <button
          type='button'
          onClick={() => setOpen(o => !o)}
          disabled={single}
          aria-pressed={open}
          style={{ ...pill(open && !single), opacity: single ? 0.5 : 1, cursor: single ? 'default' : 'pointer' }}
        >
          {open ? 'Boca aberta' : 'Boca fechada'}
        </button>
        <button type='button' onClick={() => setLabels(l => !l)} aria-pressed={labels} style={pill(labels)}>
          Números
        </button>
        <button
          type='button'
          onClick={() => {
            setView('front');
            setOpen(true);
            const viewer = viewerRef.current;
            if (viewer) applyView(viewer, true, 'front');
          }}
          title='Repor a vista'
          aria-label='Repor a vista'
          style={{ ...pill(false), display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RotateCcw size={13} /> Repor
        </button>
      </div>

      <div style={{ position: 'relative', borderRadius: '12px', background: 'linear-gradient(180deg, #F8FAFF 0%, #EEF2FB 100%)', border: '1px solid #EEF1F8' }}>
        <div ref={containerRef} style={{ width: '100%', height: 'min(62vh, 520px)', minHeight: 360 }} />
        {status !== 'ready' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              fontSize: '13px',
              color: status === 'error' ? '#B3261E' : '#6A7186',
              backgroundColor: status === 'error' ? '#FFFFFF' : 'transparent',
              borderRadius: '12px',
            }}
          >
            {status === 'error'
              ? 'Não foi possível abrir a vista 3D neste dispositivo. Use a vista Anatómico.'
              : 'A carregar a vista 3D…'}
          </div>
        )}
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186', textAlign: 'center' }}>
        Arraste para rodar · roda do rato ou dois dedos para aproximar · clique num dente para ver o detalhe
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', justifyContent: 'center', paddingTop: '10px', borderTop: '1px solid #F4F6FB' }}>
        {LEGEND.map(item => (
          <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#3D4257' }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '4px 4px 6px 6px',
                backgroundColor: item.ghost ? 'transparent' : item.color,
                border: item.ghost ? `1.5px dashed ${item.color}` : `1px solid ${item.color}`,
                display: 'inline-block',
              }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
