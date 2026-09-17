// 📄 src/components/dashboard/HojeStrip.tsx
// =============================================================================
// CDC Manager — Dashboard: faixa "Hoje"
// -----------------------------------------------------------------------------
// Os 6 números que a receção/gestor precisa de ver antes de tudo. Sem caixas
// individuais (evita card→card→card): um único bloco, colunas separadas por
// filete (globals.css .cdc-dash-hoje). Cada número é um link para a ação
// correspondente. 6 → 3 → 2 colunas conforme a largura; com ≤4 itens
// (dashboard do médico) a faixa é 4 → 2 → 2 (.cdc-dash-hoje-4).
// =============================================================================

import Link from 'next/link';
import { C, type Tone, TONE } from './ui';

export type HojeItem = {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  /** Cor do valor quando há algo a fazer (warn/bad) ou correu bem (good) */
  tone?: Tone;
};

export function HojeStrip({ items }: { items: HojeItem[] }) {
  return (
    <div
      className={`cdc-dash-hoje${items.length <= 4 ? ' cdc-dash-hoje-4' : ''}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: `1px solid ${C.line}`,
        borderRadius: '14px',
        padding: '14px 4px',
      }}
    >
      {items.map(it => {
        const color =
          it.tone && it.tone !== 'neutral' ? TONE[it.tone].fg : C.navy;
        const body = (
          <div style={{ padding: '2px 16px', minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 500,
                color: C.muted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {it.label}
            </p>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '26px',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.3px',
                fontVariantNumeric: 'tabular-nums',
                color,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {it.value}
            </p>
            {it.sub && (
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '12px',
                  color: C.faint,
                  lineHeight: 1.3,
                }}
              >
                {it.sub}
              </p>
            )}
          </div>
        );
        return it.href ? (
          <Link
            key={it.label}
            href={it.href}
            title={it.label}
            style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}
          >
            {body}
          </Link>
        ) : (
          <div key={it.label} style={{ minWidth: 0 }}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
