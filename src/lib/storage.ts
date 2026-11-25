// 📄 src/lib/storage.ts
// =============================================================================
// CDC Manager — Armazenamento de ficheiros (Cloudflare R2, API S3)
// -----------------------------------------------------------------------------
// Até 11/2026 os ficheiros estavam na Cloudinary (lib/cloudinary.ts, removido).
// Bucket PRIVADO, jurisdição UE.
//
// GUARDRAILS RGPD (dados de saúde, art. 9.º) — inegociáveis:
// · Nenhum objeto é público. Toda a leitura passa por URL PRÉ-ASSINADA, gerada
//   server-side só depois do RBAC, com validade curta (nunca guardada na BD,
//   nunca enviada por email). Melhor que a Cloudinary free: aqui expiram.
// · Chaves OPACAS e IGUAIS aos public IDs da Cloudinary
//   ({root}/pacientes/{documentId}, {root}/pacientes-foto/{patientId}, …):
//   a BD (Document.publicId, Patient.photoPublicId, Product.imagePublicId)
//   não muda, e a recarga do backup é 1:1. Sem extensão na chave — o tipo
//   vive no Content-Type do objeto.
//
// FLUXO DE UPLOAD (evita o limite de body da Vercel/server actions):
//   1. Action cria "ticket": chave nova + URL PUT pré-assinada (Content-Type
//      fixado na assinatura) → client
//   2. Browser faz PUT DIRETO ao R2 com o ficheiro como body
//   3. Action de registo VERIFICA o objeto no R2 (HEAD: bytes e tipo reais —
//      nunca confiar no client), rejeita se exceder o limite, gera as
//      miniaturas e grava o registo
//   Nota: o R2 não suporta POST com policy, por isso o limite de tamanho só
//   se aplica no passo 3 (o objeto a mais é apagado).
//
// MINIATURAS: o R2 não transforma imagens (a Cloudinary fazia-o na URL).
//   Geram-se UMA vez com sharp quando o ficheiro é registado:
//     _derivados/{chave}/thumb.webp    (≤ 480 px — listas, avatares)
//     _derivados/{chave}/preview.webp  (≤ 1600 px — visualizador)
//   O original fica INTACTO (qualidade diagnóstica). PDFs não têm miniatura
//   (o sharp não rasteriza PDF): o visualizador abre o próprio PDF.
//   Imagens que o sharp não lê (BMP do Dentoral, ficheiros estranhos): as
//   "miniaturas" são cópia do original — o browser mostra BMP nativamente.
//   Assim TODA a imagem não-PDF tem derivados e a UI não precisa de saber.
// =============================================================================

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import type { UploadFileInfo, UploadTicket } from '@/lib/storage-types';

export type { UploadFileInfo, UploadTicket };

