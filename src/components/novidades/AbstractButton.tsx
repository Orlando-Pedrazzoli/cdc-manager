// 📄 src/components/novidades/AbstractButton.tsx
// CDC Manager — Novidades: "Ver resumo" (abstract a pedido)
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export function AbstractButton({
  pmid,
  canTranslate,
}: {
  pmid: string;
  /** false quando não há ANTHROPIC_API_KEY — só original */
  canTranslate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<'pt' | 'en'>(canTranslate ? 'pt' : 'en');
  const [texts, setTexts] = useState<{ pt?: string; en?: string }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (l: 'pt' | 'en') => {
    if (texts[l]) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/pubmed/abstract?pmid=${pmid}&lang=${l}`);
      const j = (await r.json()) as {
        text?: string;
        error?: string;
        translated?: boolean;
      };
      if (!r.ok || !j.text)
        throw new Error(j.error ?? 'Sem resumo disponível.');
      setTexts(t => ({ ...t, [l]: j.text }));
      if (l === 'pt' && !j.translated)
        setError('Tradução indisponível — a mostrar o original.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };
  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    await load(lang);
  };
  const switchLang = async (l: 'pt' | 'en') => {
    setLang(l);
    await load(l);
  };
  const text = texts[lang];

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
        {open
          ? 'Esconder resumo'
          : canTranslate
            ? 'Ver resumo em português'
            : 'Ver resumo'}
      </button>
      {open && canTranslate && (
        <span style={{ display: 'inline-flex', marginLeft: 8, gap: 4 }}>
          {(['pt', 'en'] as const).map(l => (
            <button
              key={l}
              type='button'
              onClick={() => switchLang(l)}
              style={{
                border: `1px solid ${lang === l ? '#2743A6' : '#D8DEEF'}`,
                borderRadius: 999,
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: lang === l ? '#2743A6' : '#FFFFFF',
                color: lang === l ? '#FFFFFF' : '#1B2A6B',
                cursor: 'pointer',
              }}
            >
              {l === 'pt' ? 'Português' : 'Original'}
            </button>
          ))}
        </span>
      )}
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
