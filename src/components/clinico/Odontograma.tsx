// 📄 src/components/clinico/Odontograma.tsx
// =============================================================================
// CDC Manager — Clínico: Odontograma interativo (Client Component)
// -----------------------------------------------------------------------------
// Mapa das 2 arcadas da dentição definitiva (32 dentes, notação FDI) em SVG:
// cada dente é um diagrama de 5 faces (O central, M/D/V/L em trapézios) —
// a representação clássica que os médicos conhecem do papel e do Dentoral.
//
//   · Clicar num dente seleciona-o → painel ToothDetail à direita
//   · Cores por condição de face (cárie vermelho, restauração azul…)
//   · Estados de dente inteiro com marca central (✕ ausente, I implante,
//     C coroa, P pôntico, R resto radicular, E a extrair) + legenda
//   · Orientação anatómica: MESIAL aponta para a linha média (Q1/Q4 →
//     direita; Q2/Q3 → esquerda); VESTIBULAR para fora da boca (arcada
//     superior → cima; inferior → baixo) — como num odontograma real
//
// A gravação cria uma NOVA VERSÃO (snapshot completo, imutável). Só os
// dentes com algo assinalado viajam. Ao ver uma versão antiga (?v=) tudo
// fica read-only. Dentição decídua fica para uma iteração futura
// (odontopediatria) — o modelo e as validações já a suportam.
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import {
  saveOdontogramAction,
  type ConsultationActionState,
} from '@/actions/procedures';
import {
  UPPER_TEETH,
  LOWER_TEETH,
  TOOTH_STATUS_LABEL,
  FACE_CONDITION_LABEL,
  FACE_CONDITIONS,
  type FaceCondition,
  type ToothFace,
  type ToothStatus,
} from '@/lib/domain';
import {
  ToothDetail,
  emptyTooth,
  isToothEmpty,
  type ToothEntry,
} from '@/components/clinico/ToothDetail';
import { Button } from '@/components/ui/Button';

// --- Cores (inline SEMPRE — convenção do projeto) -----------------------------
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

const FACE_EMPTY = '#F4F6FB';
const FACE_STROKE = '#C7CEE0';

// --- Geometria de um dente (viewBox 40×40, 5 faces) ---------------------------
// top/bottom/left/right/center são posições VISUAIS; o mapeamento para
// M/D/V/L depende do quadrante (ver visualFaceMap)
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
  // Mesial aponta à linha média: Q1/Q4 estão à ESQUERDA do ecrã → M à direita
  const mesialRight = quadrant === '1' || quadrant === '4';
  return {
    center: 'O',
    top: isUpper ? 'V' : 'L',
    bottom: isUpper ? 'L' : 'V',
    left: mesialRight ? 'D' : 'M',
    right: mesialRight ? 'M' : 'D',
  };
}

function ToothSvg({
  tooth,
  selected,
  onSelect,
}: {
  tooth: ToothEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const map = visualFaceMap(tooth.number);
  const colorOf = (face: ToothFace): string => {
    const c = tooth.faces.find(f => f.face === face)?.condition;
    return c ? CONDITION_COLOR[c] : FACE_EMPTY;
  };
  const mark = STATUS_MARK[tooth.status];
  const dimmed = tooth.status === 'missing';

  return (
    <button
      type='button'
      onClick={onSelect}
      title={`Dente ${tooth.number}${mark ? ` · ${TOOTH_STATUS_LABEL[tooth.status]}` : ''}`}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        lineHeight: 0,
      }}
    >
      <svg width={40} height={40} viewBox='0 0 40 40'>
        <g opacity={dimmed ? 0.35 : 1}>
          {(['top', 'bottom', 'left', 'right'] as const).map(pos => (
            <path
              key={pos}
              d={FACE_PATHS[pos]}
              fill={colorOf(map[pos])}
              stroke={FACE_STROKE}
              strokeWidth={1}
            />
          ))}
          <rect
            x={13}
            y={13}
            width={14}
            height={14}
            fill={colorOf('O')}
            stroke={FACE_STROKE}
            strokeWidth={1}
          />
        </g>
        {mark && (
          <text
            x={20}
            y={20}
            textAnchor='middle'
            dominantBaseline='central'
            fontSize={tooth.status === 'missing' ? 22 : 15}
            fontWeight={800}
            fill={mark.color}
            style={{ pointerEvents: 'none' }}
          >
            {mark.char}
          </text>
        )}
        {selected && (
          <rect
            x={0.5}
            y={0.5}
            width={39}
            height={39}
            fill='none'
            stroke='#2743A6'
            strokeWidth={2.5}
            rx={4}
          />
        )}
        {tooth.note && <circle cx={35} cy={5} r={3.5} fill='#C2620A' />}
      </svg>
    </button>
  );
}