// -----------------------------------------------------------------------------
// Config lazy (evita exigir env vars em build time)
// -----------------------------------------------------------------------------
let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.R2_BUCKET) {
      throw new Error(
        '[storage] R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET em falta',
      );
    }
    client = new S3Client({
      region: 'auto', // exigido pelo SDK, ignorado pelo R2
      endpoint, // https://<account>.eu.r2.cloudflarestorage.com (jurisdição UE)
      credentials: { accessKeyId, secretAccessKey },
      // só para testes locais contra um S3 simulado (o R2 aceita os dois estilos)
      forcePathStyle: process.env.R2_FORCE_PATH_STYLE === '1',
      // SDK ≥ 3.729 acrescenta checksums CRC32 por omissão; nas URLs
      // pré-assinadas isso parte o PUT do browser no R2 (SignatureDoesNotMatch)
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

const BUCKET = () => process.env.R2_BUCKET as string;

/** Prefixo raiz das chaves. Mantém o valor da Cloudinary para as chaves
 *  continuarem iguais às gravadas na BD. */
const ROOT = () =>
  process.env.STORAGE_PREFIX || process.env.CLOUDINARY_FOLDER || 'cdc-manager';

/** Validade das URLs de download do original */
export const DOWNLOAD_URL_TTL_SECONDS = 10 * 60;
/** Validade das URLs de visualização (páginas ficam abertas algum tempo) */
const VIEW_URL_TTL_SECONDS = 2 * 60 * 60;
/** Validade da URL de upload (PUT direto do browser) */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** Limites por omissão (verificados no registo) */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // RX/TAC/DICOM grandes (o registo lê o ficheiro para gerar miniaturas)
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // fotos de telemóvel

// -----------------------------------------------------------------------------
// Chaves opacas (iguais aos public IDs da Cloudinary)
// -----------------------------------------------------------------------------

/** Documento de paciente: {root}/pacientes/{documentId} */
export function patientDocumentKey(documentId: string): string {
  return `${ROOT()}/pacientes/${documentId}`;
}

/** Foto de identificação do paciente: {root}/pacientes-foto/{patientId} */
export function patientPhotoKey(patientId: string): string {
  return `${ROOT()}/pacientes-foto/${patientId}`;
}

/** Foto de produto de stock: {root}/stock/{productId}.
 *  Substituir = novo upload para a MESMA chave (as miniaturas são refeitas). */
export function stockProductKey(productId: string): string {
  return `${ROOT()}/stock/${productId}`;
}

/** Imagem da assinatura do médico, impressa nos documentos (respostas de
 *  25/11, A8). Nunca é servida diretamente: só entra nos PDFs e na
 *  pré-visualização da ficha do médico (gestão). */
export function doctorSignatureKey(doctorId: string): string {
  return `${ROOT()}/medicos-assinatura/${doctorId}`;
}

/** Logótipo da organização (servido por rota da app, não pelo R2 diretamente) */
export function organizationLogoKey(): string {
  return `${ROOT()}/organizacao/logo`;
}

export type DerivativeVariant = 'thumb' | 'preview';

const DERIVATIVE_WIDTH: Record<DerivativeVariant, number> = {
  thumb: 480,
  preview: 1600,
};

export function derivativeKey(key: string, variant: DerivativeVariant): string {
  return `_derivados/${key}/${variant}.webp`;
}

// -----------------------------------------------------------------------------
// Tipos de ficheiro
// -----------------------------------------------------------------------------

const MIME_TO_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/dicom': 'dcm',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/rtf': 'rtf',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'video/mp4': 'mp4',
};

const FORMAT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_FORMAT).map(([m, f]) => [f, m]),
);
FORMAT_TO_MIME.jpeg = 'image/jpeg';
FORMAT_TO_MIME.tiff = 'image/tiff';
FORMAT_TO_MIME.dicom = 'application/dicom';
FORMAT_TO_MIME.tiff = 'image/tiff';
FORMAT_TO_MIME.dib = 'image/bmp';

/** Content-Type a partir de um formato/extensão ('jpg', 'pdf', 'dcm'…) */
export function contentTypeForFormat(format: string | null | undefined): string {
  return (format && FORMAT_TO_MIME[format.toLowerCase().replace(/^\./, '')]) || 'application/octet-stream';
}

/** Tipos que o sharp consegue reduzir para miniatura */
const RASTER_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/heic', 'image/heif',
]);

function extOf(filename: string | null | undefined): string | null {
  const m = filename?.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : null;
}

/** Content-Type a usar para um ficheiro: o declarado pelo browser se for
 *  conhecido, senão o deduzido da extensão, senão binário genérico. */
export function resolveContentType(
  declared: string | null | undefined,
  filename?: string | null,
): string {
  const d = (declared ?? '').toLowerCase().split(';')[0].trim();
  if (d && d !== 'application/octet-stream') return d;
  const ext = extOf(filename);
  return (ext && FORMAT_TO_MIME[ext]) || 'application/octet-stream';
}

export function formatFromContentType(
  contentType: string | null | undefined,
  filename?: string | null,
): string | null {
  const ct = (contentType ?? '').toLowerCase().split(';')[0].trim();
  return MIME_TO_FORMAT[ct] ?? extOf(filename);
}

/** 'image' = imagens e PDF (têm visualização); 'raw' = o resto (DICOM, etc.).
 *  Mantém a semântica do campo Document.resourceType já gravado na BD. */
