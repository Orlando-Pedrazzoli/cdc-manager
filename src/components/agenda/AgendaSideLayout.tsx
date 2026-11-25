// 📄 src/components/agenda/AgendaSideLayout.tsx
'use client';
// =============================================================================
// CDC Manager — Agenda: grelha + barra lateral direita (calendário à vista)
// -----------------------------------------------------------------------------
// Victor (25/11/2026): "o calendário foi lá para baixo dos agendamentos".
// A coluna da direita tinha largura livre e quebra de linha: bastava a caixa
// da lista de espera alargar para o calendário saltar para baixo da grelha.
//
// Agora a coluna tem largura fixa e fica presa ao topo enquanto se rola a
// agenda. Pode fechar-se para dar mais espaço à grelha; abre por omissão e a
// escolha fica guardada no browser de cada posto (como o menu lateral e a
// vista compacta).
//
//   ≥ 1280px      coluna fixa à direita, presa ao topo
//   1024–1279px   não cabe ao lado da grelha: abre POR CIMA dela e começa
//                 fechada (não é guardada — fecha sozinha ao mudar de dia)
//   < 1024px      empilha por baixo da grelha, como antes; sem botões
//
// A estrutura responsiva vive em globals.css (.cdc-agenda-*); aqui só o
// estado. `main` e `children` chegam já renderizados do servidor.
// =============================================================================

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

const SIDE_KEY = 'cdc-agenda-side-hidden';
const SIDE_EVENT = 'cdc:agenda-side-change';
/** O mesmo limite de globals.css: abaixo disto a barra abre por cima */
const DOCKED_QUERY = '(min-width: 1280px)';

function subscribeSide(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(SIDE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SIDE_EVENT, onChange);
  };
}
function readSideHidden(): boolean {
  try {
    return window.localStorage.getItem(SIDE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeSideHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(SIDE_KEY, '1');
    else window.localStorage.removeItem(SIDE_KEY);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  window.dispatchEvent(new Event(SIDE_EVENT));
}

export function AgendaSideLayout({
  date,
  main,
  children,
}: {
  /** Dia aberto (YYYY-MM-DD): ao mudar, a barra sobreposta fecha-se */
  date: string;
  /** A grelha do dia */
  main: ReactNode;
  /** Conteúdo da barra: calendário, canceladas, lista de espera */
  children: ReactNode;
}) {
  // Aberta por omissão (no servidor e no primeiro desenho)
  const hidden = useSyncExternalStore(
    subscribeSide,
    readSideHidden,
    () => false,
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Escolher um dia no calendário sobreposto mostra logo a grelha desse dia
  const [seenDate, setSeenDate] = useState(date);
  if (date !== seenDate) {
    setSeenDate(date);
    setOverlayOpen(false);
  }

  const toggle = () => {
    if (window.matchMedia(DOCKED_QUERY).matches) writeSideHidden(!hidden);
    else setOverlayOpen(open => !open);
  };

  return (
    <div
      className='cdc-agenda-body'
      data-side={hidden ? 'closed' : 'open'}
      data-overlay={overlayOpen ? 'open' : 'closed'}
    >
      <div className='cdc-agenda-main'>{main}</div>

      <aside
        id='cdc-agenda-side'
        className='cdc-agenda-side'
        aria-label='Calendário e registos do dia'
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <strong
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#6A7186',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Calendário
          </strong>
          <button
            type='button'
            className='cdc-agenda-side-close'
            onClick={toggle}
            aria-controls='cdc-agenda-side'
            aria-expanded='true'
            aria-label='Esconder o calendário'
            title='Esconder o calendário (mais espaço para a agenda)'
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: '8px',
              border: '1px solid #D8DEEF',
              backgroundColor: '#FFFFFF',
              color: '#1B2A6B',
              cursor: 'pointer',
            }}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
        {children}
      </aside>

      {/* Barra fechada: fica uma aba estreita para a voltar a abrir */}
      <button
        type='button'
        className='cdc-agenda-rail'
        onClick={toggle}
        aria-controls='cdc-agenda-side'
        aria-expanded='false'
        aria-label='Mostrar o calendário'
        title='Mostrar o calendário, as canceladas e a lista de espera'
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          width: 34,
          padding: '10px 0',
          borderRadius: '10px',
          border: '1px solid #D8DEEF',
          backgroundColor: '#FFFFFF',
          color: '#1B2A6B',
          cursor: 'pointer',
        }}
      >
        <PanelRightOpen size={16} />
        <span
          style={{
            writingMode: 'vertical-rl',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.3px',
          }}
        >
          Calendário
        </span>
      </button>
    </div>
  );
}
