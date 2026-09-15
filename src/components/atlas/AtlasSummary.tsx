// 📄 src/components/atlas/AtlasSummary.tsx
// =============================================================================
// CDC Manager — Atlas: "O que percebemos até agora" (v2) — resumo para o
// paciente no fim da jornada. Nada é gravado.
// =============================================================================

import {
  INVESTIGATION,
  EXAM_COMPARE,
  type ExamRecommendation,
} from '@/lib/data/atlas-flow';

export function AtlasSummary({
  fdi,
  toothName,
  symptomLabel,
  followUpLabel,
  symptomId,
  recommendation,
  large,
}: {
  fdi: string;
  toothName: string;
  symptomLabel: string;
  followUpLabel: string | null;
  symptomId: string;
  recommendation: ExamRecommendation;
  large: boolean;
}) {
  const rxItems = (INVESTIGATION[symptomId] ?? []).filter(i => i.via === 'rx');
  const row = (l: string, v: string) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: 10,
        fontSize: large ? '16px' : '13.5px',
      }}
    >
      <span style={{ color: '#6A7186' }}>{l}</span>
      <span style={{ color: '#1C2233', fontWeight: 600 }}>{v}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {row('Dente', `${fdi} — ${toothName}`)}
      {row(
        'Queixa',
        symptomLabel + (followUpLabel ? ` · ${followUpLabel}` : ''),
      )}
      <div>
        <p
          style={{
            margin: '0 0 4px',
            fontSize: large ? '16px' : '13.5px',
            color: '#6A7186',
          }}
        >
          Estamos a investigar
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            fontSize: large ? '16px' : '13.5px',
            color: '#1C2233',
            lineHeight: 1.6,
          }}
        >
          {rxItems.map(i => (
            <li key={i.label}>{i.label}</li>
          ))}
        </ul>
      </div>
      <div
        style={{
          borderRadius: '12px',
          backgroundColor: '#EEF2FF',
          padding: large ? '14px 16px' : '10px 12px',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: large ? '14px' : '12px',
            fontWeight: 800,
            color: '#2743A6',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}
        >
          Próximo passo
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: large ? '17px' : '14px',
            color: '#1B2A6B',
            fontWeight: 700,
          }}
        >
          {EXAM_COMPARE[recommendation.exam].name}
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: large ? '15px' : '13px',
            color: '#3D4257',
          }}
        >
          O exame recomendado ajuda-nos a ver estas estruturas, que não
          conseguimos avaliar completamente só olhando para o dente.
        </p>
      </div>
      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Este resumo é educativo e não fica registado no processo clínico. O
        diagnóstico faz-se na consulta.
      </p>
    </div>
  );
}
