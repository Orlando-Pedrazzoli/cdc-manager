// 📄 src/components/ui/Modal.tsx
// =============================================================================
// CDC Manager — UI: Modal
// -----------------------------------------------------------------------------
// Diálogo modal controlado (open/onClose) com portal para document.body,
// fecho por Escape e clique no backdrop, e bloqueio do scroll da página.
// 'use client' obrigatório: estado, efeitos e portal.
// =============================================================================

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Rodapé opcional (botões de ação) */
  footer?: ReactNode;
  /** Largura máxima em px (default 520) */
  maxWidth?: number;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 520,
}: ModalProps) {
  // Portal só depois de montado (SSR-safe)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape fecha + scroll da página bloqueado enquanto aberto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role='dialog'
      aria-modal='true'
      aria-label={title}
      onMouseDown={e => {
        // Fecha só se o clique COMEÇOU no backdrop (não ao arrastar de dentro)
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(27, 42, 107, 0.45)', // marca com transparência
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow: '0 20px 50px rgba(27, 42, 107, 0.25)',
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #EEF1F8',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            {title}
          </h2>
          <button
            type='button'
            onClick={onClose}
            aria-label='Fechar'
            style={{
              display: 'inline-flex',
              padding: 6,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: '#6A7186',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '20px', overflowY: 'auto' }}>{children}</div>

        {/* Rodapé */}
        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '14px 20px',
              borderTop: '1px solid #EEF1F8',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
