// 📄 src/lib/cloudinary.ts
// =============================================================================
// CDC Manager — Cloudinary (documentos clínicos de pacientes)
// -----------------------------------------------------------------------------
// GUARDRAILS RGPD (dados de saúde, art. 9.º) — inegociáveis:
// · Assets SEMPRE type 'authenticated' — sem URL pública, nem por engano.
// · Public IDs OPACOS: {pasta}/pacientes/{documentId} (ObjectId) — nunca
//   nome do paciente nem nº de processo no caminho.
// · URLs de visualização ASSINADAS, geradas on-demand server-side só após
//   RBAC (nunca guardadas na BD, nunca enviadas por email).
// · Download do ORIGINAL via private_download_url COM EXPIRAÇÃO (10 min).
//   Nota honesta: as URLs de visualização assinadas (sign_url) não expiram
//   no plano free — expiração nelas exige token-based auth (add-on pago).
//   Mitigação v1: só são geradas dentro de páginas autenticadas.
//
// FLUXO DE UPLOAD (evita o limite de body da Vercel/server actions):
//   1. Action cria "ticket": documentId novo + assinatura → client
//   2. Browser faz POST DIRETO a api.cloudinary.com com a assinatura
//   3. Action de registo VERIFICA o asset no Cloudinary (fonte de verdade
//      para bytes/formato — nunca confiar no client) e grava o Document
// =============================================================================

import { v2 as cloudinary } from 'cloudinary';

// -----------------------------------------------------------------------------
// Config lazy (evita exigir env vars em build time)
// -----------------------------------------------------------------------------
let configured = false;

function cld(): typeof cloudinary {
  if (!configured) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        '[cloudinary] CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET em falta no .env.local',
      );
    }
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

const ROOT_FOLDER = () => process.env.CLOUDINARY_FOLDER || 'cdc-manager';

/** Duração das URLs de download do original (segundos) */
const DOWNLOAD_URL_TTL_SECONDS = 10 * 60;

// -----------------------------------------------------------------------------
// Public IDs opacos
// -----------------------------------------------------------------------------

/** Public ID de um documento de paciente: {root}/pacientes/{documentId} */
export function patientDocumentPublicId(documentId: string): string {
  return `${ROOT_FOLDER()}/pacientes/${documentId}`;
}

/** Public ID da foto de um produto de stock: {root}/stock/{productId}.
 *  Substituir foto = novo upload para o MESMO public_id (overwrite);
 *  nota: o CDN pode servir a derivada antiga até expirar o cache. */
export function stockProductPublicId(productId: string): string {
  return `${ROOT_FOLDER()}/stock/${productId}`;
}

// -----------------------------------------------------------------------------
// 1. Assinatura de upload direto browser → Cloudinary
// -----------------------------------------------------------------------------

export interface CloudinaryUploadTicket {
  /** POST target: https://api.cloudinary.com/v1_1/{cloud}/auto/upload */
  uploadUrl: string;
  /** Campos a enviar no FormData junto com `file` (iterar Object.entries —
   *  o conjunto varia: transformation só existe quando pedida) */
  fields: {
    api_key: string;
    timestamp: number;
    signature: string;
    public_id: string;
    type: 'authenticated';
    transformation?: string;
  };
}

/**
 * Assina um upload para o public_id dado. O endpoint /auto/upload deteta o
 * resource_type (jpg/png/pdf → image; .dcm e outros → raw).
 *
 * `incomingTransformation` (opcional): o Cloudinary aplica NA RECEÇÃO e
 * guarda só o resultado — ex. 'c_limit,w_1600,q_auto' encolhe uma foto de
 * telemóvel de 6 MB para ~200 KB no storage. USAR SÓ em material não
 * clínico (fotos de stock); documentos clínicos (RX/TAC) guardam SEMPRE o
 * original intacto — qualidade diagnóstica não se comprime.
 *
 * Tudo o que vai no pedido (exceto file e api_key) entra na assinatura.
 */