export function resourceTypeFor(contentType: string | null | undefined): 'image' | 'raw' {
  const ct = (contentType ?? '').toLowerCase();
  return ct.startsWith('image/') || ct === 'application/pdf' ? 'image' : 'raw';
}

// Metadados S3: só ASCII nos headers → nome original vai URI-encoded
function encodeMeta(v: string): string {
  return encodeURIComponent(v).slice(0, 1024);
}
function decodeMeta(v: string | undefined): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

// -----------------------------------------------------------------------------
// 1. Upload direto browser → R2 (URL PUT pré-assinada)
// -----------------------------------------------------------------------------


/**
 * Assina um PUT para a chave dada. O Content-Type fica preso à assinatura:
 * o browser tem de o enviar exatamente assim (não o pode trocar).
 * O nome original NÃO vai como metadado (headers x-amz-meta-* em URLs
 * pré-assinadas comportam-se de forma diferente entre clientes): a action de
 * registo recebe-o do formulário, como já recebe o título.
 */
export async function createUploadTicket(
  key: string,
  file: { contentType?: string | null; filename?: string | null },
): Promise<UploadTicket> {
  if (!key) throw new Error('[storage] chave vazia');
  const contentType = resolveContentType(file.contentType, file.filename);
  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(['content-type']) },
  );
  return { uploadUrl, method: 'PUT', headers: { 'Content-Type': contentType } };
}

// -----------------------------------------------------------------------------
// 2. Verificação pós-upload (fonte de verdade: o R2, não o client)
// -----------------------------------------------------------------------------

export interface StoredObjectInfo {
  resourceType: 'image' | 'raw';
  contentType: string;
  format: string | null;
  bytes: number;
  originalFilename: string | null;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/** Metadados reais do objeto, ou null se não existir. */
export async function fetchObjectInfo(key: string): Promise<StoredObjectInfo | null> {
  let res: HeadObjectCommandOutput;
  try {
    res = await s3().send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key }));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  const originalFilename = decodeMeta(res.Metadata?.['original-filename']);
  const contentType = resolveContentType(res.ContentType, originalFilename);
  return {
    resourceType: resourceTypeFor(contentType),
    contentType,
    format: formatFromContentType(contentType, originalFilename),
    bytes: res.ContentLength ?? 0,
    originalFilename,
  };
}

// -----------------------------------------------------------------------------
// 3. Leitura: URLs pré-assinadas
// -----------------------------------------------------------------------------
// A data de assinatura é arredondada à meia hora: dentro dessa janela a URL
// do mesmo objeto é IGUAL, o que deixa o browser usar a cache (uma URL nova
// a cada render obrigaria a descarregar outra vez todas as miniaturas).

function roundedSigningDate(): Date {
  const step = 30 * 60 * 1000;
  return new Date(Math.floor(Date.now() / step) * step);
}

async function signedGet(
  key: string,
  opts: { ttl: number; disposition?: string; contentType?: string; stable?: boolean },
): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ...(opts.disposition ? { ResponseContentDisposition: opts.disposition } : {}),
      ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
    }),
    {
      // com data arredondada, somar a janela para garantir ≥ ttl de validade
      expiresIn: opts.stable ? opts.ttl + 30 * 60 : opts.ttl,
      ...(opts.stable ? { signingDate: roundedSigningDate() } : {}),
    },
  );
}

/**
 * URL de MINIATURA/PRÉ-VISUALIZAÇÃO (webp gerado no registo).
 * width ≤ 480 → thumb; maior → preview. Para PDF devolve null (não há
 * miniatura): usar viewUrl() para abrir o PDF no browser.
 * Gerar SEMPRE server-side, dentro de página/action com RBAC verificado.
 */
export async function previewUrl(
  key: string,
  opts: { width?: number; isPdf?: boolean; fresh?: boolean } = {},
): Promise<string | null> {
  if (opts.isPdf) return null;
  const variant: DerivativeVariant = (opts.width ?? 1600) <= DERIVATIVE_WIDTH.thumb ? 'thumb' : 'preview';
  // fresh: fotos que se substituem na mesma chave (paciente, stock) — uma URL
  // nova a cada render evita o browser mostrar a foto antiga da cache
  return signedGet(derivativeKey(key, variant), { ttl: VIEW_URL_TTL_SECONDS, stable: !opts.fresh });
}

