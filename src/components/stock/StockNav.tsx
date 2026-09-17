// 📄 src/components/stock/StockNav.tsx
// =============================================================================
// CDC Manager — Stock: separadores Catálogo | Locais (set/2026)
// Server Component simples; o ativo é decidido pela página que o inclui.
// =============================================================================

import Link from 'next/link';

const TABS = [
  { href: '/admin/stock', label: 'Catálogo e armazém' },
  { href: '/admin/stock/locais', label: 'Locais e gabinetes' },
] as const;

export function StockNav({
  active,
}: {
  active: (typeof TABS)[number]['href'];
}) {
  return (
    <nav style={{ display: 'flex', gap: 6, borderBottom: '1px solid #EEF1F8' }}>
      {TABS.map(t => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: on ? '#1B2A6B' : '#6A7186',
              textDecoration: 'none',
              borderBottom: on ? '2px solid #1B2A6B' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
