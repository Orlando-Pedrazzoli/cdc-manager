// 📄 src/lib/greeting.ts
// =============================================================================
// CDC Manager — Saudação das dashboards (lógica pura)
// -----------------------------------------------------------------------------
// "Bom dia / Boa tarde / Boa noite" + nome, pela hora de LISBOA — nunca pela
// hora do servidor (Vercel corre em UTC) nem pela do posto. Sem I/O: corre
// igual no servidor e nos testes (scripts/tests/greeting.test.ts).
//
// Períodos (uso corrente em Portugal):
//   05:00–11:59 → Bom dia · 12:00–19:59 → Boa tarde · 20:00–04:59 → Boa noite
//
// As dashboards são Server Components com <AutoRefresh/>, por isso a saudação
// muda sozinha na passagem de período, sem recarregar a página.
// =============================================================================

import { CLINIC_TIME_ZONE } from '@/lib/weather';

export type GreetingPeriod = 'morning' | 'afternoon' | 'night';

const LABEL: Record<GreetingPeriod, string> = {
  morning: 'Bom dia',
  afternoon: 'Boa tarde',
  night: 'Boa noite',
};

const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Hora (0–23) na parede de Lisboa para um instante UTC. */
export function lisbonHour(now: Date): number {
  return Number(hourFmt.format(now)) % 24;
}

export function greetingPeriod(now: Date): GreetingPeriod {
  const h = lisbonHour(now);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 20) return 'afternoon';
  return 'night';
}

// "Dr." "Dra." "Dr.ª" "Drª" "Prof." "Prof.ª" "Doutor" "Doutora"
const TITLE_RE = /^(dr|dra|dr\.?ª|prof|profa|prof\.?ª|doutor|doutora)\.?$/i;

/**
 * Nome curto para a saudação.
 *  "Dra. Marta Fonseca" → "Dra. Marta" (mantém o título que está na ficha)
 *  "Victor Ruiz"        → "Victor"
 * Não inventa "Dr./Dra." quando a ficha não o tem — o género não é conhecido.
 */
export function greetingName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (TITLE_RE.test(parts[0]) && parts.length > 1) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
}

/** "Boa tarde, Dra. Marta" — sem nome fica só "Boa tarde". */
export function buildGreeting(
  fullName: string | null | undefined,
  now: Date = new Date(),
): string {
  const label = LABEL[greetingPeriod(now)];
  const name = greetingName(fullName);
  return name ? `${label}, ${name}` : label;
}
