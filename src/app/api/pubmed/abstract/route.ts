// 📄 src/app/api/pubmed/abstract/route.ts
// CDC Manager — Abstract de um artigo PubMed (a pedido, cacheado 24 h).
// Só utilizadores autenticados da clínica (médico/admin/receção).
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchAbstract } from '@/lib/pubmed';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role === 'patient') {
    return NextResponse.json({ error: 'Sem permissões.' }, { status: 403 });
  }
  const pmid = new URL(req.url).searchParams.get('pmid') ?? '';
  try {
    const text = await fetchAbstract(pmid);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 502 },
    );
  }
}
