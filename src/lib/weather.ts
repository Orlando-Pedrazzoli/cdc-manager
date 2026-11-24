// 📄 src/lib/weather.ts
// =============================================================================
// CDC Manager — Relógio e meteorologia da barra superior (lógica pura)
// -----------------------------------------------------------------------------
// Sem I/O: o que aqui está corre igual no servidor, no browser e nos testes
// (scripts/tests/weather.test.ts). A chamada ao fornecedor vive em
// weather-source.ts (só servidor).
//
// Fonte: MET Norway — Locationforecast 2.0 (api.met.no). Gratuita também
// para uso comercial (licença CC BY 4.0, com atribuição), sem chave.
// A previsão vem hora a hora; guardamos as próximas horas para que o ecrã
// acompanhe a temperatura ao longo do dia sem voltar a pedir dados.
// =============================================================================

/** Fuso da clínica — o relógio mostra sempre a hora de Lisboa. */
export const CLINIC_TIME_ZONE = 'Europe/Lisbon';

/** Ponto da previsão: Centro Colombo (a Buraca fica a ~4 km — mesmo tempo). */
export const CLINIC_WEATHER_POINT = {
  lat: 38.7545,
  lon: -9.1886,
  place: 'Lisboa',
} as const;

/** Uma hora de previsão. `t` = início da hora (ms desde epoch, UTC). */
export type WeatherSlot = { t: number; temp: number; symbol: string };

/** O que /api/tempo devolve. `now` = relógio do servidor (ms). */
export type WeatherPayload = {
  now: number;
  place: string;
  slots: WeatherSlot[];
};

export type WeatherKind =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'thunder'
  | 'snow';

const HOUR = 3_600_000;
/** Horas guardadas: cobre a validade da cache (3 h) com folga larga. */
export const MAX_SLOTS = 24;

// --- Leitura da resposta do fornecedor -----------------------------------------

type MetEntry = {
  time?: unknown;
  data?: {
    instant?: { details?: { air_temperature?: unknown } };
    next_1_hours?: { summary?: { symbol_code?: unknown } };
    next_6_hours?: { summary?: { symbol_code?: unknown } };
  };
};

/**
 * Extrai as horas úteis da resposta "compact". Tolerante: entradas sem hora
 * ou sem temperatura são ignoradas; resposta inesperada → lista vazia.
 * Começa na hora em curso (a anterior a `nowMs`), não nas que já passaram.
 */
export function parseMetForecast(json: unknown, nowMs: number): WeatherSlot[] {
  const series = (json as { properties?: { timeseries?: unknown } } | null)
    ?.properties?.timeseries;
  if (!Array.isArray(series)) return [];

  const slots: WeatherSlot[] = [];
  for (const raw of series as MetEntry[]) {
    const t = typeof raw?.time === 'string' ? Date.parse(raw.time) : NaN;
    const temp = raw?.data?.instant?.details?.air_temperature;
    if (!Number.isFinite(t) || typeof temp !== 'number') continue;
    if (!Number.isFinite(temp)) continue;
    const symbol =
      raw.data?.next_1_hours?.summary?.symbol_code ??
      raw.data?.next_6_hours?.summary?.symbol_code;
    slots.push({ t, temp, symbol: typeof symbol === 'string' ? symbol : '' });
  }
  slots.sort((a, b) => a.t - b.t);

  // primeira hora a manter: a última que já começou
  let start = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].t <= nowMs) start = i;
    else break;
  }
  return slots.slice(start, start + MAX_SLOTS);
}

/**
 * A hora de previsão que vale para `nowMs`: a última já começada. Se os
 * dados forem todos do futuro, aceita a primeira até 1 h de distância; se
 * forem velhos demais (mais de 90 min depois da última hora) devolve null —
 * mais vale não mostrar temperatura do que mostrar uma errada.
 */
export function pickSlot(
  slots: readonly WeatherSlot[],
  nowMs: number,
): WeatherSlot | null {
  if (slots.length === 0) return null;
  let current: WeatherSlot | null = null;
  for (const s of slots) {
    if (s.t <= nowMs) current = s;
    else break;
  }
  if (!current) {
    return slots[0].t - nowMs <= HOUR ? slots[0] : null;
  }
  return nowMs - current.t <= 1.5 * HOUR ? current : null;
}

// --- Apresentação --------------------------------------------------------------

/** 17.4 → "17°" · -0.2 → "0°" (nunca "-0°"). */
export function formatTemp(temp: number): string {
  const r = Math.round(temp);
  return `${r === 0 ? 0 : r}°`;
}

/** Código do símbolo MET (ex.: "partlycloudy_night") → tipo, noite e texto. */
export function describeSymbol(symbol: string): {
  kind: WeatherKind;
  night: boolean;
  label: string;
} {
  const night = symbol.endsWith('_night');
  const code = symbol.split('_')[0];
  const has = (s: string) => code.includes(s);

  if (has('thunder')) return { kind: 'thunder', night, label: 'Trovoada' };
  if (has('snow')) return { kind: 'snow', night, label: 'Neve' };
  if (has('sleet')) return { kind: 'snow', night, label: 'Aguaneve' };
  if (has('heavyrain')) return { kind: 'rain', night, label: 'Chuva forte' };
  if (has('lightrain')) {
    return {
      kind: 'drizzle',
      night,
      label: has('showers') ? 'Aguaceiros fracos' : 'Chuva fraca',
    };
  }
  if (has('rain')) {
    return {
      kind: 'rain',
      night,
      label: has('showers') ? 'Aguaceiros' : 'Chuva',
    };
  }
  if (code === 'fog') return { kind: 'fog', night, label: 'Nevoeiro' };
  if (code === 'cloudy') return { kind: 'cloudy', night, label: 'Nublado' };
  if (code === 'partlycloudy') {
    return { kind: 'partly', night, label: 'Parcialmente nublado' };
  }
  if (code === 'fair') return { kind: 'partly', night, label: 'Pouco nublado' };
  if (code === 'clearsky') return { kind: 'clear', night, label: 'Céu limpo' };
  return { kind: 'cloudy', night, label: '' };
}

// --- Relógio -------------------------------------------------------------------

/** Milissegundos até ao próximo minuto certo (o relógio muda ao segundo 00). */
export function msToNextMinute(nowMs: number): number {
  return 60_000 - (((nowMs % 60_000) + 60_000) % 60_000);
}

/**
 * Diferença a aplicar ao relógio do posto, medida contra o servidor a meio
 * do pedido. Ignora desvios pequenos (< 30 s): só corrige postos com a hora
 * do Windows visivelmente errada.
 */
export function clockOffset(
  serverNow: number,
  sentAt: number,
  receivedAt: number,
): number {
  if (!Number.isFinite(serverNow)) return 0;
  const offset = serverNow - (sentAt + receivedAt) / 2;
  return Math.abs(offset) < 30_000 ? 0 : Math.round(offset);
}
