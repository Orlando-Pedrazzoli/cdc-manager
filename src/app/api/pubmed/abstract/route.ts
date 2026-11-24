// 📄 src/app/api/pubmed/abstract/route.ts
// Abstract de um artigo PubMed, disponível apenas a utilizadores ativos da clínica.
import { NextResponse } from 'next/server';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { fetchAbstract } from '@/lib/pubmed';
import { translateAbstract } from '@/lib/translate';

// Um resumo publicado não muda: o browser do médico guarda-o 1 dia
const BROWSER_CACHE = { 'Cache-Control': 'private, max-age=86400' };
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const session = await getVerifiedSession(['admin', 'receptionist', 'doctor']);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sem permissões.' }, { status: 401 });
  }

  const url = new URL(req.url);
  const pmid = url.searchParams.get('pmid')?.trim() ?? '';
  if (!/^\d{1,12}$/.test(pmid)) {
    return NextResponse.json({ error: 'PMID inválido.' }, { status: 400 });
  }

  const lang = url.searchParams.get('lang') === 'pt' ? 'pt' : 'en';

  try {
    const text = await fetchAbstract(pmid);
    if (lang === 'pt') {
      // O EFetch devolve também cabeçalho bibliográfico. Traduzimos o bloco
      // mais extenso, que normalmente corresponde ao corpo do abstract.
      const blocks = text.split(/\n\n+/);
      const body = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
      const pt = await translateAbstract(pmid, body);
      // só a tradução conseguida fica no browser; a falha repete-se ao clicar
      return NextResponse.json(
        { text: pt ?? text, translated: !!pt },
        { headers: pt ? BROWSER_CACHE : NO_STORE },
      );
    }
    return NextResponse.json(
      { text, translated: false },
      { headers: BROWSER_CACHE },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 502 },
    );
  }
}
