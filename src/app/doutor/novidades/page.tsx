// 📄 src/app/doutor/novidades/page.tsx
// =============================================================================
// CDC Manager — Médico: Novidades científicas (PubMed)
// -----------------------------------------------------------------------------
// "Uma distração para os médicos estudarem novidades enquanto não atendem."
// Pesquisa nas E-utilities do NCBI (gratuito, sem chave): tema pré-definido
// de medicina dentária × período × tipo (ensaios / revisões / tudo) +
// pesquisa livre. Lista ordenada por data com revista, autores, tipo, links
// PubMed/DOI e o resumo a pedido. Nada é gravado. Cache 1 h.
//
// Rapidez (24/11/2026): a página já não espera pelo PubMed nem pela
// tradução. Cabeçalho e filtros aparecem logo; a lista chega em streaming
// (Suspense + esqueleto) e os títulos em português entram quando a tradução
// responde. Filtros e pesquisa navegam sem recarregar a página, e o filtro
// clicado fica marcado no instante do clique (FilterChip).
// =============================================================================

import { Suspense } from 'react';
import Form from 'next/form';
import { BookOpenText, Search } from 'lucide-react';
import { auth } from '@/lib/auth';
import {
  buildQuery,
  PUBMED_TOPICS,
  PUBMED_PERIODS,
  PUBMED_KINDS,
} from '@/lib/pubmed';
import { translationEnabled } from '@/lib/translate';
import { FilterChip } from '@/components/novidades/FilterChip';
import {
  NovidadesResults,
  NovidadesSkeleton,
} from '@/components/novidades/NovidadesResults';

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
  const [sp, session] = await Promise.all([searchParams, auth()]);
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

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      tema: topicKey,
      periodo: periodKey,
      tipo: kindKey,
      ...(lang === 'en' ? { lang } : {}),
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
            <FilterChip
              key={t.key}
              href={href({ tema: t.key })}
              active={t.key === topicKey}
            >
              {t.label}
            </FilterChip>
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
            <FilterChip
              key={p.key}
              href={href({ periodo: p.key })}
              active={p.key === periodKey}
            >
              {p.label}
            </FilterChip>
          ))}
          <span style={{ width: 10 }} />
          {PUBMED_KINDS.map(k => (
            <FilterChip
              key={k.key}
              href={href({ tipo: k.key })}
              active={k.key === kindKey}
            >
              {k.label}
            </FilterChip>
          ))}
          {canTranslate && (
            <>
              <span style={{ marginLeft: 'auto' }} />
              <FilterChip href={href({ lang: 'pt' })} active={lang === 'pt'}>
                Português
              </FilterChip>
              <FilterChip href={href({ lang: 'en' })} active={lang === 'en'}>
                Original (inglês)
              </FilterChip>
            </>
          )}
        </div>
        {/* next/form: a pesquisa navega sem recarregar a página */}
        <Form
          action='/doutor/novidades'
          scroll={false}
          style={{ display: 'flex', gap: 8 }}
        >
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
              key={q}
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
        </Form>
      </div>

      {/* Resultados — a `key` faz o esqueleto aparecer a cada filtro novo */}
      <Suspense
        key={`${term}|${days}|${lang}`}
        fallback={<NovidadesSkeleton />}
      >
        <NovidadesResults
          term={term}
          days={days}
          lang={lang}
          canTranslate={canTranslate}
        />
      </Suspense>

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        {canTranslate
          ? 'Títulos e resumos traduzidos automaticamente por IA — o original está sempre disponível. Nada fica registado no CDC Manager.'
          : 'Conteúdo científico em inglês, tal como publicado. Nada fica registado no CDC Manager.'}
      </p>
    </div>
  );
}
