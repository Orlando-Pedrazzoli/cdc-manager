// 📄 src/components/layout/AdminSidebar.tsx
// =============================================================================
// CDC Manager — Layout: Sidebar da área Admin/Receção
// -----------------------------------------------------------------------------
// Navegação lateral fixa. Client Component apenas pelo usePathname (marcar a
// secção ativa) — os dados do utilizador vêm por props do layout (server).
//
// Módulos ainda não construídos aparecem DESATIVADOS com o sprint previsto:
// o Victor vê o mapa do produto completo desde o primeiro dia, e ninguém
// clica num link morto.
// =============================================================================

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Mail,
  ExternalLink,
  Package,
  RefreshCcw,
  Settings,
  Stethoscope,
  ReceiptEuro,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  /** Item ainda por construir → desativado com hint do sprint */
  soon?: string;
  /** Link externo → abre em separador novo, sem estado ativo */
  external?: boolean;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operação',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/pacientes', label: 'Pacientes', icon: Users },
      { href: '/admin/agenda', label: 'Agenda', icon: CalendarDays },
      { href: '/admin/cobranca', label: 'Cobrança', icon: ReceiptEuro },
      {
        href: '/admin/recalls',
        label: 'Recalls',
        icon: RefreshCcw,
      },
    ],
  },
  {
    section: 'Gestão',
    items: [
      { href: '/admin/medicos', label: 'Corpo Clínico', icon: Stethoscope },
      // Catálogo de atos promovido de Configurações a entidade própria:
      // com a matriz real importada (749 atos Dentoral) é gestão viva
      // (durações, flags, confirmações), não configuração pontual
      {
        href: '/admin/tratamentos',
        label: 'Tratamentos',
        icon: ClipboardList,
      },
      {
        href: '/admin/faturacao',
        label: 'Faturação',
        icon: FileText,
      },
      { href: '/admin/stock', label: 'Stock', icon: Package },
      { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    section: 'Sistema',
    items: [
      {
        href: '/admin/configuracoes',
        label: 'Configurações',
        icon: Settings,
      },
      // Webmail da clínica (contacto@centrodentariocolombo.com) — atalho
      // externo: abre a Hostinger em separador novo; credenciais da caixa
      // são pedidas lá (não há SSO)
      {
        href: 'https://mail.hostinger.com/mailboxes/INBOX',
        label: 'Email da clínica',
        icon: Mail,
        external: true,
      },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1B2A6B',
        minHeight: '100vh',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        maxHeight: '100vh',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <Link
        href='/admin/dashboard'
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '18px 20px',
          textDecoration: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '4px',
          }}
        >
          <Image
            src='/logo-cdc.png'
            alt='CDC'
            width={28}
            height={28}
            style={{ display: 'block' }}
          />
        </span>
        <span
          style={{
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          CDC Manager
        </span>
      </Link>

      {/* Navegação */}
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          padding: '8px 12px 24px',
          flex: 1,
        }}
      >
        {NAV.map(group => (
          <div key={group.section}>
            <p
              style={{
                margin: '0 0 6px',
                padding: '0 10px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: '#8FA0DC',
              }}
            >
              {group.section}
            </p>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
              {group.items.map(item => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                if (item.soon) {
                  return (
                    <span
                      key={item.href}
                      title={`Disponível no ${item.soon}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 10px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#5D6DB0',
                        cursor: 'default',
                      }}
                    >
                      <Icon size={17} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#5D6DB0',
                          border: '1px solid #3A4C96',
                          borderRadius: '999px',
                          padding: '1px 7px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.soon}
                      </span>
                    </span>
                  );
                }

                if (item.external) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target='_blank'
                      rel='noopener noreferrer'
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 10px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        textDecoration: 'none',
                        color: '#C9D4FF',
                      }}
                    >
                      <Icon size={17} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <ExternalLink size={13} style={{ opacity: 0.7 }} />
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 10px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: active ? 700 : 500,
                      textDecoration: 'none',
                      color: active ? '#FFFFFF' : '#C9D4FF',
                      backgroundColor: active ? '#2743A6' : 'transparent',
                    }}
                  >
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
