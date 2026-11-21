// 📄 src/components/layout/AppShell.tsx
// =============================================================================
// CDC Manager — Layout: Shell responsivo (áreas Admin/Receção e Médico)
// -----------------------------------------------------------------------------
// Client Component mínimo: o único estado é o drawer aberto/fechado no
// mobile. Recebe do layout (server) os nós já renderizados — barra superior
// e rodapé do drawer (utilizador + Sair) — para que server actions e sessão
// fiquem no servidor. `area` escolhe a sidebar (Admin ou Doctor); as duas
// são client e recebem onNavigate para fechar o drawer.
// `topbarOnMobile=false` esconde a barra superior abaixo de 1024px quando
// ela só tem utilizador/Sair (a área do médico) — esses vivem no drawer.
//
// ≥ 1024px: sidebar fixa à esquerda (.cdc-sidebar-desktop) + topbar.
// <  1024px: barra fixa no topo com hambúrguer; a MESMA sidebar renderiza
//            dentro de um drawer (.cdc-drawer) com backdrop. Fecha ao navegar
//            (onNavigate), no Escape e ao clicar fora. Bloqueia o scroll do body enquanto
//            aberto. A estrutura responsiva vive em globals.css (.cdc-*).
//            Na área do médico há ainda um menu fixo no fundo do ecrã
//            (MobileTabBar) com os destinos do dia a dia; "Mais" abre o
//            drawer com o menu completo.
// A barra superior do computador (.cdc-topbar) fica presa ao topo.
// =============================================================================

'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Smile,
  Users,
  X,
} from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import { DoctorSidebar } from './DoctorSidebar';
import { BrandMark, type BrandMarkProps } from './BrandMark';
import { MobileTabBar, type MobileTabItem } from './MobileTabBar';

type Props = {
  area: 'admin' | 'doutor';
  /** false → a barra superior desaparece no mobile (só tinha utilizador) */
  topbarOnMobile?: boolean;
  /** Marca da organização (Organization) — logo, nome da app, cor */
  brand: BrandMarkProps;
  /** Conteúdo da topbar (pesquisa + utilizador + Sair) */
  topbar: ReactNode;
  /** Rodapé do drawer no mobile (utilizador + Sair) */
  drawerFooter: ReactNode;
  children: ReactNode;
};

// --- Preferência "menu escondido" (por browser) --------------------------------
const SIDEBAR_KEY = 'cdc:sidebar-hidden';
const SIDEBAR_EVENT = 'cdc:sidebar-change';

function subscribeSidebar(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SIDEBAR_EVENT, onChange);
  };
}
function readSidebarHidden(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false; // modo privado / armazenamento bloqueado
  }
}
function writeSidebarHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(SIDEBAR_KEY, '1');
    else window.localStorage.removeItem(SIDEBAR_KEY);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

export function AppShell({
  area,
  brand,
  topbar,
  topbarOnMobile = true,
  drawerFooter,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  // no servidor (e na 1.ª pintura) o menu está sempre visível
  const sidebarHidden = useSyncExternalStore(
    subscribeSidebar,
    readSidebarHidden,
    () => false,
  );
  const home = area === 'admin' ? '/admin/dashboard' : '/doutor/dashboard';
  const Sidebar = area === 'admin' ? AdminSidebar : DoctorSidebar;

  // Navegar fecha o drawer: a sidebar chama onNavigate no clique do link
  // (sem efeito sobre o pathname — evita setState em effect).
  // Escape fecha · scroll do body bloqueado enquanto aberto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  // Menu inferior (telemóvel) — só na área do médico: o que ele abre entre
  // consultas. O resto do menu continua no drawer ("Mais").
  const bottomItems: MobileTabItem[] | null =
    area === 'doutor'
      ? [
          {
            href: '/doutor/dashboard',
            label: 'O meu dia',
            icon: LayoutDashboard,
          },
          { href: '/doutor/agenda', label: 'Agenda', icon: CalendarDays },
          { href: '/doutor/pacientes', label: 'Pacientes', icon: Users },
          { href: '/doutor/odontograma', label: 'Odontograma', icon: Smile },
          { label: 'Mais', icon: Menu, onClick: () => setOpen(true) },
        ]
      : null;

  return (
    <div
      className='cdc-shell'
      data-drawer={open ? 'open' : 'closed'}
      data-sidebar={sidebarHidden ? 'hidden' : 'shown'}
      data-bottom-nav={bottomItems ? 'on' : 'off'}
      style={{ backgroundColor: '#F4F6FB' }}
    >
      {/* Sidebar desktop */}
      <div className='cdc-sidebar-desktop'>
        <Sidebar brand={brand} />
      </div>

      {/* Drawer mobile (mesma sidebar + rodapé com utilizador) */}
      <div className='cdc-drawer-backdrop' onClick={close} aria-hidden='true' />
      <aside
        className='cdc-drawer'
        aria-label='Navegação'
        aria-hidden={!open}
        style={{ flexDirection: 'column', backgroundColor: brand.primaryColor }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 10px 0',
          }}
        >
          <button
            type='button'
            onClick={close}
            aria-label='Fechar menu'
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <Sidebar brand={brand} onNavigate={close} />
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.12)',
            padding: '14px 16px',
          }}
        >
          {drawerFooter}
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Barra mobile: hambúrguer + marca */}
        <div
          className='cdc-mobile-bar'
          style={{
            alignItems: 'center',
            gap: '12px',
            height: 54,
            padding: '0 12px',
            backgroundColor: brand.primaryColor,
          }}
        >
          <button
            type='button'
            onClick={() => setOpen(true)}
            aria-label='Abrir menu'
            aria-expanded={open}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: '10px',
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            <Menu size={20} />
          </button>
          <BrandMark brand={brand} href={home} size={22} />
        </div>

        <header
          className={
            topbarOnMobile ? 'cdc-topbar' : 'cdc-topbar cdc-hide-mobile'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #EEF1F8',
          }}
        >
          <button
            type='button'
            className='cdc-sidebar-toggle'
            onClick={() => writeSidebarHidden(!sidebarHidden)}
            aria-label={sidebarHidden ? 'Mostrar o menu' : 'Esconder o menu'}
            aria-pressed={sidebarHidden}
            title={
              sidebarHidden
                ? 'Mostrar o menu lateral'
                : 'Esconder o menu lateral (mais espaço para a agenda)'
            }
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: '10px',
              border: '1px solid #D8DEEF',
              backgroundColor: sidebarHidden ? '#F2F5FC' : '#FFFFFF',
              color: '#1B2A6B',
              cursor: 'pointer',
            }}
          >
            {sidebarHidden ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          {topbar}
        </header>

        <main className='cdc-main'>{children}</main>
      </div>

      {bottomItems && (
        <MobileTabBar
          className='cdc-bottom-nav'
          label='Atalhos'
          items={bottomItems}
        />
      )}
    </div>
  );
}
