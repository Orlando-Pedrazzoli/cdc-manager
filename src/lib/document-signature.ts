// 📄 src/lib/document-signature.ts
// =============================================================================
// CDC Manager — Assinatura do médico em imagem, para os documentos em PDF
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta A8): "Não precisamos de Cartão de Cidadão nem
// de Chave Móvel Digital. O médico entrega a imagem da assinatura, ela fica
// guardada no sistema e sai impressa no documento. Depois a receção coloca o
// carimbo."
//
// A imagem é guardada já tratada (PNG, fundo branco retirado das margens,
// no máximo 600×220) por actions/doctor-signature.ts. Aqui só se lê.
// Nunca lança: se a leitura falhar, o documento sai sem a imagem (fica a
// linha para assinar à mão).
// =============================================================================

import sharp from 'sharp';
import { doctorSignatureKey, getObjectBuffer } from '@/lib/storage';

export const SIGNATURE_MAX_BYTES = 800 * 1024;
export const SIGNATURE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Trata a imagem entregue pelo médico: apara as margens e limita o tamanho */
export async function normalizeSignatureImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // respeita a orientação da fotografia do telemóvel
    .flatten({ background: '#FFFFFF' })
    .trim({ background: '#FFFFFF', threshold: 30 })
    .resize({ width: 600, height: 220, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

export async function doctorSignatureDataUrl(doctorId: string): Promise<string | null> {
  try {
    const obj = await getObjectBuffer(doctorSignatureKey(doctorId));
    if (!obj) return null;
    return `data:image/png;base64,${Buffer.from(obj.body).toString('base64')}`;
  } catch (err) {
    console.error('[documentos] assinatura do médico indisponível', err);
    return null;
  }
}
