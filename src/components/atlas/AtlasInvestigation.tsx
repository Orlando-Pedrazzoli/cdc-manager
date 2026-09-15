// 📄 src/components/atlas/AtlasInvestigation.tsx
// =============================================================================
// CDC Manager — Atlas: "O que estamos a tentar perceber?" (v2)
// Lista que se vai preenchendo: o que a consulta responde (✓ assim que há
// sintoma) e o que só a radiografia responde (○ até ao passo do exame).
// =============================================================================

import { INVESTIGATION } from '@/lib/data/atlas-flow';

export function AtlasInvestigation({
  symptomId,
  rxStage,
  large,
}: {
  symptomId: string;
  /** true a partir do passo "o que precisamos de ver" */
  rxStage: boolean;
  large: boolean;
}) {
  const items = INVESTIGATION[symptomId] ?? [];
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(it => {
        const done = it.via === 'clinic' || rxStage;
        return (
          <div
            key={it.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: large ? '16px' : '13.5px',
              color: done ? '#1C2233' : '#9AA1B4',
            }}
          >
            <span
              style={{
                width: large ? 24 : 20,
                height: large ? 24 : 20,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: done
                  ? it.via === 'rx'
                    ? '#2743A6'
                    : '#0F7B4D'
                  : '#FFFFFF',
                border: `2px solid ${done ? 'transparent' : '#C7CEE0'}`,
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {done ? '✓' : ''}
            </span>
            <span>{it.label}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '11px',
                fontWeight: 700,
                color: it.via === 'rx' ? '#2743A6' : '#0F7B4D',
                whiteSpace: 'nowrap',
              }}
            >
              {it.via === 'rx' ? '📷 radiografia' : '👁️ consulta'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
