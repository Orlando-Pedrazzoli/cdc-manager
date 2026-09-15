// 📄 src/app/api/pubmed/abstract/route.ts
// CDC Manager — Abstract de um artigo PubMed (a pedido, cacheado 24 h).
// Só utilizadores autenticados da clínica (médico/admin/receção).
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchAbstract } from '@/lib/pubmed';
import { translateAbstract } from '@/lib/translate';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role === 'patient') {
    return NextResponse.json({ error: 'Sem permissões.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const pmid = url.searchParams.get('pmid') ?? '';
  const lang = url.searchParams.get('lang') === 'pt' ? 'pt' : 'en';
  try {
    const text = await fetchAbstract(pmid);
    if (lang === 'pt') {
      // Só o corpo do abstract (sem o cabeçalho revista/título/autores que
      // o EFetch em texto traz antes): o bloco maior do texto
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