export function signDocumentUpload(
  publicId: string,
  opts: { incomingTransformation?: string } = {},
): CloudinaryUploadTicket {
  const c = cld();
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign: Record<string, string | number> = {
    public_id: publicId,
    timestamp,
    type: 'authenticated',
  };
  if (opts.incomingTransformation) {
    paramsToSign.transformation = opts.incomingTransformation;
  }
  const signature = c.utils.api_sign_request(
    paramsToSign,
    c.config().api_secret as string,
  );
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${c.config().cloud_name}/auto/upload`,
    fields: {
      api_key: c.config().api_key as string,
      timestamp,
      signature,
      public_id: publicId,
      type: 'authenticated',
      ...(opts.incomingTransformation
        ? { transformation: opts.incomingTransformation }
        : {}),
    },
  };
}

// -----------------------------------------------------------------------------
// 2. Verificação pós-upload (fonte de verdade: o Cloudinary, não o client)
// -----------------------------------------------------------------------------

export interface CloudinaryAssetInfo {
  resourceType: 'image' | 'raw';
  format: string | null;
  bytes: number;
  originalFilename: string | null;
}

/**
 * Confirma que o asset existe e devolve os metadados reais.
 * Tenta image primeiro (jpg/png/pdf), depois raw (DICOM etc.).
 * Devolve null se o asset não existir (upload falhou/não aconteceu).
 */
export async function fetchDocumentAssetInfo(
  publicId: string,
): Promise<CloudinaryAssetInfo | null> {
  const c = cld();
  for (const resourceType of ['image', 'raw'] as const) {
    try {
      const res = (await c.api.resource(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
      })) as {
        format?: string;
        bytes?: number;
        original_filename?: string;
      };
      return {
        resourceType,
        format: res.format ?? null,
        bytes: res.bytes ?? 0,
        originalFilename: res.original_filename ?? null,
      };
    } catch {
      // não é deste resource_type (ou não existe) — tentar o próximo
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// 3. URLs de visualização (assinadas) e download (com expiração)
// -----------------------------------------------------------------------------

/**
 * URL assinada de PREVIEW para assets image (inclui PDF: 1.ª página como
 * jpg). `width` limita sem cortar; qualidade automática.
 * Gerar SEMPRE server-side, dentro de página/action com RBAC verificado.
 */
export function signedPreviewUrl(
  publicId: string,
  opts: { width?: number; isPdf?: boolean } = {},
): string {
  const { width = 1600, isPdf = false } = opts;
  return cld().url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    sign_url: true,
    secure: true,
    transformation: [
      {
        width,
        crop: 'limit',
        quality: 'auto',
        // PDF: rasterizar a 1.ª página; imagens: formato automático
        ...(isPdf
          ? { page: 1, fetch_format: 'jpg' }
          : { fetch_format: 'auto' }),
      },
    ],
  });
}

/**
 * URL de download do ORIGINAL (qualquer resource_type, incl. raw/DICOM),
 * com attachment e EXPIRAÇÃO de 10 minutos. Para o botão "Transferir".
 */
export function signedDownloadUrl(params: {
  publicId: string;
  resourceType: 'image' | 'raw';
  format: string | null;
}): string {
  return cld().utils.private_download_url(
    params.publicId,
    params.format ?? '',
    {
      resource_type: params.resourceType,
      type: 'authenticated',
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS,
    },
  );
}

// -----------------------------------------------------------------------------
// 4. Remoção física — SÓ para apagamento RGPD deliberado (fase posterior).
//    O void normal NÃO chama isto (never delete; o asset fica preservado).
// -----------------------------------------------------------------------------

export async function destroyDocumentAsset(
  publicId: string,
  resourceType: 'image' | 'raw',
): Promise<boolean> {
  try {
    const res = (await cld().uploader.destroy(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
      invalidate: true,
    })) as { result?: string };
    return res.result === 'ok';
  } catch (err) {
    console.error('[cloudinary] destroy falhou:', err);
    return false;
  }
}

/**
 * Upload SERVER-SIDE de um data URL (PNG pequeno — assinaturas de
 * consentimento). Ao contrário dos documentos grandes (ticket + POST direto
 * do browser), a assinatura (~20KB) sobe pelo servidor na própria action:
 * uma só viagem, sem segundo passo de confirmação. Asset `authenticated`
 * como todos os dados de saúde.
 */
export async function uploadAuthenticatedDataUrl(
  publicId: string,
  dataUrl: string,
): Promise<{ format: string | null; bytes: number }> {
  const c = cld();
  const res = await c.uploader.upload(dataUrl, {
    public_id: publicId,
    type: 'authenticated',
    resource_type: 'image',
    overwrite: false,
  });
  return { format: res.format ?? null, bytes: res.bytes ?? 0 };
}
