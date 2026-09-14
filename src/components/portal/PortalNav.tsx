// 📄 src/components/portal/PortalNav.tsx
// =============================================================================
// CDC Manager — Navegação do Portal do Paciente
// -----------------------------------------------------------------------------
// Tabs horizontais mobile-first (o paciente acede quase sempre pelo
// telemóvel): deslizáveis em ecrãs estreitos, centradas em desktop.
// Client component só pelo usePathname — zero estado próprio.
// Ativo por prefixo, com guarda para '/conta' não ficar ativo em tudo.
// =============================================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/conta', label: 'Início' },
  { href: '/conta/marcacoes', label: 'Marcações' },
  { href: '/conta/anamnese', label: 'Anamnese' },
  { href: '/conta/documentos', label: 'Documentos' },
  { href: '/conta/dados', label: 'Os meus dados' },
] as const;

export default function PortalNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/conta' ? pathname === '/conta' : pathname.startsWith(href);

  return (
    <nav
      aria-label='Navegação do portal'
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E4E8F2',
        overflowX: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          display: 'flex',
          gap: '4px',
          padding: '0 12px',
        }}
      >
        {TABS.map(tab => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '12px 14px',
                fontSize: '13px',
                fontWeight: active ? 700 : 500,
                color: active ? '#1B2A6B' : '#6A7186',
                borderBottom: active
                  ? '2px solid #1B2A6B'
                  : '2px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}