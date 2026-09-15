// 📄 src/components/atlas/AtlasSymptomFlow.tsx
// =============================================================================
// CDC Manager — Atlas: "O que está a sentir?" + pergunta de seguimento (v2)
// Uma pergunta de cada vez. Botões grandes em modo paciente.
// =============================================================================

'use client';

import { SYMPTOMS } from '@/lib/data/atlas';
import { FOLLOW_UPS, SYMPTOM_ICON } from '@/lib/data/atlas-flow';

export function AtlasSymptomPicker({
  value,
  onChange,
  large,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  large: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: large
          ? 'repeat(auto-fit, minmax(220px, 1fr))'
          : 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 8,
      }}
    >
      {SYMPTOMS.map(s => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type='button'
            onClick={() => onChange(active ? null : s.id)}
            aria-pressed={active}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: large ? '14px 16px' : '10px 12px',
              borderRadius: '12px',
              border: `2px solid ${active ? '#2743A6' : '#D8DEEF'}`,
              backgroundColor: active ? '#2743A6' : '#FFFFFF',
              color: active ? '#FFFFFF' : '#1B2A6B',
              fontSize: large ? '16px' : '13.5px',
              fontWeight: 700,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: large ? 22 : 18 }}>
              {SYMPTOM_ICON[s.id] ?? '•'}
            </span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function AtlasFollowUp({
  symptomId,
  value,
  onChange,
  large,
}: {
  symptomId: string;
  value: string | null;
  onChange: (key: string | null) => void;
  large: boolean;
}) {
  const fu = FOLLOW_UPS[symptomId];
  if (!fu) return null;
  const chosen = fu.options.find(o => o.key === value) ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p
        style={{
          margin: 0,
          fontSize: large ? '20px' : '15px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        {fu.question}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {fu.options.map(o => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type='button'
              onClick={() => onChange(active ? null : o.key)}
              style={{
                padding: large ? '12px 18px' : '9px 14px',
                borderRadius: 999,
                border: `2px solid ${active ? '#0F7B4D' : '#D8DEEF'}`,
                backgroundColor: active ? '#E7F6EC' : '#FFFFFF',
                color: active ? '#0F5C3A' : '#1B2A6B',
                fontSize: large ? '16px' : '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {chosen && (
        <p
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: '#F8F9FD',
            borderLeft: '4px solid #2743A6',
            fontSize: large ? '16px' : '13.5px',
            color: '#1C2233',
          }}
        >
          {chosen.note}
        </p>
      )}
    </div>
  );
}
