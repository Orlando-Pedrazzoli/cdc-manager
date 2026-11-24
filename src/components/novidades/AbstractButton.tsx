// 📄 src/components/novidades/AbstractButton.tsx
// =============================================================================
// CDC Manager — Novidades: "Ver resumo" (abstract a pedido)
// -----------------------------------------------------------------------------
// Rapidez (24/11/2026):
//  · o pedido arranca quando o rato pousa no botão um instante (ou o foco
//    lá chega) — quando o médico clica, o resumo normalmente já está cá.
//    Passar o rato de raspão não conta, para não gastar traduções à toa;
//  · com tradução, pedem-se o original e o português em paralelo: o
//    original (rápido) aparece logo com o aviso "a traduzir…" e é trocado
//    pela tradução quando esta chega;
//  · o que já foi pedido fica em memória enquanto a página estiver aberta
//    (mudar de filtro e voltar não repete pedidos), e o browser guarda a
//    resposta 1 dia.
// =============================================================================
'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const HOVER_INTENT_MS = 180;

type Lang = 'pt' | 'en';
type Loaded = { text: string; translated: boolean };

// Partilhado por todos os botões da página: pedido em curso ou concluído
const cache = new Map<string, Promise<Loaded>>();

function request(pmid: string, lang: Lang): Promise<Loaded> {
  const key = `${pmid}:${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/api/pubmed/abstract?pmid=${pmid}&lang=${lang}`)
    .then(async r => {
      const j = (await r.json()) as {
        text?: string;
        error?: string;
        translated?: boolean;
      };
      if (!r.ok || !j.text)
        throw new Error(j.error ?? 'Sem resumo disponível.');
      return { text: j.text, translated: !!j.translated };
    })
    .catch(e => {
      cache.delete(key); // uma falha não fica guardada: o próximo clique repete
      throw e;
    });
  cache.set(key, p);
  return p;
}

export function AbstractButton({
  pmid,
  canTranslate,
}: {
  pmid: string;
  /** false quando não há chave de tradução — só original */
  canTranslate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(canTranslate ? 'pt' : 'en');
  const [texts, setTexts] = useState<{ pt?: string; en?: string }>({});
  const [ptFailed, setPtFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Arranca os pedidos uma vez (hover, foco ou clique — o que vier primeiro)
  const start = () => {
    if (started) return;
    setStarted(true);
    setError(null);
    const en = request(pmid, 'en').then(r => {
      setTexts(t => ({ ...t, en: r.text }));
    });
    if (!canTranslate) {
      en.catch(e => {
        setError(e instanceof Error ? e.message : 'Erro');
        setStarted(false);
      });
      return;
    }
    request(pmid, 'pt')
      .then(r => {
        if (r.translated) setTexts(t => ({ ...t, pt: r.text }));
        else setPtFailed(true);
      })
      .catch(() => setPtFailed(true));
    en.catch(e => {
      // sem original: só é erro se a tradução também não chegar
      request(pmid, 'pt').catch(() => {
        setError(e instanceof Error ? e.message : 'Erro');
        setStarted(false);
      });
    });
  };

  // intenção: o rato tem de ficar parado no botão um instante
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDwell = () => {
    if (dwell.current) clearTimeout(dwell.current);
    dwell.current = null;
  };
  const armDwell = () => {
    cancelDwell();
    dwell.current = setTimeout(start, HOVER_INTENT_MS);
  };

  const toggle = () => {
    cancelDwell();
    if (!open) start();
    setOpen(o => !o);
  };

  const wantPt = lang === 'pt' && canTranslate;
  const translating = wantPt && !texts.pt && !ptFailed;
  const text = wantPt ? (texts.pt ?? texts.en) : texts.en;
  const loading = open && started && !text && !error;

  return (
    <div>
      <button
        type='button'
        onClick={toggle}
        onPointerEnter={armDwell}
        onPointerLeave={cancelDwell}
        onFocus={start}
        aria-expanded={open}
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
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
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
          ) : !text ? (
            'A carregar…'
          ) : (
            <>
              {wantPt && !texts.pt && (
                <span
                  role='status'
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: ptFailed ? '#9A6700' : '#2743A6',
                  }}
                >
                  {translating && (
                    <Loader2 size={12} className='animate-spin' />
                  )}
                  {ptFailed
                    ? 'Tradução indisponível — a mostrar o original.'
                    : 'A traduzir… entretanto, o original:'}
                </span>
              )}
              {text}
            </>
          )}
        </div>
      )}
    </div>
  );
}
