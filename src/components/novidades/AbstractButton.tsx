// 📄 src/components/novidades/AbstractButton.tsx
// CDC Manager — Novidades: "Ver resumo" (abstract a pedido)
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export function AbstractButton({ pmid }: { pmid: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/pubmed/abstract?pmid=${pmid}`);
      const j = (await r.json()) as { text?: string; error?: string };
      if (!r.ok || !j.text)
        throw new Error(j.error ?? 'Sem resumo disponível.');
      setText(j.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type='button'
        onClick={toggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          border: '1px solid #D8DEEF',
          borderRadius: '8px',
          padding: '5px 10px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#2743A6',
          backgroundColor: '#FFFFFF',
          cursor: 'pointer',
        }}
      >
        {loading ? (
          <Loader2 size={13} className='animate-spin' />
        ) : open ? (
          <ChevronUp size={13} />
        ) : (
          <ChevronDown size={13} />
        )}
        {open ? 'Esconder resumo' : 'Ver resumo'}
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: '#F8F9FD',
            fontSize: '13px',
            lineHeight: 1.55,
            color: '#1C2233',
            whiteSpace: 'pre-wrap',
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {error ? (
            <span style={{ color: '#B3261E' }}>{error}</span>
          ) : (
            (text ?? 'A carregar…')
          )}
        </div>
      )}
    </div>
  );
}
