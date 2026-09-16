// 📄 src/actions/confirm.ts
// =============================================================================
// CDC Manager — Server Action PÚBLICA: confirmar presença por token (POST)
// -----------------------------------------------------------------------------
// Isolada das restantes actions de propósito: é a ÚNICA escrita do sistema
// sem sessão, autorizada apenas pelo token único da marcação (24 bytes
// aleatórios, índice unique). Antes a confirmação acontecia no GET da
// página /confirmar/[token] ao renderizar — o que deixava scanners de links
// de email (Outlook Safe Links, Gmail, antivírus) "confirmar" a consulta
// sem o paciente tocar em nada. Agora a página só LÊ; confirmar exige o
// clique no botão (POST), que os scanners não fazem.
//
// Regras (iguais às da página):
//   · pending + futura → confirmed (confirmedVia='email')
//   · updateOne CONDICIONAL por status: se a receção confirmar em
//     simultâneo, matchedCount=0 e a página mostra "já confirmada"
//   · nunca revela nada sobre tokens inválidos (redirect neutro)
// =============================================================================

'use server';

import { redirect } from 'next/navigation';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export async function confirmAttendanceByTokenAction(
  formData: FormData,
): Promise<void> {
  const token = String(formData.get('token') ?? '');
  if (!TOKEN_RE.test(token)) redirect('/confirmar/invalido');

  await dbConnect();
  const now = new Date();
  const res = await Appointment.updateOne(
    { confirmToken: token, status: 'pending', startAt: { $gt: now } },
    { $set: { status: 'confirmed', confirmedAt: now, confirmedVia: 'email' } },
  );

  // ?c=1 → a página sabe que veio do clique e mostra "Presença confirmada!"
  // (se modifiedCount=0, a página lê o estado real e explica o que se passou)
  redirect(`/confirmar/${token}${res.modifiedCount === 1 ? '?c=1' : ''}`);
}
