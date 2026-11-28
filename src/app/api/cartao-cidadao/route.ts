// 📄 src/app/api/cartao-cidadao/route.ts
// Entrega dos dados lidos pelo leitor do posto (lib/citizen-card.ts).
// Sem sessão: quem autentica é o código de uso único criado pelo formulário
// (só o hash está guardado, vale 3 minutos e aceita UMA entrega). O corpo é
// limpo antes de guardar; a ficha do paciente não é tocada aqui.
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import CardReadTicket from '@/models/CardReadTicket';
import {
  CARD_TOKEN_REGEX,
  citizenCardUsable,
  normalizeCitizenCard,
  type CitizenCardRaw,
} from '@/lib/citizen-card';

const MAX_BODY = 8 * 1024;
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const text = await request.text().catch(() => '');
  if (!text || text.length > MAX_BODY)
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400, headers: noStore });
  let body: { token?: unknown; data?: unknown; error?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400, headers: noStore });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  if (!CARD_TOKEN_REGEX.test(token))
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400, headers: noStore });

  const readerError =
    typeof body.error === 'string' ? body.error.trim().slice(0, 200) : '';
  const data =
    body.data && typeof body.data === 'object'
      ? normalizeCitizenCard(body.data as CitizenCardRaw)
      : null;
  const usable = !!data && citizenCardUsable(data);

  await dbConnect();
  const updated = await CardReadTicket.findOneAndUpdate(
    {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      filledAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        filledAt: new Date(),
        data: usable ? data : null,
        error: usable
          ? null
          : readerError || 'O leitor não devolveu o nome e a data de nascimento.',
      },
    },
  );
  if (!updated)
    return NextResponse.json(
      { error: 'Código expirado ou já usado.' },
      { status: 410, headers: noStore },
    );
  return NextResponse.json({ ok: true }, { headers: noStore });
}
