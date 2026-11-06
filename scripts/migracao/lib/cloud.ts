// 📄 scripts/migracao/lib/cloud.ts
// =============================================================================
// Upload de BLOBs do Dentoral para o Cloudinary (conta da clínica).
// Requer CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
// =============================================================================

import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

let configured = false;
export function ensureCloudinary(): void {
  if (configured) return;
  if (!process.env.CLOUDINARY_URL) throw new Error('CLOUDINARY_URL em falta no .env.local');
  cloudinary.config({ secure: true });
  configured = true;
}

export type UploadResult = { publicId: string; resourceType: 'image' | 'raw'; format: string | null; bytes: number };

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'pdf']);

export function resourceTypeFor(ext: string | null): 'image' | 'raw' {
  return ext && IMAGE_EXT.has(ext.toLowerCase()) ? 'image' : 'raw';
}

export function extOf(fileName: string | null, fileType: string | null): string | null {
  const fromName = fileName?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  const t = (fromName ?? fileType ?? '').replace(/^\./, '').toLowerCase();
  return t || null;
}

/** Devolve null se já existir um asset com este publicId (idempotência). */
export async function existsInCloudinary(publicId: string, resourceType: 'image' | 'raw'): Promise<boolean> {
  ensureCloudinary();
  try {
    await cloudinary.api.resource(publicId, { resource_type: resourceType });
    return true;
  } catch (e: any) {
    if (e?.error?.http_code === 404 || e?.http_code === 404) return false;
    throw e;
  }
}

export async function uploadBuffer(buf: Buffer, publicId: string, ext: string | null, opts: { folder?: string } = {}): Promise<UploadResult> {
  ensureCloudinary();
  const resourceType = resourceTypeFor(ext);
  const res = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: resourceType, overwrite: false, invalidate: false, type: 'private', ...(opts.folder ? { folder: opts.folder } : {}) },
      (err, result) => (err || !result ? reject(err ?? new Error('upload sem resultado')) : resolve(result)),
    );
    stream.end(buf);
  });
  return { publicId: res.public_id, resourceType, format: res.format ?? ext, bytes: res.bytes ?? buf.length };
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}
