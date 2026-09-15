// 📄 src/lib/pubmed.ts
// =============================================================================
// CDC Manager — Cliente PubMed (NCBI E-utilities) — servidor
// -----------------------------------------------------------------------------
// Gratuito e sem chave (≤3 pedidos/s). Identificamos a aplicação com `tool`
// e `email` como a NCBI recomenda; se existir NCBI_API_KEY no ambiente,
// passa a 10 pedidos/s. Resultados cacheados 1 h (fetch revalidate) — as
// novidades não mudam ao minuto e poupamos a NCBI.
//   searchPubmed → ESearch (ids, ordenados por data) + ESummary (metadados)
//   fetchAbstract → EFetch (texto do abstract)
// =============================================================================

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const IDENT = () => {
  const p = new URLSearchParams({
    tool: 'cdc-manager',
    email: process.env.NCBI_EMAIL ?? 'geral@cdcolombo.pt',
  });
  if (process.env.NCBI_API_KEY) p.set('api_key', process.env.NCBI_API_KEY);
  return p;
};

export interface PubmedArticle {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string; // texto como a NCBI devolve ("2026 Aug 12")
  authors: string[];
  pubTypes: string[];
  doi: string | null;
  url: string;
}

export interface PubmedSearchResult {
  total: number;
  articles: PubmedArticle[];
  query: string;
}

/** Temas pré-definidos — termos PubMed já construídos (títulos em PT) */
export const PUBMED_TOPICS: { key: string; label: string; term: string }[] = [
  {
    key: 'geral',
    label: 'Medicina dentária (geral)',
    term: '(dentistry[MeSH] OR "oral health"[tiab] OR dental[tiab])',
  },
  {
    key: 'implantes',
    label: 'Implantologia',
    term: '("dental implants"[MeSH] OR "dental implant"[tiab])',
  },
  {
    key: 'perio',
    label: 'Periodontologia',
    term: '(periodontitis[MeSH] OR periodontal[tiab] OR "peri-implantitis"[tiab])',
  },
  {
    key: 'endo',
    label: 'Endodontia',
    term: '(endodontics[MeSH] OR "root canal"[tiab] OR endodontic[tiab])',
  },
  {
    key: 'orto',
    label: 'Ortodontia',
    term: '(orthodontics[MeSH] OR "clear aligner"[tiab] OR orthodontic[tiab])',
  },
  {
    key: 'protese',
    label: 'Prótese e reabilitação',
    term: '(prosthodontics[MeSH] OR "dental prosthesis"[tiab] OR "zirconia crown"[tiab] OR "CAD-CAM"[tiab])',
  },
  {
    key: 'cirurgia',
    label: 'Cirurgia oral',
    term: '("oral surgery"[tiab] OR "third molar"[tiab] OR "tooth extraction"[MeSH])',
  },
  {
    key: 'pediatria',
    label: 'Odontopediatria',
    term: '("pediatric dentistry"[MeSH] OR "children"[tiab] AND dental[tiab])',
  },
  {
    key: 'estetica',
    label: 'Estética e harmonização',
    term: '("esthetic dentistry"[tiab] OR "tooth bleaching"[MeSH] OR "botulinum toxin"[tiab] AND facial[tiab])',
  },
  {
    key: 'dentisteria',
    label: 'Dentisteria e cáries',
    term: '("dental caries"[MeSH] OR "composite resin"[tiab] OR "minimally invasive dentistry"[tiab])',
  },
];

export const PUBMED_PERIODS: { key: string; label: string; days: number }[] = [
  { key: '7', label: 'Última semana', days: 7 },
  { key: '30', label: 'Último mês', days: 30 },
  { key: '90', label: 'Últimos 3 meses', days: 90 },
  { key: '365', label: 'Último ano', days: 365 },
];

