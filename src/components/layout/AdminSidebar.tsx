// 📄 src/components/layout/AdminSidebar.tsx
// =============================================================================
// CDC Manager — Layout: Sidebar da área Admin/Receção
// -----------------------------------------------------------------------------
// Navegação lateral. Client Component apenas pelo usePathname (marcar a
// secção ativa). Posicionamento (sticky no desktop / drawer no mobile) é
// responsabilidade do AdminShell + globals.css — aqui só a coluna em si.
//
// Arquitetura de navegação (v2 — preparação para produto multi-clínica):
// cinco áreas mentais em vez de dois grupos genéricos.
//   Operação   → o balcão: o que acontece hoje
//   Clínica    → o trabalho clínico e os seus circuitos (RX, prótese, recall)
//   Financeiro → Cobranças (o que o paciente ainda deve) vs Faturação
//                (documentos fiscais) — nomes distintos de propósito
//   Gestão     → recursos e análise
//   Sistema    → configuração e atalhos externos
//
// `onNavigate` (opcional): o drawer mobile fecha ao clicar num link.
// Módulos por construir aparecem DESATIVADOS com o sprint previsto.
// =============================================================================

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ScanLine,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Mail,
  Star,
  ExternalLink,
  Package,
  RefreshCcw,
  Settings,
  Stethoscope,
  ReceiptEuro,
  Users,
  FlaskConical,
  Armchair,
  Truck,
  ListChecks,
  UsersRound,
  FileSignature,
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
      { href: '/admin/agenda', label: 'Agenda', icon: CalendarDays },
      { href: '/admin/pacientes', label: 'Pacientes', icon: Users },
      { href: '/admin/sala-espera', label: 'Sala de espera', icon: Armchair },
    ],
  },
  {
    section: 'Clínica',
    items: [
      // Catálogo de atos como entidade viva (749 atos Dentoral): durações,
      // flags, confirmações — não é configuração pontual
      {
        href: '/admin/tratamentos',
        label: 'Tratamentos',
        icon: ClipboardList,
      },
      { href: '/admin/rx', label: 'Raio-X', icon: ScanLine },
      { href: '/admin/proteses', label: 'Próteses', icon: FlaskConical },
      { href: '/admin/recalls', label: 'Recalls', icon: RefreshCcw },
      { href: '/admin/medicos', label: 'Corpo clínico', icon: Stethoscope },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { href: '/admin/cobranca', label: 'Cobranças', icon: ReceiptEuro },
      { href: '/admin/faturacao', label: 'Faturação', icon: FileText },
    ],
  },
  {
    section: 'Gestão',
    items: [
      { href: '/admin/stock', label: 'Stock', icon: Package },
      { href: '/admin/fornecedores', label: 'Fornecedores', icon: Truck },
      // Fase 6A (E16) — RH; a página bloqueia não-admin
      {
        href: '/admin/colaboradores',
        label: 'Colaboradores',
        icon: UsersRound,
      },
      { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/admin/listagens', label: 'Listagens', icon: ListChecks },
      {
        href: '/admin/modelos',
        label: 'Modelos de documentos',
        icon: FileSignature,
      },
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
      // Webmail da clínica — atalho externo (Hostinger); credenciais pedidas lá
      {
        href: 'https://mail.hostinger.com/mailboxes/INBOX',
        label: 'Email da clínica',
        icon: Mail,
        external: true,
      },
      // Gestor de reviews do Google Business Profile — responder rápido pesa
      // no ranking local. (Reviews DENTRO da app c/ badge = GBP API — Sprint 6)
      {
        href: 'https://business.google.com/reviews',
        label: 'Google Reviews',
        icon: Star,
        external: true,
      },
    ],
  },
];

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '9px 10px',
  borderRadius: '8px',
  fontSize: '14px',
  textDecoration: 'none',
};

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1B2A6B',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <Link
        href='/admin/dashboard'
        onClick={onNavigate}
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
          gap: '16px',
          padding: '4px 12px 24px',
          flex: 1,
        }}
      >
        {NAV.map(group => (
          <div key={group.section}>
            <p
              style={{
                margin: '0 0 4px',
                padding: '0 10px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.6px',
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
                      style={{ ...ROW, color: '#5D6DB0', cursor: 'default' }}
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
                      style={{ ...ROW, fontWeight: 500, color: '#C9D4FF' }}
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
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      ...ROW,
                      fontWeight: active ? 700 : 500,
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
