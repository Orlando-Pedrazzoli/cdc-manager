// 📄 src/app/doutor/novidades/page.tsx
// =============================================================================
// CDC Manager — Médico: Novidades científicas (PubMed)
// -----------------------------------------------------------------------------
// "Uma distração para os médicos estudarem novidades enquanto não atendem."
// Pesquisa nas E-utilities do NCBI (gratuito, sem chave): tema pré-definido
// de medicina dentária × período × tipo (ensaios / revisões / tudo) +
// pesquisa livre. Lista ordenada por data com revista, autores, tipo, links
// PubMed/DOI e o resumo a pedido. Nada é gravado. Cache 1 h.
// =============================================================================

import Link from 'next/link';
import { BookOpenText, ExternalLink, Search } from 'lucide-react';
import { auth } from '@/lib/auth';
import {
  searchPubmed,
  buildQuery,
  PUBMED_TOPICS,
  PUBMED_PERIODS,
  PUBMED_KINDS,
  type PubmedSearchResult,
} from '@/lib/pubmed';
import { AbstractButton } from '@/components/novidades/AbstractButton';
import { translateTitles, translationEnabled } from '@/lib/translate';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Novidades científicas' };

export default async function NovidadesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tema?: string;
    periodo?: string;
    tipo?: string;
    q?: string;
    lang?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const topicKey = PUBMED_TOPICS.some(t => t.key === sp.tema)
    ? sp.tema!
    : 'geral';
  const periodKey = PUBMED_PERIODS.some(p => p.key === sp.periodo)
    ? sp.periodo!
    : '30';
  const kindKey = PUBMED_KINDS.some(k => k.key === sp.tipo) ? sp.tipo! : 'all';
  const q = (sp.q ?? '').slice(0, 200);
  const canTranslate = translationEnabled();
  const lang: 'pt' | 'en' = canTranslate && sp.lang !== 'en' ? 'pt' : 'en';
  const days = PUBMED_PERIODS.find(p => p.key === periodKey)!.days;
  const term = buildQuery({ topicKey, q, kindKey });

  let result: PubmedSearchResult | null = null;
  let error: string | null = null;
  let titlesPt: string[] | null = null;
  try {
    result = await searchPubmed({ term, days, max: 25 });
    // Títulos em PT numa só chamada (cache 7 dias) — o original fica por baixo
    if (lang === 'pt' && result.articles.length > 0) {
      titlesPt = await translateTitles(result.articles.map(a => a.title));
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'PubMed indisponível.';
  }

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      tema: topicKey,
      periodo: periodKey,
      tipo: kindKey,
      ...(q ? { q } : {}),
      ...over,
    });
    return `/doutor/novidades?${p.toString()}`;
  };
  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '16px 18px',
  };
  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? '#2743A6' : '#D8DEEF'}`,
    backgroundColor: active ? '#2743A6' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#1B2A6B',
    fontSize: '12.5px',
    fontWeight: 600,
    textDecoration: 'none',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <BookOpenText size={22} />
          Novidades científicas
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
          Publicações recentes no PubMed em medicina dentária — para os
          intervalos entre consultas. Fonte: NCBI E-utilities.
        </p>
      </div>

      {/* Filtros */}
      <div
        style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PUBMED_TOPICS.map(t => (
            <Link
              key={t.key}
              href={href({ tema: t.key })}
              style={chip(t.key === topicKey)}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {PUBMED_PERIODS.map(p => (
            <Link
              key={p.key}
              href={href({ periodo: p.key })}
              style={chip(p.key === periodKey)}
            >
              {p.label}
            </Link>
          ))}
          <span style={{ width: 10 }} />
          {PUBMED_KINDS.map(k => (
            <Link
              key={k.key}
              href={href({ tipo: k.key })}
              style={chip(k.key === kindKey)}
            >
              {k.label}
            </Link>
          ))}
          {canTranslate && (
            <>
              <span style={{ marginLeft: 'auto' }} />
              <Link href={href({ lang: 'pt' })} style={chip(lang === 'pt')}>
                Português
              </Link>
              <Link href={href({ lang: 'en' })} style={chip(lang === 'en')}>
                Original (inglês)
              </Link>
            </>
          )}
        </div>
        <form method='get' style={{ display: 'flex', gap: 8 }}>
          <input type='hidden' name='tema' value={topicKey} />
          <input type='hidden' name='periodo' value={periodKey} />
          <input type='hidden' name='tipo' value={kindKey} />
          <input type='hidden' name='lang' value={lang} />
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: 11,
                color: '#9AA1B4',
              }}
            />
            <input
              name='q'
              defaultValue={q}
              className='cdc-field'
              placeholder='Pesquisa livre em inglês — ex.: "zirconia" OR "lithium disilicate", "immediate loading"…'
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1.5px solid #B9C3E0',
                borderRadius: '10px',
                padding: '9px 12px 9px 34px',
                fontSize: '14px',
                color: '#1B2A6B',
                backgroundColor: '#FBFCFF',
              }}
            />
          </div>
          <button
            type='submit'
            style={{
              border: 'none',
              borderRadius: '10px',
              padding: '9px 16px',
              backgroundColor: '#2743A6',
              color: '#FFFFFF',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Pesquisar
          </button>
        </form>
      </div>

      {/* Resultados */}
      {error && (
        <div
          style={{
            ...card,
            borderColor: '#F5D9A6',
            backgroundColor: '#FFF4E5',
            color: '#9A6700',
            fontSize: '14px',
          }}
        >
          {error} — tente novamente dentro de instantes.
        </div>
      )}
      {result && (
        <>
          <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
            {result.total.toLocaleString('pt-PT')} artigo(s) encontrado(s) · a
            mostrar os {result.articles.length} mais recentes
          </p>
          {result.articles.length === 0 && (
            <div style={{ ...card, color: '#6A7186', fontSize: '14px' }}>
              Sem resultados para estes filtros. Alargue o período ou remova o
              tipo.
            </div>
          )}
          {result.articles.map((a, i) => (
            <article key={a.pmid} style={card}>
              <h2
                style={{
                  margin: 0,
                  fontSize: '15.5px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                  lineHeight: 1.35,
                }}
              >
                <a
                  href={a.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {titlesPt?.[i] ?? a.title}
                </a>
              </h2>
              {titlesPt?.[i] && (
                <p
                  style={{
                    margin: '3px 0 0',
                    fontSize: '12px',
                    color: '#9AA1B4',
                    fontStyle: 'italic',
                  }}
                >
                  {a.title}
                </p>
              )}
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '12.5px',
                  color: '#3D4257',
                }}
              >
                <strong>{a.journal}</strong> · {a.pubDate}
                {a.pubTypes
                  .filter(t => /trial|review|meta/i.test(t))
                  .slice(0, 2)
                  .map(t => (
                    <span
                      key={t}
                      style={{
                        marginLeft: 6,
                        padding: '1px 8px',
                        borderRadius: 999,
                        backgroundColor: '#EEF2FF',
                        color: '#2743A6',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {t}
                    </span>
                  ))}
              </p>
              {a.authors.length > 0 && (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '12px',
                    color: '#6A7186',
                  }}
                >
                  {a.authors.join(', ')}
                  {a.authors.length >= 6 ? ' et al.' : ''}
                </p>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                <AbstractButton pmid={a.pmid} canTranslate={canTranslate} />
                <a
                  href={a.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#2743A6',
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={13} /> PubMed
                </a>
                {a.doi && (
                  <a
                    href={`https://doi.org/${a.doi}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#2743A6',
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={13} /> Artigo completo (DOI)
                  </a>
                )}
              </div>
            </article>
          ))}
        </>
      )}
      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        {canTranslate
          ? 'Títulos e resumos traduzidos automaticamente por IA — o original está sempre disponível. Nada fica registado no CDC Manager.'
          : 'Conteúdo científico em inglês, tal como publicado. Nada fica registado no CDC Manager.'}
      </p>
    </div>
  );
}
