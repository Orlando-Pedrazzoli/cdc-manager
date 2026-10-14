// 📄 src/lib/kiosk.ts
// =============================================================================
// CDC Manager — Tablet de assinatura: identidade do dispositivo
// -----------------------------------------------------------------------------
// O tablet não tem conta de utilizador: identifica-se por um segredo da
// CLÍNICA (Clinic.kioskToken) guardado em cookie httpOnly no próprio
// dispositivo. Fluxo:
//   1. Admin em Configurações → Clínicas → "Ligar tablet" gera o token e
//      mostra a ligação /quiosque/ligar/{token}.
//   2. Abre-se essa ligação UMA vez no tablet: a route grava a cookie e
//      redireciona para /quiosque. A partir daí o tablet só precisa do
//      /quiosque (adicionar ao ecrã inicial do Chrome).
//   3. Regenerar o token em Configurações desliga o tablet antigo.
// A cookie dura 1 ano; o tablet fica "ligado" sem ninguém ter de fazer
// login nele — e sem conseguir ver mais nada do sistema.
// =============================================================================

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import Clinic, { type ClinicDoc } from '@/models/Clinic';

export const KIOSK_COOKIE = 'cdc_kiosk';
export const KIOSK_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 ano

export function newKioskToken(): string {
  return randomBytes(24).toString('hex'); // 48 chars
}

export const KIOSK_TOKEN_RE = /^[0-9a-f]{48}$/;

/** Clínica a que este tablet está ligado (pela cookie), ou null */
export async function getKioskClinic(): Promise<ClinicDoc | null> {
  const jar = await cookies();
  const token = jar.get(KIOSK_COOKIE)?.value;
  if (!token || !KIOSK_TOKEN_RE.test(token)) return null;
  return Clinic.findOne({ kioskToken: token, isActive: true })
    .select('+kioskToken')
    .then(c => c ?? null);
}
