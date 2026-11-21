// 📄 src/components/layout/MobileTabBar.tsx
// =============================================================================
// CDC Manager — Layout: barra de navegação inferior (telemóvel)
// -----------------------------------------------------------------------------
// Menu fixo no fundo do ecrã, ao estilo das apps: ícone + legenda para os
// destinos mais usados de cada área. Usado no Portal do Paciente (PortalNav)
// e na área do Médico (AppShell). Só aparece em ecrãs estreitos — a
// visibilidade e a posição vivem no globals.css (classe passada pelo pai:
// .cdc-bottom-nav no shell, .cdc-portal-bottom no portal).
//
// Client Component só pelo usePathname. Um item sem `href` é um botão
// (ex.: "Mais" → abre o drawer com o menu completo).
// =============================================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, CSSProperties } from 'react';

export type MobileTabItem = {
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  /** Destino. Sem href → botão que chama onClick */
  href?: string;
  /** true → ativo só no caminho exato (ex.: '/conta') */
  exact?: boolean;
  onClick?: () => void;
};

const ACTIVE = '#1B2A6B';
const IDLE = '#6A7186';

const itemStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '3px',
  padding: '6px 2px',
  border: 'none',
  backgroundColor: 'transparent',
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  WebkitTapHighlightColor: 'transparent',
};

export function MobileTabBar({
  items,
  className,
  label,
}: {
  items: MobileTabItem[];
  className: string;
  /** aria-label da navegação */
  label: string;
}) {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className={className}
      aria-label={label}
      style={{
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E4E8F2',
        boxShadow: '0 -4px 16px rgba(27, 42, 107, 0.06)',
      }}
    >
      {items.map(item => {
        const Icon = item.icon;
        const active = item.href
          ? item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          : false;
        const color = active ? ACTIVE : IDLE;

        const content = (
          <>
            <span
              aria-hidden='true'
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 28,
                borderRadius: '999px',
                backgroundColor: active ? '#E8EDFB' : 'transparent',
                color,
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            </span>
            <span
              style={{
                maxWidth: '100%',
                fontSize: '10.5px',
                lineHeight: 1.2,
                fontWeight: active ? 700 : 500,
                color,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          </>
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={itemStyle}
          >
            {content}
          </Link>
        ) : (
          <button
            key={item.label}
            type='button'
            onClick={item.onClick}
            style={itemStyle}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
