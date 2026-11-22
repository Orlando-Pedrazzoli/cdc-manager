// 📄 src/lib/storage-types.ts
// =============================================================================
// Tipos partilhados entre servidor (lib/storage.ts) e client components.
// Ficheiro sem imports: importá-lo num componente 'use client' não arrasta
// o SDK S3 nem o sharp para o bundle do browser.
// =============================================================================

/** Ticket de upload direto browser → R2 (URL PUT pré-assinada) */
export interface UploadTicket {
  /** URL para o PUT (o ficheiro vai como body, sem FormData) */
  uploadUrl: string;
  method: 'PUT';
  /** Headers que o browser TEM de enviar exatamente assim (entram na assinatura) */
  headers: Record<string, string>;
}

/** O que o browser declara sobre o ficheiro ao pedir o ticket */
export interface UploadFileInfo {
  name: string;
  type: string;
  size: number;
}
