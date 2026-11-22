// 📄 src/app/api/organizacao/logo/route.ts
// =============================================================================
// GET /api/organizacao/logo — serve o logótipo da organização a partir do R2.
// -----------------------------------------------------------------------------
// PÚBLICA de propósito: o logo é branding (não é dado de saúde) e aparece em
// sítios sem sessão (login, quiosque). O bucket é privado, por isso o
// ficheiro passa por aqui. O URL gravado leva ?v=<timestamp>, por isso a
// resposta pode ficar em cache um ano (um logo novo = URL novo).
// SVG carregado por um admin é servido com CSP restritiva e nosniff: aberto
// diretamente no browser não consegue correr scripts.
// =============================================================================

import { getObjectBuffer, organizationLogoKey } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const obj = await getObjectBuffer(organizationLogoKey());
    if (!obj) return new Response('Logo não encontrado', { status: 404 });
    return new Response(new Uint8Array(obj.body), {
      status: 200,
      headers: {
        'Content-Type': obj.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        ...(obj.etag ? { ETag: obj.etag } : {}),
      },
    });
  } catch (err) {
    console.error('[logo] leitura do R2 falhou:', err);
    return new Response('Logo indisponível', { status: 503 });
  }
}
