// 📄 src/components/dashboard/ui.tsx
// =============================================================================
// CDC Manager — Dashboard: primitivos visuais partilhados
// -----------------------------------------------------------------------------
// Server Components puros (sem estado). Tokens semânticos da dashboard v2:
// o azul é NAVEGAÇÃO e AÇÃO; o estado carrega cor própria — verde concluído,
// âmbar atenção, vermelho problema, cinza secundário. Um cartão com borda
// é reservado a blocos independentes; números "soltos" vivem na faixa Hoje.
// =============================================================================

import Link from 'next/link';
import type { ReactNode } from 'react';

export const C = {
  navy: '#1B2A6B',
  action: '#2743A6',
  text: '#1C2233',
  muted: '#6A7186',
  faint: '#9AA1B4',
  line: '#EEF1F8',
  lineSoft: '#F4F6FB',
  good: '#0F7B4D',
  goodBg: '#E7F5EC',
  warn: '#8A5A00',
  warnBg: '#FFF4E0',
  bad: '#B3261E',
  badBg: '#FDF3F2',
  infoBg: '#E4EBFF',
  neutralBg: '#EAECF3',
  neutralFg: '#3D4257',
} as const;

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad';

export const TONE: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: C.neutralFg, bg: C.neutralBg },
  info: { fg: C.navy, bg: C.infoBg },
  good: { fg: C.good, bg: C.goodBg },
  warn: { fg: C.warn, bg: C.warnBg },
  bad: { fg: C.bad, bg: C.badBg },
};

export const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: `1px solid ${C.line}`,
  borderRadius: '14px',
  overflow: 'hidden',
};

/** Pastilha de estado — a cor diz o estado, o texto confirma */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: '999px',
        padding: '2px 9px',
        fontSize: '11px',
        fontWeight: 700,
        lineHeight: '16px',
        backgroundColor: t.bg,
        color: t.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Link de ação específico ("Ver cobranças", nunca "Abrir") */
export function ActionLink({
  href,
  children,
  small,
}: {
  href: string;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: small ? '12px' : '13px',
        fontWeight: 600,
        color: C.action,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Link>
  );
}

/**
 * Bloco independente com cabeçalho. `titleTone` colore o título quando o
 * bloco em si é um alerta (faltas) — o resto fica em navy.
 */
export function Section({
  title,
  icon,
  action,
  titleColor,
  children,
  flush,
}: {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  titleColor?: string;
  children: ReactNode;
  /** Conteúdo sem padding (listas com linhas até à borda) */
  flush?: boolean;
}) {
  return (
    <section style={card}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 18px',
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 700,
            color: titleColor ?? C.navy,
          }}
        >
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div style={flush ? undefined : { padding: '14px 18px' }}>{children}</div>
    </section>
  );
}

/** Linha de lista: hora à esquerda, nome + subtítulo, meta à direita */
export function Row({
  first,
  time,
  timeColor,
  title,
  titleHref,
  subtitle,
  meta,
}: {
  first: boolean;
  time?: string;
  timeColor?: string;
  title: string;
  titleHref?: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  const name = (
    <span
      style={{
        fontSize: '14px',
        fontWeight: 600,
        color: C.text,
        textDecoration: 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
      }}
    >
      {title}
    </span>
  );
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 18px',
        borderTop: first ? 'none' : `1px solid ${C.lineSoft}`,
      }}
    >
      {time && (
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: timeColor ?? C.navy,
            width: 44,
            flexShrink: 0,
          }}
        >
          {time}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {titleHref ? (
          <Link href={titleHref} style={{ textDecoration: 'none' }}>
            {name}
          </Link>
        ) : (
          name
        )}
        {subtitle && (
          <p
            style={{
              margin: '1px 0 0',
              fontSize: '12px',
              color: C.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {meta && <div className='cdc-row-meta'>{meta}</div>}
    </div>
  );
}

export function EmptyLine({
  text,
  action,
}: {
  text: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 18px',
      }}
    >
      <p style={{ margin: 0, fontSize: '13px', color: C.faint }}>{text}</p>
      {action}
    </div>
  );
}

export const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);
