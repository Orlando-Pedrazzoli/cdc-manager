// 📄 src/components/dashboard/ProductionCard.tsx
// =============================================================================
// CDC Manager — Dashboard: Produção do mês com contexto
// -----------------------------------------------------------------------------
// "600 € · 1 ato" não diz nada. Aqui: valor do mês, variação vs o MESMO
// intervalo de dias do mês anterior (dia 1–N, comparação honesta), o hoje,
// o sparkline de 30 dias (já existia — SVG puro) e, quando existe, a meta
// mensal = soma dos objetivos dos médicos ativos (Doctor.monthlyGoalCents).
// Sem objetivos definidos, a barra não aparece — nunca inventamos uma meta.
// =============================================================================

import { formatCents } from '@/lib/commissions';
import { ActionLink, C, plural, Section } from './ui';

export function ProductionCard({
  monthCents,
  monthN,
  prevCents,
  todayCents,
  todayN,
  goalCents,
  spark,
}: {
  monthCents: number;
  monthN: number;
  prevCents: number;
  todayCents: number;
  todayN: number;
  goalCents: number;
  spark: number[];
}) {
  const delta =
    prevCents > 0
      ? Math.round(((monthCents - prevCents) / prevCents) * 100)
      : null;
  const up = delta !== null && delta >= 0;
  const goalPct =
    goalCents > 0
      ? Math.min(100, Math.round((monthCents / goalCents) * 100))
      : 0;
  const sparkMax = Math.max(...spark, 0);

  return (
    <Section
      title='Produção'
      action={<ActionLink href='/admin/relatorios'>Ver relatórios</ActionLink>}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: '30px',
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.4px',
              fontVariantNumeric: 'tabular-nums',
              color: C.navy,
            }}
          >
            {formatCents(monthCents)}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: C.muted }}>
            este mês · {monthN} {plural(monthN, 'ato', 'atos')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {delta !== null ? (
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 700,
                color: up ? C.good : C.bad,
              }}
            >
              {up ? '▲' : '▼'} {Math.abs(delta)}% vs. mês anterior
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: C.faint }}>
              Sem histórico para comparar
            </p>
          )}
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.faint }}>
            mesmo período (dia 1 a hoje)
          </p>
        </div>
      </div>

      {/* 30 barras = 30 dias; hoje em verde */}
      {sparkMax > 0 && (
        <svg
          viewBox={`0 0 ${spark.length * 5} 34`}
          preserveAspectRatio='none'
          style={{
            display: 'block',
            width: '100%',
            height: '40px',
            marginTop: '14px',
          }}
          aria-hidden='true'
        >
          {spark.map((v, i) => {
            const h = v > 0 ? Math.max(2, Math.round((v / sparkMax) * 32)) : 1;
            const isToday = i === spark.length - 1;
            return (
              <rect
                key={i}
                x={i * 5}
                y={34 - h}
                width={4}
                height={h}
                rx={1}
                fill={v === 0 ? '#E8EBF4' : isToday ? C.good : '#B8C5F2'}
              />
            );
          })}
        </svg>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '12px',
          fontSize: '12px',
          color: C.muted,
        }}
      >
        <span>
          Hoje:{' '}
          <strong style={{ color: todayCents > 0 ? C.good : C.muted }}>
            {formatCents(todayCents)}
          </strong>{' '}
          ({todayN} {plural(todayN, 'ato', 'atos')})
        </span>
        <span>últimos 30 dias</span>
      </div>

      {goalCents > 0 && (
        <div style={{ marginTop: '14px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: C.muted,
              marginBottom: '5px',
            }}
          >
            <span>
              Objetivo do mês{' '}
              <strong style={{ color: C.navy }}>
                {formatCents(goalCents)}
              </strong>
            </span>
            <span style={{ fontWeight: 700, color: C.navy }}>{goalPct}%</span>
          </div>
          <div
            style={{
              height: '8px',
              borderRadius: '999px',
              backgroundColor: C.line,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${goalPct}%`,
                borderRadius: '999px',
                backgroundColor: goalPct >= 100 ? C.good : C.action,
              }}
            />
          </div>
          {monthCents < goalCents && (
            <p style={{ margin: '5px 0 0', fontSize: '12px', color: C.faint }}>
              Faltam {formatCents(goalCents - monthCents)}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
