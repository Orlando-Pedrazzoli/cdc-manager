// 📄 src/components/dashboard/ClinicCard.tsx
// =============================================================================
// CDC Manager — Dashboard: Clinic Overview (um cartão por clínica)
// -----------------------------------------------------------------------------
// Permite comparar as clínicas lado a lado: ocupação (minutos bloqueantes ÷
// abertura × gabinetes), consultas do dia com o seu progresso, o que está a
// acontecer AGORA, produção e por cobrar. Uma 3.ª clínica = zero código.
// =============================================================================

import { formatCents } from '@/lib/commissions';
import { ActionLink, C, plural, Section } from './ui';

export function ClinicCard({
  name,
  slug,
  badge,
  occupancyPct,
  isOpen,
  total,
  done,
  toConfirm,
  missed,
  inProgress,
  waiting,
  executedCents,
  executedN,
  collectCents,
}: {
  name: string;
  slug: string;
  badge: { bg: string; fg: string; label: string };
  occupancyPct: number;
  isOpen: boolean;
  total: number;
  done: number;
  toConfirm: number;
  missed: number;
  inProgress: number;
  waiting: number;
  executedCents: number;
  executedN: number;
  collectCents: number;
}) {
  const occColor =
    occupancyPct >= 85 ? C.good : occupancyPct >= 50 ? C.action : '#8FA0DC';
  const stat = (label: string, value: string, color?: string) => (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: '12px', color: C.muted }}>{label}</p>
      <p
        style={{
          margin: '2px 0 0',
          fontSize: '16px',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: color ?? C.navy,
        }}
      >
        {value}
      </p>
    </div>
  );

  return (
    <Section
      title={name}
      action={
        <span
          style={{
            borderRadius: '999px',
            padding: '2px 10px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: badge.bg,
            color: badge.fg,
          }}
        >
          {badge.label}
        </span>
      }
    >
      {isOpen ? (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '5px',
            }}
          >
            <span style={{ fontSize: '12px', color: C.muted }}>
              Ocupação hoje
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: C.navy }}>
              {occupancyPct}%
            </span>
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
                width: `${occupancyPct}%`,
                borderRadius: '999px',
                backgroundColor: occColor,
              }}
            />
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '13px', color: C.faint }}>
          Fechada hoje
        </p>
      )}

      {(inProgress > 0 || waiting > 0) && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: '13px',
            fontWeight: 600,
            color: C.good,
          }}
        >
          Agora: {inProgress > 0 ? `${inProgress} em curso` : ''}
          {inProgress > 0 && waiting > 0 ? ' · ' : ''}
          {waiting > 0 ? `${waiting} em espera` : ''}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '10px 16px',
          marginTop: '14px',
        }}
      >
        {stat('Consultas', `${total}`)}
        {stat('Concluídas', `${done}`, done > 0 ? C.good : undefined)}
        {stat(
          'Por confirmar',
          `${toConfirm}`,
          toConfirm > 0 ? C.warn : undefined,
        )}
        {stat(
          missed === 1 ? 'Falta / cancelada' : 'Faltas / canceladas',
          `${missed}`,
          missed > 0 ? C.bad : undefined,
        )}
        {stat(
          'Produção hoje',
          formatCents(executedCents),
          executedCents > 0 ? C.good : undefined,
        )}
        {stat('Por cobrar', formatCents(collectCents))}
      </div>
      {executedN > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: C.faint }}>
          {executedN} {plural(executedN, 'ato executado', 'atos executados')}
        </p>
      )}

      <div style={{ marginTop: '14px' }}>
        <ActionLink href={`/admin/agenda?clinic=${slug}`}>
          Abrir agenda de {badge.label}
        </ActionLink>
      </div>
    </Section>
  );
}