/**
 * URLs de um documento clínico para as listas (mesma semântica da Cloudinary):
 *   thumbUrl   — miniatura (imagens); null em PDF e não-imagens (UI mostra ícone)
 *   previewUrl — "Ver": imagem grande, ou o próprio PDF no visualizador;
 *                null em não-imagens (DICOM etc. só têm download)
 */
export async function documentUrls(doc: {
  publicId: string;
  resourceType?: string | null;
  format?: string | null;
}): Promise<{ thumbUrl: string | null; previewUrl: string | null }> {
  if (doc.resourceType !== 'image') return { thumbUrl: null, previewUrl: null };
  if ((doc.format ?? '').toLowerCase() === 'pdf') {
    return { thumbUrl: null, previewUrl: await viewUrl(doc.publicId, { contentType: 'application/pdf' }) };
  }
  const [thumbUrl, big] = await Promise.all([
    previewUrl(doc.publicId, { width: DERIVATIVE_WIDTH.thumb }),
    previewUrl(doc.publicId, { width: DERIVATIVE_WIDTH.preview }),
  ]);
  return { thumbUrl, previewUrl: big };
}

/** URL para ABRIR o original no browser (PDF no visualizador, imagem em tamanho real). */
export async function viewUrl(
  key: string,
  opts: { contentType?: string | null } = {},
): Promise<string> {
  return signedGet(key, {
    ttl: VIEW_URL_TTL_SECONDS,
    disposition: 'inline',
    ...(opts.contentType ? { contentType: opts.contentType } : {}),
    stable: true,
  });
}

/**
 * URL de DOWNLOAD do original (attachment) com EXPIRAÇÃO de 10 minutos.
 * Para o botão "Transferir". O nome do ficheiro é só cosmético.
 */
export async function downloadUrl(params: {
  key: string;
  filename?: string | null;
  format?: string | null;
}): Promise<string> {
  const base = (params.filename ?? 'documento').replace(/[\r\n"\\/]/g, '_').slice(0, 150);
  const name = params.format && !extOf(base) ? `${base}.${params.format}` : base;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return signedGet(params.key, {
    ttl: DOWNLOAD_URL_TTL_SECONDS,
    disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
}

// -----------------------------------------------------------------------------
// 4. Escrita server-side (ficheiros pequenos gerados no servidor)
// -----------------------------------------------------------------------------

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  opts: { filename?: string | null; cacheControl?: string } = {},
): Promise<{ bytes: number; format: string | null; contentType: string }> {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
      ...(opts.cacheControl ? { CacheControl: opts.cacheControl } : {}),
      ...(opts.filename ? { Metadata: { 'original-filename': encodeMeta(opts.filename) } } : {}),
    }),
  );
  return { bytes: body.length, format: formatFromContentType(contentType, opts.filename), contentType };
}

/**
 * Upload de um data URL (PNG pequeno — assinaturas de consentimento).
 * Sobe pelo servidor na própria action: uma só viagem.
 */
export async function uploadDataUrl(
  key: string,
  dataUrl: string,
): Promise<{ bytes: number; format: string | null }> {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!m) throw new Error('[storage] data URL inválido');
  const contentType = m[1].toLowerCase();
  const body = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  const res = await putObject(key, body, contentType);
  await generateDerivatives(key, { body, contentType }).catch(err =>
    console.error('[storage] miniaturas da assinatura falharam:', err),
  );
  return { bytes: res.bytes, format: res.format };
}

/** Upload de um PDF gerado no servidor (documentos clínicos, consentimentos). */
export async function uploadPdf(
  key: string,
  pdf: Buffer,
  filename?: string,
): Promise<{ bytes: number; format: 'pdf' }> {
  await putObject(key, pdf, 'application/pdf', { filename });
  return { bytes: pdf.length, format: 'pdf' };
}

