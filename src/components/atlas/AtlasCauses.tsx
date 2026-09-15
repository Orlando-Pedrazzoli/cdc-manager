// 📄 src/components/atlas/AtlasCauses.tsx
// =============================================================================
// CDC Manager — Atlas: "O que pode explicar este sintoma?" (v2)
// Possibilidades em três grupos — frequentemente associado (realçado pela
// resposta de seguimento), também possível, precisamos de investigar (só
// distinguível com RX) — com o aviso de que não é diagnóstico.
// Modo clínico acrescenta o texto "o que o RX mostra" e o sinal de urgência.
// =============================================================================

'use client';

import { SIGNAL_META, type Cause } from '@/lib/data/atlas';
import { Gloss } from '@/components/atlas/AtlasGlossary';

export function groupCauses(causes: Cause[], emphasize: string[]) {
  const em = (c: Cause) =>
    emphasize.some(e => c.title.toLowerCase().includes(e.toLowerCase()));
  const frequent = causes.filter(em);
  const rest = causes.filter(c => !em(c));
  const investigate = rest.filter(
    c =>
      c.signal === 'urgente' || /fratura|fissura|vertical|raiz/i.test(c.title),
  );
  const possible = rest.filter(c => !investigate.includes(c));
  return { frequent, possible, investigate };
}

const GROUP_META = {
  frequent: {
    label: 'Frequentemente associado',
    dot: '#0F7B4D',
    bg: '#EDF9F2',
  },
  possible: { label: 'Também possível', dot: '#E0A100', bg: '#FFF9EC' },
  investigate: {
    label: 'Precisamos de investigar',
    dot: '#E0782E',
    bg: '#FFF1E8',
  },
} as const;

export function AtlasCauses({
  causes,
  emphasize,
  mode,
}: {
  causes: Cause[];
  emphasize: string[];
  mode: 'clinico' | 'paciente';
}) {
  const large = mode === 'paciente';
  const g = groupCauses(causes, emphasize);
  const groups = (['frequent', 'possible', 'investigate'] as const).filter(
    k => g[k].length > 0,
  );
  if (groups.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map(k => (
        <div key={k}>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: large ? '15px' : '12.5px',
              fontWeight: 800,
              color: GROUP_META[k].dot,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: GROUP_META[k].dot,
                display: 'inline-block',
              }}
            />
            {GROUP_META[k].label}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: large
                ? '1fr'
                : 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 8,
            }}
          >
            {g[k].map(c => (
              <div
                key={c.title}
                style={{
                  borderRadius: '12px',
                  backgroundColor: GROUP_META[k].bg,
                  padding: large ? '14px 16px' : '10px 12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: large ? '18px' : '14px',
                      fontWeight: 700,
                      color: '#1B2A6B',
                    }}
                  >
                    <Gloss text={c.title} />
                  </p>
                  {mode === 'clinico' && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        backgroundColor: SIGNAL_META[c.signal].bg,
                        color: SIGNAL_META[c.signal].fg,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {SIGNAL_META[c.signal].label}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: large ? '16px' : '13px',
                    color: '#1C2233',
                    lineHeight: 1.5,
                  }}
                >
                  <Gloss text={c.explain} />
                </p>
                {mode === 'clinico' && (
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: '12.5px',
                      color: '#2743A6',
                    }}
                  >
                    📷 <Gloss text={c.rx} />
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p
        style={{
          margin: 0,
          fontSize: large ? '13.5px' : '12px',
          color: '#6A7186',
        }}
      >
        Estas são possibilidades, não um diagnóstico. O exame clínico e, quando
        indicado, a radiografia permitem distinguir entre elas.
      </p>
    </div>
  );
}
