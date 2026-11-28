// 📄 src/actions/citizen-card.ts
// =============================================================================
// CDC Manager — Actions: leitura do Cartão de Cidadão (ponto 36)
// -----------------------------------------------------------------------------
// Só gestão e receção. startCardReadAction cria o código de uso único (3
// minutos) que o leitor do posto usa para entregar os dados em
// /api/cartao-cidadao; takeCardReadAction devolve-os ao formulário UMA vez e
// apaga-os. Nada disto grava na ficha do paciente.
// =============================================================================

'use server';

import { createHash, randomBytes } from 'node:crypto';
import { dbConnect } from '@/lib/mongodb';
import { getVerifiedSession } from '@/lib/get-verified-session';
import CardReadTicket from '@/models/CardReadTicket';
import {
  CARD_TICKET_TTL_SECONDS,
  CARD_TOKEN_REGEX,
  type CitizenCardData,
} from '@/lib/citizen-card';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function startCardReadAction(): Promise<
  { token: string } | { error: string }
> {
  const session = await getVerifiedSession(['admin', 'receptionist']);
  if (!session?.user?.id) return { error: 'Sem permissões.' };
  await dbConnect();
  // um pedido de leitura de cada vez por utilizador
  await CardReadTicket.deleteMany({ userId: session.user.id });
  const token = randomBytes(32).toString('base64url');
  await CardReadTicket.create({
    tokenHash: hash(token),
    userId: session.user.id,
    expiresAt: new Date(Date.now() + CARD_TICKET_TTL_SECONDS * 1000),
  });
  return { token };
}

export type CardReadResult =
  | { status: 'waiting' }
  | { status: 'done'; data: CitizenCardData }
  | { status: 'error'; error: string };

export async function takeCardReadAction(token: string): Promise<CardReadResult> {
  const session = await getVerifiedSession(['admin', 'receptionist']);
  if (!session?.user?.id) return { status: 'error', error: 'Sem permissões.' };
  if (typeof token !== 'string' || !CARD_TOKEN_REGEX.test(token))
    return { status: 'error', error: 'Pedido de leitura inválido.' };
  await dbConnect();
  const ticket = await CardReadTicket.findOne({
    tokenHash: hash(token),
    userId: session.user.id,
  }).lean();
  if (!ticket || ticket.expiresAt.getTime() < Date.now())
    return {
      status: 'error',
      error: 'A leitura expirou. Carregue de novo em "Ler Cartão de Cidadão".',
    };
  if (!ticket.filledAt) return { status: 'waiting' };
  // uso único: os dados saem daqui e o registo é apagado
  await CardReadTicket.deleteOne({ _id: ticket._id });
  if (ticket.error) return { status: 'error', error: ticket.error };
  return { status: 'done', data: ticket.data as CitizenCardData };
}
