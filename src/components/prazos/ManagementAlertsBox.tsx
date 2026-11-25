// 📄 src/components/prazos/ManagementAlertsBox.tsx
// =============================================================================
// CDC Manager — Caixa "Avisos da gestão" (8.ª ronda/09, 16, 17, 18)
// Server Component: recebe os avisos já calculados e ordenados.
// =============================================================================

import Link from 'next/link';
import type {
  ManagementAlert,
  ManagementAlertKind,
} from '@/lib/management-alerts';

const KIND_LABEL: Record<ManagementAlertKind, string> = {
  birthday: 'Aniversário',
  'doctor-document': 'Documento',
  partner: 'Renovação',
  contract: 'Contrato',
  'patient-access': 'Acesso a fichas',
};

const LEVEL_STYLE = {
  urgent: { bg: '#FDECEA', border: '#F2B8B5', fg: '#8A1C13' },
  warning: { bg: '#FFF4D6', border: '#EBCB74', fg: '#6B5200' },
  info: { bg: '#EAF2FF', border: '#BCD0F5', fg: '#1B3A8F' },
} as const;

export function ManagementAlertsBox({
  alerts,
  title = 'Avisos da gestão',
  emptyText = 'Sem avisos: nenhum aniversário esta semana, nenhum contrato a terminar e nenhum prazo a expirar.',
  footerHref = '/admin/prazos',
  footerLabel = 'Ver todos os prazos',
}: {
  alerts: ManagementAlert[];
  title?: string;
  emptyText?: string | null;
  footerHref?: string | null;
  footerLabel?: string;
}) {
  if (alerts.length === 0 && !emptyText) return null;
  const urgent = alerts.filter(a => a.level === 'urgent').length;
  return (
    <section
      style={{
        backgroundColor: '#FFFFFF',
        border: urgent > 0 ? '1px solid #F2B8B5' : '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: alerts.length ? 10 : 4,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1C2233' }}>
          {title}
          {alerts.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: '12px', fontWeight: 600, color: urgent ? '#B3261E' : '#6A7186' }}>
              {alerts.length}
              {urgent > 0 ? ` · ${urgent} urgente${urgent === 1 ? '' : 's'}` : ''}
            </span>
          )}
        </h2>
        {footerHref && (
          <Link href={footerHref} style={{ fontSize: '12px', fontWeight: 600, color: '#2743A6' }}>
            {footerLabel} →
          </Link>
        )}
      </div>
      {alerts.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>{emptyText}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a, i) => {
            const s = LEVEL_STYLE[a.level];
            const body = (
              <>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '10px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: s.fg,
                    minWidth: 78,
                  }}
                >
                  {KIND_LABEL[a.kind]}
                </span>
                <span style={{ fontSize: '13px', color: '#1C2233' }}>{a.text}</span>
              </>
            );
            const style: React.CSSProperties = {
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
              textDecoration: 'none',
            };
            return (
              <li key={`${a.kind}-${a.subject}-${a.date}-${i}`}>
                {a.href ? (
                  <Link href={a.href} style={style}>
                    {body}
                  </Link>
                ) : (
                  <div style={style}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
