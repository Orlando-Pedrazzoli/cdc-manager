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

import { Eraser } from 'lucide-react';
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

export function ToothDetail({
  tooth,
  onChange,
  readOnly,
}: {
  tooth: ToothEntry;
  onChange: (next: ToothEntry) => void;
  readOnly: boolean;
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
    </div>
  );
}
