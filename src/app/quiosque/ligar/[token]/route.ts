// 📄 src/app/quiosque/ligar/[token]/route.ts
// =============================================================================
// CDC Manager — Tablet de assinatura: ligar o dispositivo a uma clínica
// -----------------------------------------------------------------------------
// Abre-se UMA vez no tablet (ligação gerada em Configurações → Clínicas).
// Valida o token contra Clinic.kioskToken, grava-o em cookie httpOnly
// (1 ano) e redireciona para /quiosque. Token inválido → /quiosque mostra
// "não ligado". O token nunca fica na barra de endereços depois disto.
// =============================================================================

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import Clinic from '@/models/Clinic';
import {
  KIOSK_COOKIE,
  KIOSK_COOKIE_MAX_AGE,
  KIOSK_TOKEN_RE,
} from '@/lib/kiosk';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const target = new URL('/quiosque', req.url);
  const res = NextResponse.redirect(target);
  if (!KIOSK_TOKEN_RE.test(token)) {
    res.cookies.delete(KIOSK_COOKIE);
    return res;
  }
  await dbConnect();
  const ok = await Clinic.exists({ kioskToken: token, isActive: true });
  if (!ok) {
    res.cookies.delete(KIOSK_COOKIE);
    return res;
  }
  res.cookies.set(KIOSK_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: KIOSK_COOKIE_MAX_AGE,
  });
  return res;
}
