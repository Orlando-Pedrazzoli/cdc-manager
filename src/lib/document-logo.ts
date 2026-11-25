// 📄 src/lib/document-logo.ts
// =============================================================================
// CDC Manager — Logo para o cabeçalho dos documentos em PDF
// -----------------------------------------------------------------------------
// 9.ª ronda (ponto 01, Victor, 17 e 18/11): "padronizar todos os documentos
// emitidos com a logo do Centro Dentário Colombo".
//
// Se a gestão carregou um logo em Configurações (guardado no R2), usa-se
// esse, convertido para PNG pequeno (o gerador de PDF não lê SVG nem WebP).
// Em qualquer outro caso, ou se a leitura falhar, usa-se o logo de origem
// embutido. Nunca lança: um documento sai sempre, com logo.
// =============================================================================

import sharp from 'sharp';
import { getOrganization } from '@/models/Organization';
import { getObjectBuffer, organizationLogoKey } from '@/lib/storage';
import { LOGO_CDC_PDF_DATA_URL } from '@/lib/data/logo-cdc-pdf';

const UPLOADED_LOGO_ROUTE = '/api/organizacao/logo';

export async function documentLogoDataUrl(): Promise<string> {
  try {
    const org = await getOrganization();
    if (org.logoUrl?.startsWith(UPLOADED_LOGO_ROUTE)) {
      const obj = await getObjectBuffer(organizationLogoKey());
      if (obj) {
        const png = await sharp(Buffer.from(obj.body))
          .resize({ width: 240, height: 240, fit: 'inside' })
          .png()
          .toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
      }
    }
  } catch (err) {
    console.error('[documentos] logo carregado indisponível; uso o de origem', err);
  }
  return LOGO_CDC_PDF_DATA_URL;
}
