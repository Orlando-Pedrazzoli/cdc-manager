// 📄 src/components/atlas/AtlasRadiography.tsx
// =============================================================================
// CDC Manager — Atlas: "Qual exame responde à nossa dúvida?" (v2)
// Comparação visual periapical vs panorâmica, com o exame recomendado em
// destaque e o PORQUÊ em linguagem de pergunta clínica → exame.
// =============================================================================

import {
  EXAM_COMPARE,
  type ExamRecommendation,
  type ExamKind,
} from '@/lib/data/atlas-flow';
import { Gloss } from '@/components/atlas/AtlasGlossary';

export function AtlasRadiography({
  recommendation,
  large,
}: {
  recommendation: ExamRecommendation;
  large: boolean;
}) {
  const kinds: ExamKind[] = ['periapical', 'panoramica'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 10,
        }}
      >
        {kinds.map(k => {
          const e = EXAM_COMPARE[k];
          const rec = recommendation.exam === k;
          return (
            <div
              key={k}
              style={{
                borderRadius: '14px',
                border: `2px solid ${rec ? '#2743A6' : '#EEF1F8'}`,
                backgroundColor: rec ? '#EEF2FF' : '#FFFFFF',
                padding: large ? '16px 18px' : '12px 14px',
                position: 'relative',
              }}
            >
              {rec && (
                <span
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: 12,
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: 999,
                    backgroundColor: '#2743A6',
                    color: '#FFFFFF',
                  }}
                >
                  RECOMENDADO
                </span>
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: large ? '19px' : '15px',
                  fontWeight: 800,
                  color: '#1B2A6B',
                }}
              >
                {k === 'periapical' ? '🔍' : '🗺️'} {e.name}
              </p>
              <p
                style={{
                  margin: '2px 0 8px',
                  fontSize: large ? '14px' : '12.5px',
                  color: '#6A7186',
                }}
              >
                {e.tagline} · {e.scope}
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: large ? '15px' : '13px',
                  color: '#1C2233',
                  lineHeight: 1.6,
                }}
              >
                {e.sees.map(s => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div
        style={{
          borderRadius: '12px',
          backgroundColor: '#1B2A6B',
          color: '#FFFFFF',
          padding: large ? '16px 18px' : '12px 14px',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: large ? '14px' : '12px',
            fontWeight: 800,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            opacity: 0.8,
          }}
        >
          Porque{' '}
          {recommendation.exam === 'panoramica'
            ? 'uma panorâmica'
            : 'um RX do dente'}
          ?
        </p>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: large ? '17px' : '14px',
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: '#FFFFFF' }}>
            <Gloss text={recommendation.why} />
          </span>
        </p>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: large ? '14px' : '12.5px',
            opacity: 0.85,
          }}
        >
          Neste caso interessa-nos sobretudo:{' '}
          {recommendation.focus.map(f => (
            <span
              key={f}
              style={{
                display: 'inline-block',
                margin: '2px 4px 0 0',
                padding: '2px 8px',
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
            >
              🔴 {f}
            </span>
          ))}
        </p>
        <p
          style={{
            margin: '10px 0 0',
            fontSize: large ? '14px' : '12.5px',
            opacity: 0.8,
          }}
        >
          O exame clínico mostra-nos algumas coisas. A radiografia permite
          observar estruturas dentro do osso que não conseguimos ver
          diretamente.
        </p>
      </div>
    </div>
  );
}
