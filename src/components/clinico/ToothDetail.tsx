// 📄 src/components/clinico/ToothDetail.tsx
// =============================================================================
// CDC Manager — Clínico: painel de edição de um dente (Client Component)
// -----------------------------------------------------------------------------
// Editor do dente selecionado no odontograma: estado global do dente,
// condição por face (O/M/D/V/L, uma condição por face) e nota curta.
// Componente CONTROLADO — o estado vive no Odontograma (pai), que é quem
// grava a versão completa.
// =============================================================================

'use client';

import Link from 'next/link';
import { Eraser, ClipboardPlus } from 'lucide-react';
import {
  TOOTH_STATUS,
  TOOTH_STATUS_LABEL,
  FACE_CONDITIONS,
  FACE_CONDITION_LABEL,
  TOOTH_FACES,
  TOOTH_FACE_LABEL,
  type ToothStatus,
  type FaceCondition,
  type ToothFace,
} from '@/lib/domain';
import type { ToothChartState, ChartLayer } from '@/lib/odontogram-chart';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

export interface ToothEntry {
  number: string;
  status: ToothStatus;
  faces: { face: ToothFace; condition: FaceCondition }[];
  note: string | null;
}

/** Dente "limpo" (presente e são) — equivale a não constar da versão */
export function emptyTooth(number: string): ToothEntry {
  return { number, status: 'present', faces: [], note: null };
}

export function isToothEmpty(t: ToothEntry): boolean {
  return t.status === 'present' && t.faces.length === 0 && !t.note;
}

/** Fase 4C (P13): atos ligados ao dente — planeados e executados */
export interface ToothProcedure {
  id: string;
  name: string;
  status: 'planned' | 'completed' | 'invoiced' | 'void';
  dateLabel: string | null;
  priceCents: number;
}

const LAYER_COLOR: Record<ChartLayer, string> = { existing: '#0F7B4D', completed: '#2743A6', planned: '#E0A100' };
const LAYER_LABEL: Record<ChartLayer, string> = { existing: 'existente', completed: 'executado', planned: 'planeado' };

function fmtShort(d: Date | null): string {
  return d ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(d) : '—';
}

