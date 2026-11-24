// 📄 src/components/atlas/AtlasToothPicker.tsx
// =============================================================================
// CDC Manager — Atlas Dentário: escolher o dente no odontograma novo
// -----------------------------------------------------------------------------
// O Atlas usa agora o MESMO odontograma da ficha do paciente (admin e
// médico), nas duas vistas: ANATÓMICO (dentes de anatomia real) e PACIENTE 3D
// (roda e abre, para mostrar ao paciente). Substitui o desenho antigo das
// arcadas (OdontogramaArcada), que deixou de existir.
// Aqui não há paciente: todos os dentes estão "presentes" e sem registos —
// o mapa serve só para apontar o dente de que se está a falar.
// O 3D (three.js) só é descarregado quando a vista é aberta.
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { Rotate3d, Smile } from 'lucide-react';
import { LOWER_TEETH, UPPER_TEETH } from '@/lib/domain';
import type { ToothChartState } from '@/lib/odontogram-chart';
import { EMPTY_STATE } from '@/components/clinico/odontograma/chart-style';
import { OdontogramaAnatomico } from '@/components/clinico/odontograma/OdontogramaAnatomico';
import { OdontogramaPaciente3D } from '@/components/clinico/odontograma/OdontogramaPaciente3D';

export type AtlasChartView = 'anatomico' | '3d';

const VIEWS = [
  { id: 'anatomico', label: 'Anatómico', icon: Smile },
  { id: '3d', label: 'Paciente 3D', icon: Rotate3d },
] as const;

const NO_NOTES = new Map<string, string | null>();

export function AtlasToothPicker({
  selected,
  onSelect,
  defaultView,
}: {
  selected: string | null;
  onSelect: (toothNumber: string) => void;
  /** vista com que abre — o médico pode trocar a qualquer momento */
  defaultView: AtlasChartView;
}) {
  const [choice, setChoice] = useState<AtlasChartView | null>(null);
  const view = choice ?? defaultView;

  const states = useMemo(() => {
    const map = new Map<string, ToothChartState>();
    for (const n of [...UPPER_TEETH, ...LOWER_TEETH])
      map.set(n, EMPTY_STATE(n));
    return map;
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '14px',
      }}
    >
      {/* mesmo comutador da ficha do paciente (clinico/Odontograma) */}
      <div
        role='group'
        aria-label='Vista do odontograma'
        style={{
          display: 'inline-flex',
          border: '1px solid #D5DBEA',
          borderRadius: '9px',
          overflow: 'hidden',
          marginBottom: '12px',
        }}
      >
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type='button'
            onClick={() => setChoice(id)}
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

      {view === '3d' ? (
        <OdontogramaPaciente3D
          states={states}
          selected={selected}
          onSelect={onSelect}
          legend={false}
          hint='toque no dente de que estamos a falar'
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <OdontogramaAnatomico
            states={states}
            notes={NO_NOTES}
            selected={selected}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}
