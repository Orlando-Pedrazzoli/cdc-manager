// 📄 src/components/dashboard/CollectCard.tsx
// =============================================================================
// CDC Manager — Dashboard: Por cobrar (o KPI financeiro operacional)
// -----------------------------------------------------------------------------
// Dinheiro que o paciente ainda deve por atos executados (completed sem
// fatura), qualquer data. Ganha destaque próprio e desdobra por clínica —
// o gestor percebe num relance se há um problema financeiro e onde.
// Amanhã por confirmar entra aqui como segunda pendência do balcão.
// =============================================================================

import { formatCents } from '@/lib/commissions';
import { ActionLink, C, plural, Section } from './ui';

export function CollectCard({
  totalCents,
  totalN,
  byClinic,
  pendingTomorrow,
  tomorrowHref,
}: {
  totalCents: number;
  totalN: number;
  byClinic: { name: string; cents: number; n: number }[];
  pendingTomorrow: number;
  tomorrowHref: string;
}) {
  const hasDebt = totalCents > 0;
  return (
    <Section
      title='Por cobrar'
      action={<ActionLink href='/admin/cobranca'>Ver cobranças</ActionLink>}
    >
      <p
        style={{
          margin: 0,
          fontSize: '30px',
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.4px',
          fontVariantNumeric: 'tabular-nums',
          color: hasDebt ? C.navy : C.good,
        }}
      >
        {formatCents(totalCents)}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: '13px', color: C.muted }}>
        {hasDebt
          ? `${totalN} ${plural(totalN, 'ato aguarda', 'atos aguardam')} cobrança`
          : 'Tudo cobrado'}
      </p>

      {hasDebt && byClinic.length > 1 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: `1px solid ${C.lineSoft}`,
          }}
        >
          {byClinic.map(c => (
            <div
              key={c.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                color: C.muted,
              }}
            >
              <span>{c.name}</span>
              <span
                style={{
                  fontWeight: 600,
                  color: C.text,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCents(c.cents)}{' '}
                <span style={{ color: C.faint, fontWeight: 500 }}>
                  · {c.n} {plural(c.n, 'ato', 'atos')}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '14px',
          paddingTop: '12px',
          borderTop: `1px solid ${C.lineSoft}`,
        }}
      >
        <span style={{ fontSize: '13px', color: C.muted }}>
          Amanhã por confirmar:{' '}
          <strong style={{ color: pendingTomorrow > 0 ? C.warn : C.good }}>
            {pendingTomorrow}
          </strong>
        </span>
        <ActionLink href={tomorrowHref} small>
          {pendingTomorrow > 0 ? 'Ligar a confirmar' : 'Ver amanhã'}
        </ActionLink>
      </div>
    </Section>
  );
}
