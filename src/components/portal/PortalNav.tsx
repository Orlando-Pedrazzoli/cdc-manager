// 📄 src/components/portal/PortalNav.tsx
// =============================================================================
// CDC Manager — Navegação do Portal do Paciente
// -----------------------------------------------------------------------------
// O paciente acede quase sempre pelo telemóvel, por isso há duas versões da
// mesma navegação (a troca é feita no globals.css, aos 768px):
//   · telemóvel → barra fixa no fundo do ecrã, com ícones, ao estilo das apps
//     (MobileTabBar). Sem tabs a deslizar para o lado.
//   · computador/tablet → tabs horizontais por baixo do cabeçalho (que fica
//     preso ao topo — ver conta/layout.tsx).
// Client component só pelo usePathname — zero estado próprio.
// Ativo por prefixo, com guarda para '/conta' não ficar ativo em tudo.
// =============================================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  House,
  UserRound,
} from 'lucide-react';
import {
  MobileTabBar,
  type MobileTabItem,
} from '@/components/layout/MobileTabBar';

const TABS = [
  { href: '/conta', label: 'Início', short: 'Início', icon: House },
  {
    href: '/conta/marcacoes',
    label: 'Marcações',
    short: 'Marcações',
    icon: CalendarDays,
  },
  {
    href: '/conta/anamnese',
    label: 'Anamnese',
    short: 'Anamnese',
    icon: ClipboardList,
  },
  {
    href: '/conta/documentos',
    label: 'Documentos',
    short: 'Documentos',
    icon: FileText,
  },
  {
    href: '/conta/dados',
    label: 'Os meus dados',
    short: 'Dados',
    icon: UserRound,
  },
] as const;

const BOTTOM_ITEMS: MobileTabItem[] = TABS.map(tab => ({
  href: tab.href,
  label: tab.short,
  icon: tab.icon,
  exact: tab.href === '/conta',
}));

export default function PortalNav() {
  const pathname = usePathname() ?? '';

  const isActive = (href: string) =>
    href === '/conta'
      ? pathname === '/conta'
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Computador/tablet: tabs por baixo do cabeçalho */}
      <nav
        className='cdc-portal-tabs'
        aria-label='Navegação do portal'
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E4E8F2',
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

      {/* Telemóvel: menu fixo no fundo, com ícones */}
      <MobileTabBar
        className='cdc-portal-bottom'
        label='Navegação do portal'
        items={BOTTOM_ITEMS}
      />
    </>
  );
}