// --- Arcada -------------------------------------------------------------------
function Arch({
  teethNumbers,
  teeth,
  selected,
  onSelect,
  numbersOnTop,
}: {
  teethNumbers: readonly string[];
  teeth: Map<string, ToothEntry>;
  selected: string | null;
  onSelect: (n: string) => void;
  numbersOnTop: boolean;
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
            // separador visual da linha média (entre 11|21 e 41|31)
            marginLeft: idx === 8 ? '12px' : 0,
          }}
        >
          {numbersOnTop && (
            <span
              style={{ fontSize: '10px', fontWeight: 700, color: '#6A7186' }}
            >
              {n}
            </span>
          )}
          <ToothSvg
            tooth={teeth.get(n) ?? emptyTooth(n)}
            selected={selected === n}
            onSelect={() => onSelect(n)}
          />
          {!numbersOnTop && (
            <span
              style={{ fontSize: '10px', fontWeight: 700, color: '#6A7186' }}
            >
              {n}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Componente principal -----------------------------------------------------
export function Odontograma({
  patientId,
  initialTeeth,
  versionLabel,
  readOnly,
}: {
  patientId: string;
  initialTeeth: ToothEntry[];
  /** ex.: "Versão 3 · 03/08/2026 16:20 · Dr. João Teste" ou null (sem versões) */
  versionLabel: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [teeth, setTeeth] = useState<Map<string, ToothEntry>>(
    () => new Map(initialTeeth.map(t => [t.number, t])),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [state, action, pending] = useActionState<
    ConsultationActionState,
    FormData
  >(saveOdontogramAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) {
      toast.success('Odontograma gravado (nova versão)');
      // Form de página inteira: gravar = fechar → voltar à ficha
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

  // Só dentes com algo assinalado viajam
  const teethJson = useMemo(
    () => JSON.stringify([...teeth.values()].filter(t => !isToothEmpty(t))),
    [teeth],
  );

  const selectedTooth = selected
    ? (teeth.get(selected) ?? emptyTooth(selected))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
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
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: '#6A7186',
              textAlign: 'center',
            }}
          >
            Arcada superior
          </p>
          <Arch
            teethNumbers={UPPER_TEETH}
            teeth={teeth}
            selected={selected}
            onSelect={setSelected}
            numbersOnTop
          />
          <div style={{ height: 10 }} />
          <Arch
            teethNumbers={LOWER_TEETH}
            teeth={teeth}
            selected={selected}
            onSelect={setSelected}
            numbersOnTop={false}
          />
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: '#6A7186',
              textAlign: 'center',
            }}
          >
            Arcada inferior
          </p>

          {/* Legenda */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 16px',
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid #F4F6FB',
              justifyContent: 'center',
            }}
          >
            {FACE_CONDITIONS.map(c => (
              <span
                key={c}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  color: '#3D4257',
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: CONDITION_COLOR[c],
                    display: 'inline-block',
                  }}
                />
                {FACE_CONDITION_LABEL[c]}
              </span>
            ))}
            {Object.entries(STATUS_MARK).map(([st, m]) => (
              <span
                key={st}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  color: '#3D4257',
                }}
              >
                <span style={{ fontWeight: 800, color: m.color }}>
                  {m.char}
                </span>
                {TOOTH_STATUS_LABEL[st as ToothStatus]}
              </span>
            ))}
          </div>
        </div>

        {/* Painel do dente */}
        <div style={{ flex: '0 1 340px', minWidth: 300 }}>
          {selectedTooth ? (
            <ToothDetail
              tooth={selectedTooth}
              onChange={updateTooth}
              readOnly={readOnly}
            />
          ) : (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px dashed #C7CEE0',
                borderRadius: '14px',
                padding: '24px 18px',
                fontSize: '13px',
                color: '#6A7186',
                textAlign: 'center',
              }}
            >
              Clique num dente para {readOnly ? 'ver o detalhe' : 'editar'}.
            </div>
          )}
        </div>
      </div>

      {/* Rodapé: versão + gravação */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
          {versionLabel ?? 'Sem registos anteriores — esta será a versão 1.'}
        </span>
        {!readOnly && (
          <form action={action}>
            <input type='hidden' name='patientId' value={patientId} />
            <input type='hidden' name='teeth' value={teethJson} />
            <Button type='submit' disabled={pending || !dirty}>
              <Save size={15} style={{ marginRight: 6 }} />
              {pending ? 'A gravar…' : 'Gravar odontograma'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