/** O que o mapa mostra para este dente (derivado) + historial de eventos */
function DerivedSummary({ d }: { d: ToothChartState }) {
  const facesTxt = Object.entries(d.faces).map(([f, v]) => `${f}: ${FACE_CONDITION_LABEL[v.condition as FaceCondition]} (${LAYER_LABEL[v.layer]})`);
  return (
    <div style={{ backgroundColor: '#F4F6FB', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7186' }}>No mapa</span>
      <span style={{ fontSize: '13px', color: '#1C2233' }}>
        <strong>{TOOTH_STATUS_LABEL[d.status]}</strong>
        {d.statusLayer && <span style={{ color: LAYER_COLOR[d.statusLayer], fontWeight: 700 }}> · {LAYER_LABEL[d.statusLayer]}</span>}
        {d.endo && <span style={{ color: LAYER_COLOR[d.endo] }}> · endodontia</span>}
        {d.post && <span style={{ color: LAYER_COLOR[d.post] }}> · espigão</span>}
        {d.veneer && <span style={{ color: LAYER_COLOR[d.veneer] }}> · faceta</span>}
      </span>
      {facesTxt.length > 0 && <span style={{ fontSize: '12px', color: '#3D4257' }}>{facesTxt.join(' · ')}</span>}
      {d.events.length > 0 && (
        <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {d.events.map((e, i) => (
            <li key={`${e.ref?.id ?? i}`} style={{ fontSize: '12px', color: '#1C2233', display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: LAYER_COLOR[e.layer], flexShrink: 0, display: 'inline-block', position: 'relative', top: -1 }} />
              <span style={{ color: '#6A7186', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtShort(e.at)}</span>
              <span>{e.label}{e.faces?.length ? ` (${e.faces.join(',')})` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ToothDetail({
  tooth,
  derived = null,
  onChange,
  readOnly,
  procedures = [],
  planHref,
}: {
  tooth: ToothEntry;
  /** Estado derivado (camadas) mostrado no mapa — só leitura */
  derived?: ToothChartState | null;
  onChange: (next: ToothEntry) => void;
  readOnly: boolean;
  /** Histórico do dente (Procedure.toothNumbers ∋ este dente) */
  procedures?: ToothProcedure[];
  /** Link "Planear tratamento neste dente" (só na área do médico) */
  planHref?: string | null;
}) {
  const conditionOf = (face: ToothFace): FaceCondition | '' =>
    tooth.faces.find(f => f.face === face)?.condition ?? '';

  const setFace = (face: ToothFace, condition: FaceCondition | '') => {
    const others = tooth.faces.filter(f => f.face !== face);
    onChange({
      ...tooth,
      faces: condition ? [...others, { face, condition }] : others,
    });
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1B2A6B' }}>
          Dente {tooth.number}
        </span>
        {!readOnly && !isToothEmpty(tooth) && (
          <Button
            type='button'
            variant='secondary'
            onClick={() => onChange(emptyTooth(tooth.number))}
          >
            <Eraser size={14} style={{ marginRight: 5 }} />
            Limpar dente
          </Button>
        )}
      </div>

      {derived && <DerivedSummary d={derived} />}

      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6A7186' }}>
        Registo manual (camada existente)
      </p>

      <Select
        label='Estado do dente'
        value={tooth.status}
        disabled={readOnly}
        onChange={e =>
          onChange({ ...tooth, status: e.target.value as ToothStatus })
        }
      >
        {TOOTH_STATUS.map(st => (
          <option key={st} value={st}>
            {TOOTH_STATUS_LABEL[st]}
          </option>
        ))}
      </Select>

      <div>
        <p
          style={{
            margin: '0 0 8px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#3D4257',
          }}
        >
          Condições por face
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {TOOTH_FACES.map(face => (
            <div
              key={face}
              style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <span
                style={{
                  width: 110,
                  fontSize: '13px',
                  color: '#3D4257',
                  flexShrink: 0,
                }}
              >
                <strong>{face}</strong> · {TOOTH_FACE_LABEL[face]}
              </span>
              <div style={{ flex: 1 }}>
                <Select
                  value={conditionOf(face)}
                  disabled={readOnly}
                  onChange={e =>
                    setFace(face, e.target.value as FaceCondition | '')
                  }
                >
                  <option value=''>— Sã —</option>
                  {FACE_CONDITIONS.map(c => (
                    <option key={c} value={c}>
                      {FACE_CONDITION_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Input
        label='Nota do dente'
        value={tooth.note ?? ''}
        disabled={readOnly}
        maxLength={200}
        placeholder='ex.: sensibilidade ao frio'
        onChange={e => onChange({ ...tooth, note: e.target.value || null })}
      />

      {/* Fase 4C: tratamentos deste dente + orçamento a partir daqui */}
      <div
        style={{
          borderTop: '1px solid #EEF1F8',
          paddingTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#1B2A6B' }}>
            Tratamentos no dente {tooth.number}
          </span>
          {planHref && (
            <Link
              href={planHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '12px',
                fontWeight: 700,
                color: '#FFFFFF',
                backgroundColor: '#2743A6',
                borderRadius: '8px',
                padding: '6px 10px',
                textDecoration: 'none',
              }}
            >
              <ClipboardPlus size={13} />
              Planear tratamento
            </Link>
          )}
        </div>
        {procedures.length === 0 ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
            Sem atos registados neste dente.
          </p>
        ) : (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {procedures.map(p => (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: '12px',
                  color: p.status === 'void' ? '#9AA1B4' : '#1C2233',
                  textDecoration: p.status === 'void' ? 'line-through' : 'none',
                }}
              >
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      marginRight: 6,
                      backgroundColor:
                        p.status === 'planned'
                          ? '#E0A100'
                          : p.status === 'void'
                            ? '#C7CEE0'
                            : '#0F7B4D',
                    }}
                  />
                  {p.name}
                  <span style={{ color: '#9AA1B4' }}>
                    {' '}
                    ·{' '}
                    {p.status === 'planned'
                      ? 'planeado'
                      : (p.dateLabel ?? 'executado')}
                  </span>
                </span>
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(p.priceCents / 100).toLocaleString('pt-PT', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
