// 📄 src/components/layout/AdminShell.tsx
// =============================================================================
// CDC Manager — Layout: Shell responsivo da área Admin/Receção
// -----------------------------------------------------------------------------
// Client Component mínimo: o único estado é o drawer aberto/fechado no
// mobile. Recebe do layout (server) os nós já renderizados — barra superior
// e rodapé do drawer (utilizador + Sair) — para que server actions e sessão
// fiquem no servidor. A AdminSidebar (também client) é importada aqui porque
// precisa do onNavigate para fechar o drawer.
//
// ≥ 1024px: sidebar fixa à esquerda (.cdc-sidebar-desktop) + topbar.
// <  1024px: barra fixa no topo com hambúrguer; a MESMA sidebar renderiza
//            dentro de um drawer (.cdc-drawer) com backdrop. Fecha ao navegar
//            (onNavigate), no Escape e ao clicar fora. Bloqueia o scroll do body enquanto
//            aberto. A estrutura responsiva vive em globals.css (.cdc-*).
// =============================================================================

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';

type Props = {
  /** Conteúdo da topbar (pesquisa + utilizador + Sair) */
  topbar: ReactNode;
  /** Rodapé do drawer no mobile (utilizador + Sair) */
  drawerFooter: ReactNode;
  children: ReactNode;
};

export function AdminShell({ topbar, drawerFooter, children }: Props) {
  const [open, setOpen] = useState(false);

  // Navegar fecha o drawer: a AdminSidebar chama onNavigate no clique do link
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

  return (
    <div
      className='cdc-shell'
      data-drawer={open ? 'open' : 'closed'}
      style={{ backgroundColor: '#F4F6FB' }}
    >
      {/* Sidebar desktop */}
      <div className='cdc-sidebar-desktop'>
        <AdminSidebar />
      </div>

      {/* Drawer mobile (mesma sidebar + rodapé com utilizador) */}
      <div className='cdc-drawer-backdrop' onClick={close} aria-hidden='true' />
      <aside
        className='cdc-drawer'
        aria-label='Navegação'
        aria-hidden={!open}
        style={{ flexDirection: 'column', backgroundColor: '#1B2A6B' }}
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
        <AdminSidebar onNavigate={close} />
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
            backgroundColor: '#1B2A6B',
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
          <Link
            href='/admin/dashboard'
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                backgroundColor: '#FFFFFF',
                borderRadius: '7px',
                padding: '3px',
              }}
            >
              <Image
                src='/logo-cdc.png'
                alt='CDC'
                width={22}
                height={22}
                style={{ display: 'block' }}
              />
            </span>
            <span
              style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 700 }}
            >
              CDC Manager
            </span>
          </Link>
        </div>

        <header
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
          {topbar}
        </header>

        <main className='cdc-main'>{children}</main>
      </div>
    </div>
  );
}
