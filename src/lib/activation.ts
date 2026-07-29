// 📄 src/lib/activation.ts
// =============================================================================
// CDC Manager — Geração e validação de códigos de ativação
// -----------------------------------------------------------------------------
// Usada pelas Server Actions de auth. Nunca expõe códigos em claro exceto no
// momento da geração (para envio imediato por email/WhatsApp).
// =============================================================================

import crypto from 'crypto';
import { dbConnect } from '@/lib/mongodb';
import ActivationCode, {
  type ActivationPurpose,
} from '@/models/ActivationCode';

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L) — legível por telefone
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SEGMENT_LENGTH = 4;
const CODE_VALIDITY_DAYS = 7;

/** Gera segmento aleatório criptograficamente seguro (crypto, nunca Math.random) */
function randomSegment(): string {
  const bytes = crypto.randomBytes(SEGMENT_LENGTH);
  let out = '';
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Formato apresentado ao utilizador: CDC-XXXX-XXXX */
export function generatePlainCode(): string {
  return `CDC-${randomSegment()}-${randomSegment()}`;
}

/** Normaliza input do utilizador: maiúsculas, sem espaços (aceita com/sem hífens) */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s]/g, '');
}

export function hashCode(plainCode: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeCode(plainCode))
    .digest('hex');
}

/**
 * Cria um novo código para o utilizador, invalidando todos os anteriores
 * do mesmo propósito (regenerar convite = convite antigo morre).
 * Devolve o código EM CLARO — único momento em que existe fora do hash.
 * O chamador é responsável por enviá-lo (Resend/WhatsApp) e nunca o logar.
 */
export async function createActivationCode(params: {
  userId: string;
  purpose: ActivationPurpose;
  createdBy: string;
  sentVia?: 'email' | 'whatsapp' | 'manual';
}): Promise<{ plainCode: string; expiresAt: Date }> {
  await dbConnect();

  // Invalida códigos anteriores do mesmo user+propósito
  await ActivationCode.deleteMany({
    userId: params.userId,
    purpose: params.purpose,
    usedAt: null,
  });

  const plainCode = generatePlainCode();
  const expiresAt = new Date(
    Date.now() + CODE_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  );

  await ActivationCode.create({
    userId: params.userId,
    codeHash: hashCode(plainCode),
    purpose: params.purpose,
    expiresAt,
    createdBy: params.createdBy,
    sentVia: params.sentVia ?? 'email',
  });

  return { plainCode, expiresAt };
}

/**
 * Valida um código submetido pelo utilizador. Se válido, marca-o como usado
 * de forma ATÓMICA (findOneAndUpdate) — impede corrida de dois submits
 * simultâneos a consumirem o mesmo código.
 * Devolve o userId associado, ou null se inválido/expirado/já usado.
 */
export async function consumeActivationCode(params: {
  plainCode: string;
  purpose: ActivationPurpose;
}): Promise<{ userId: string } | null> {
  await dbConnect();

  const doc = await ActivationCode.findOneAndUpdate(
    {
      codeHash: hashCode(params.plainCode),
      purpose: params.purpose,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true },
  );

  if (!doc) return null;
  return { userId: doc.userId.toString() };
}