/** Lê o objeto inteiro para memória (originais pequenos, miniaturas, logo). */
export async function getObjectBuffer(
  key: string,
): Promise<{ body: Buffer; contentType: string; etag: string | null } | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return {
      body: Buffer.from(bytes),
      contentType: res.ContentType ?? 'application/octet-stream',
      etag: res.ETag ?? null,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 5. Miniaturas (sharp) — geradas no registo e na recarga do backup
// -----------------------------------------------------------------------------

/**
 * Gera thumb.webp e preview.webp para uma imagem. Devolve false se o tipo
 * não tem miniatura (PDF, DICOM, BMP…) — a UI trata disso.
 * `source` evita voltar a descarregar quando o buffer já está em memória.
 */
export async function generateDerivatives(
  key: string,
  source?: { body: Buffer; contentType: string },
): Promise<'gerados' | 'copia' | false> {
  const src = source ?? (await getObjectBuffer(key));
  if (!src) return false;
  const ct = src.contentType.toLowerCase().split(';')[0].trim();
  if (!ct.startsWith('image/')) return false; // PDF, DICOM, Office…: sem miniatura

  if (RASTER_MIMES.has(ct)) {
    try {
      const outputs: Buffer[] = [];
      for (const variant of ['thumb', 'preview'] as const) {
        outputs.push(
          await sharp(src.body, { failOn: 'none', animated: false })
            .rotate() // respeita a orientação EXIF das fotos de telemóvel
            .resize({ width: DERIVATIVE_WIDTH[variant], height: DERIVATIVE_WIDTH[variant], fit: 'inside', withoutEnlargement: true })
            .webp({ quality: variant === 'thumb' ? 72 : 82 })
            .toBuffer(),
        );
      }
      await Promise.all(
        (['thumb', 'preview'] as const).map((variant, i) =>
          putObject(derivativeKey(key, variant), outputs[i], 'image/webp', { cacheControl: 'private, max-age=86400' }),
        ),
      );
      return 'gerados';
    } catch (err) {
      console.warn(`[storage] sharp não conseguiu ler ${key} (${ct}) — miniatura = cópia do original:`, (err as Error).message);
    }
  }

  // BMP e afins: o browser mostra-os; a "miniatura" é o próprio original
  await Promise.all(
    (['thumb', 'preview'] as const).map(variant =>
      putObject(derivativeKey(key, variant), src.body, ct, { cacheControl: 'private, max-age=86400' }),
    ),
  );
  return 'copia';
}

/**
 * Fotos de identificação e de catálogo (NÃO clínicas): reduz o original no
 * servidor — o equivalente à transformação na receção da Cloudinary
 * (paciente ≤ 800 px, stock ≤ 1600 px) — e gera as miniaturas.
 * Devolve null se o ficheiro não for uma imagem legível (o chamador apaga-o
 * e recusa).
 */
export async function normalizePhoto(
  key: string,
  maxPx: number,
): Promise<{ bytes: number } | null> {
  const src = await getObjectBuffer(key);
  if (!src) return null;
  let out: Buffer;
  try {
    out = await sharp(src.body, { failOn: 'none', animated: false })
      .rotate()
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
  await putObject(key, out, 'image/jpeg');
  await generateDerivatives(key, { body: out, contentType: 'image/jpeg' });
  return { bytes: out.length };
}

// -----------------------------------------------------------------------------
// 6. Remoção física — SÓ para substituição de fotos e apagamento RGPD
//    deliberado. O void normal de documentos NÃO chama isto (never delete).
// -----------------------------------------------------------------------------

export async function deleteObjectAndDerivatives(key: string): Promise<boolean> {
  try {
    const res = await s3().send(
      new DeleteObjectsCommand({
        Bucket: BUCKET(),
        Delete: {
          Objects: [
            { Key: key },
            { Key: derivativeKey(key, 'thumb') },
            { Key: derivativeKey(key, 'preview') },
          ],
          Quiet: true,
        },
      }),
    );
    if (res.Errors?.length) {
      console.error('[storage] remoção parcial:', res.Errors);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[storage] remoção falhou:', err);
    return false;
  }
}
