// 📄 src/components/novidades/NovidadesResults.tsx
// =============================================================================
// CDC Manager — Novidades científicas: resultados (Server Component)
// -----------------------------------------------------------------------------
// Fica dentro de um <Suspense> na página: cabeçalho e filtros aparecem logo
// e a lista chega quando o PubMed responde (esqueleto entretanto).
// A tradução dos títulos NÃO bloqueia a lista: os artigos aparecem com o
// título original e cada título troca para português quando a tradução
// chega (um <Suspense> por título, todos sobre a mesma promessa). Só o
// título troca — o resumo já aberto não é perturbado.
// =============================================================================

import { Suspense, type CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import { searchPubmed, type PubmedArticle } from '@/lib/pubmed';
import { translateTitles } from '@/lib/translate';
import { AbstractButton } from '@/components/novidades/AbstractButton';

const card: CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '16px 18px',
};
const h2: CSSProperties = {
  margin: 0,
  fontSize: '15.5px',
  fontWeight: 700,
  color: '#1B2A6B',
  lineHeight: 1.35,
};
const extLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: '12px',
  fontWeight: 700,
  color: '#2743A6',
  textDecoration: 'none',
};

function Title({
  article,
  pt,
}: {
  article: PubmedArticle;
  pt?: string | null;
}) {
  return (
    <>
      <h2 style={h2}>
        <a
          href={article.url}
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {pt ?? article.title}
        </a>
      </h2>
      {pt && (
        <p
          style={{
            margin: '3px 0 0',
            fontSize: '12px',
            color: '#9AA1B4',
            fontStyle: 'italic',
          }}
        >
          {article.title}
        </p>
      )}
    </>
  );
}

async function TranslatedTitle({
  article,
  index,
  titles,
}: {
  article: PubmedArticle;
  index: number;
  titles: Promise<(string | null)[]>;
}) {
  const pt = (await titles)[index];
  return <Title article={article} pt={pt} />;
}

export async function NovidadesResults({
  term,
  days,
  lang,
  canTranslate,
}: {
  term: string;
  days: number;
  lang: 'pt' | 'en';
  canTranslate: boolean;
}) {
  let result;
  try {
    result = await searchPubmed({ term, days, max: 25 });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    const message = timedOut
      ? 'O PubMed está a demorar a responder'
      : e instanceof Error
        ? e.message
        : 'PubMed indisponível.';
    return (
      <div
        style={{
          ...card,
          borderColor: '#F5D9A6',
          backgroundColor: '#FFF4E5',
          color: '#9A6700',
          fontSize: '14px',
        }}
      >
        {message} — tente novamente dentro de instantes.
      </div>
    );
  }

  const { articles } = result;
  // arranca já, sem esperar: os títulos entram um a um quando chegar
  // (translateTitles nunca rejeita — devolve null onde falhar)
  const titles =
    lang === 'pt' && articles.length > 0
      ? translateTitles(articles.map(a => a.title))
      : null;

  return (
    <>
      <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
        {result.total.toLocaleString('pt-PT')} artigo(s) encontrado(s) · a
        mostrar os {articles.length} mais recentes
      </p>
      {articles.length === 0 && (
        <div style={{ ...card, color: '#6A7186', fontSize: '14px' }}>
          Sem resultados para estes filtros. Alargue o período ou remova o tipo.
        </div>
      )}
      {articles.map((a, i) => (
        <article key={a.pmid} style={card}>
          {titles ? (
            <Suspense fallback={<Title article={a} />}>
              <TranslatedTitle article={a} index={i} titles={titles} />
            </Suspense>
          ) : (
            <Title article={a} />
          )}
          <p
            style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#3D4257' }}
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
              style={{ margin: '4px 0 0', fontSize: '12px', color: '#6A7186' }}
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
              style={extLink}
            >
              <ExternalLink size={13} /> PubMed
            </a>
            {a.doi && (
              <a
                href={`https://doi.org/${a.doi}`}
                target='_blank'
                rel='noopener noreferrer'
                style={extLink}
              >
                <ExternalLink size={13} /> Artigo completo (DOI)
              </a>
            )}
          </div>
        </article>
      ))}
    </>
  );
}

/** Silhueta da lista enquanto o PubMed responde. */
export function NovidadesSkeleton() {
  const bar = (width: string, height: number, mt = 0): CSSProperties => ({
    width,
    height,
    marginTop: mt,
    borderRadius: 6,
    backgroundColor: '#E8EBF4',
    animation: 'cdcPulse 1.4s ease-in-out infinite',
  });
  return (
    <div
      role='status'
      aria-label='A procurar artigos no PubMed'
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={bar('260px', 13)} />
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={card}>
          <div style={bar(i % 2 ? '72%' : '88%', 17)} />
          <div style={bar('46%', 12, 10)} />
          <div style={bar('60%', 11, 8)} />
          <div style={bar('150px', 26, 12)} />
        </div>
      ))}
    </div>
  );
}
