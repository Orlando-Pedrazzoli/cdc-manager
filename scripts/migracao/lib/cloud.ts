// 📄 scripts/migracao/lib/cloud.ts
// =============================================================================
// Upload de BLOBs do Dentoral para o armazenamento da app (Cloudflare R2).
// Usa as mesmas variáveis da app (R2_ENDPOINT / R2_ACCESS_KEY_ID /
// R2_SECRET_ACCESS_KEY / R2_BUCKET) e o mesmo módulo (src/lib/storage.ts):
//   · bucket privado; a app assina as URLs de preview/download
//   · documentos: {root}/pacientes/{documentId}   · fotos: {root}/pacientes-foto/{patientId}
//   · miniaturas geradas no upload (como no registo pela app)
// Até 21/11/2026 isto ia para a Cloudinary; as chaves mantêm-se iguais.
// =============================================================================

import {
  contentTypeForFormat,
  deleteObjectAndDerivatives,
  fetchObjectInfo,
  generateDerivatives,
  putObject,
  resourceTypeFor,
} from '@/lib/storage';

/** Prefixo raiz das chaves (igual ao da app) */
export const ROOT_FOLDER = () =>
  process.env.STORAGE_PREFIX || process.env.CLOUDINARY_FOLDER || 'cdc-manager';

export type UploadResult = { publicId: string; resourceType: 'image' | 'raw'; format: string | null; bytes: number };

export function extOf(fileName: string | null, fileType: string | null): string | null {
  const fromName = fileName?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  const t = (fromName ?? fileType ?? '').replace(/^\./, '').toLowerCase();
  return t || null;
}

/** true se já existir um objeto com esta chave (idempotência). */
export async function existsInStorage(publicId: string): Promise<boolean> {
  return (await fetchObjectInfo(publicId)) !== null;
}

/** Sobe o buffer para a chave dada e gera as miniaturas (imagens). */
export async function uploadBuffer(buf: Buffer, publicId: string, ext: string | null): Promise<UploadResult> {
  const contentType = contentTypeForFormat(ext);
  await putObject(publicId, buf, contentType);
  await generateDerivatives(publicId, { body: buf, contentType }).catch(err =>
    console.warn(`\n[cloud] miniaturas de ${publicId} falharam: ${errMsg(err)}`),
  );
  return { publicId, resourceType: resourceTypeFor(contentType), format: ext, bytes: buf.length };
}

/** Remove o ficheiro e as miniaturas (09b — documentos com conteúdo errado). */
export async function removeFromStorage(publicId: string): Promise<boolean> {
  return deleteObjectAndDerivatives(publicId);
}

export function errMsg(e: any): string {
  return e?.error?.message ?? e?.message ?? (typeof e === 'string' ? e : JSON.stringify(e));
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 5000 * (i + 1))); }
  }
  throw last;
}
