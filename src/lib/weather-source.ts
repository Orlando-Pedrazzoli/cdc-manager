// 📄 src/lib/weather-source.ts
// =============================================================================
// CDC Manager — Meteorologia: chamada ao fornecedor (só servidor)
// -----------------------------------------------------------------------------
// Um único pedido serve todos os postos: o Next guarda a resposta 3 horas
// (mínimo exigido pela MET Norway fora dos países nórdicos, onde o modelo só
// é atualizado de 6 em 6 horas). Os termos pedem ainda um User-Agent que
// identifique a aplicação — por isso o pedido nunca sai do browser.
// =============================================================================

import {
  CLINIC_WEATHER_POINT,
  parseMetForecast,
  type WeatherSlot,
} from './weather';

const CACHE_SECONDS = 3 * 60 * 60;

export async function fetchClinicWeather(
  nowMs: number,
): Promise<WeatherSlot[]> {
  const { lat, lon } = CLINIC_WEATHER_POINT;
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const contact = process.env.WEATHER_CONTACT_EMAIL?.trim();
  const userAgent = `cdc-manager/1.0 https://www.cdcclinicas.com${contact ? ` ${contact}` : ''}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`MET Norway respondeu ${res.status}`);
  return parseMetForecast(await res.json(), nowMs);
}