/** Só ensaios/revisões ou tudo */
export const PUBMED_KINDS: {
  key: string;
  label: string;
  term: string | null;
}[] = [
  { key: 'all', label: 'Todos os artigos', term: null },
  {
    key: 'trials',
    label: 'Ensaios clínicos',
    term: '(randomized controlled trial[pt] OR clinical trial[pt])',
  },
  {
    key: 'reviews',
    label: 'Revisões sistemáticas',
    term: '(systematic review[pt] OR meta-analysis[pt])',
  },
];

export function buildQuery(params: {
  topicKey: string;
  q: string;
  kindKey: string;
}): string {
  const topic =
    PUBMED_TOPICS.find(t => t.key === params.topicKey) ?? PUBMED_TOPICS[0];
  const kind = PUBMED_KINDS.find(k => k.key === params.kindKey)?.term ?? null;
  const free = params.q.trim();
  const parts = [topic.term];
  if (free) parts.push(`(${free})`);
  if (kind) parts.push(kind);
  parts.push('hasabstract[filter]', 'english[la]');
  return parts.join(' AND ');
}

export async function searchPubmed(params: {
  term: string;
  days: number;
  max?: number;
}): Promise<PubmedSearchResult> {
  const max = Math.min(params.max ?? 20, 50);
  const sp = IDENT();
  sp.set('db', 'pubmed');
  sp.set('term', params.term);
  sp.set('sort', 'date');
  sp.set('retmode', 'json');
  sp.set('retmax', String(max));
  sp.set('datetype', 'pdat');
  sp.set('reldate', String(params.days));
  const sRes = await fetch(`${BASE}/esearch.fcgi?${sp}`, {
    next: { revalidate: 3600 },
  });
  if (!sRes.ok) throw new Error(`PubMed indisponível (${sRes.status})`);
  const sJson = (await sRes.json()) as {
    esearchresult?: { idlist?: string[]; count?: string };
  };
  const ids = sJson.esearchresult?.idlist ?? [];
  const total = Number(sJson.esearchresult?.count ?? 0);
  if (ids.length === 0) return { total, articles: [], query: params.term };

  const mp = IDENT();
  mp.set('db', 'pubmed');
  mp.set('id', ids.join(','));
  mp.set('retmode', 'json');
  const mRes = await fetch(`${BASE}/esummary.fcgi?${mp}`, {
    next: { revalidate: 3600 },
  });
  if (!mRes.ok) throw new Error(`PubMed indisponível (${mRes.status})`);
  const mJson = (await mRes.json()) as {
    result?: Record<string, Record<string, unknown>>;
  };
  const articles: PubmedArticle[] = ids
    .map(id => mJson.result?.[id])
    .filter(
      (r): r is Record<string, unknown> => !!r && typeof r.title === 'string',
    )
    .map(r => {
      const ids2 =
        (r.articleids as { idtype: string; value: string }[] | undefined) ?? [];
      const doi = ids2.find(x => x.idtype === 'doi')?.value ?? null;
      return {
        pmid: String(r.uid),
        title: String(r.title).replace(/\.$/, ''),
        journal: String(r.fulljournalname ?? r.source ?? ''),
        pubDate: String(r.pubdate ?? ''),
        authors: ((r.authors as { name: string }[] | undefined) ?? [])
          .map(a => a.name)
          .slice(0, 6),
        pubTypes: (r.pubtype as string[] | undefined) ?? [],
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`,
      };
    });
  return { total, articles, query: params.term };
}

export async function fetchAbstract(pmid: string): Promise<string> {
  if (!/^\d{1,9}$/.test(pmid)) throw new Error('PMID inválido');
  const p = IDENT();
  p.set('db', 'pubmed');
  p.set('id', pmid);
  p.set('rettype', 'abstract');
  p.set('retmode', 'text');
  const res = await fetch(`${BASE}/efetch.fcgi?${p}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`PubMed indisponível (${res.status})`);
  const text = await res.text();
  // O texto vem com cabeçalho (revista, título, autores); o abstract é o
  // bloco maior depois dos autores. Devolvemos limpo de linhas vazias extra.
  return text
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
