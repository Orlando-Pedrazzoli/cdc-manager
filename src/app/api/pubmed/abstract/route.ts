// 📄 src/app/api/pubmed/abstract/route.ts
// Abstract de um artigo PubMed, disponível apenas a utilizadores ativos da clínica.
import { NextResponse } from 'next/server';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { fetchAbstract } from '@/lib/pubmed';
import { translateAbstract } from '@/lib/translate';

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
      return NextResponse.json({ text: pt ?? text, translated: !!pt });
    }
    return NextResponse.json({ text, translated: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 502 },
    );
  }
}
