// 📄 src/lib/upload-client.ts
// =============================================================================
// Upload direto browser → R2 com o ticket devolvido pelas actions.
// Só corre no browser (client components). O ficheiro vai como body do PUT
// com os headers EXATOS do ticket (o Content-Type entra na assinatura).
// =============================================================================

import type { UploadFileInfo, UploadTicket } from '@/lib/storage-types';

/** Info do ficheiro para pedir o ticket (o server decide o Content-Type final) */
export function fileInfo(file: File): UploadFileInfo {
  return { name: file.name, type: file.type, size: file.size };
}

/** Envia o ficheiro; devolve true se o R2 o aceitou. */
export async function putFile(ticket: UploadTicket, file: File): Promise<boolean> {
  try {
    const res = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
    });
    return res.ok;
  } catch {
    return false;
  }
}
