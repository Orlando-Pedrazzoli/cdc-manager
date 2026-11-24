// 📄 scripts/tests/weather.test.ts
// Correr: npx tsx scripts/tests/weather.test.ts
import assert from 'node:assert/strict';
import {
  MAX_SLOTS,
  clockOffset,
  describeSymbol,
  formatTemp,
  msToNextMinute,
  parseMetForecast,
  pickSlot,
} from '../../src/lib/weather';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const H = 3_600_000;
const T0 = Date.parse('2026-11-24T09:00:00Z');
const entry = (h: number, temp: unknown, symbol?: string, six = false) => ({
  time: new Date(T0 + h * H).toISOString(),
  data: {
    instant: { details: { air_temperature: temp } },
    ...(symbol
      ? {
          [six ? 'next_6_hours' : 'next_1_hours']: {
            summary: { symbol_code: symbol },
          },
        }
      : {}),
  },
});
const met = (timeseries: unknown[]) => ({ properties: { timeseries } });

test('parse: começa na hora em curso e ignora as que já passaram', () => {
  const json = met([
    entry(0, 14.2, 'cloudy'),
    entry(1, 15.1, 'partlycloudy_day'),
    entry(2, 16.4, 'clearsky_day'),
    entry(3, 17, 'clearsky_day'),
  ]);
  const slots = parseMetForecast(json, T0 + 2 * H + 11 * 60_000);
  assert.deepEqual(
    slots.map(s => [s.t, s.temp, s.symbol]),
    [
      [T0 + 2 * H, 16.4, 'clearsky_day'],
      [T0 + 3 * H, 17, 'clearsky_day'],
    ],
  );
});

test('parse: tolera lixo, usa next_6_hours em falta e limita as horas', () => {
  assert.deepEqual(parseMetForecast(null, T0), []);
  assert.deepEqual(parseMetForecast({ properties: {} }, T0), []);
  assert.deepEqual(parseMetForecast('<html>', T0), []);
  const json = met([
    { time: 'ontem', data: {} },
    entry(1, 'quente', 'rain'),
    entry(0, 12, 'rain', true),
    ...Array.from({ length: 60 }, (_, i) => entry(i + 2, 10 + i)),
  ]);
  const slots = parseMetForecast(json, T0);
  assert.equal(slots.length, MAX_SLOTS);
  assert.deepEqual(slots[0], { t: T0, temp: 12, symbol: 'rain' });
  assert.equal(slots[1].t, T0 + 2 * H); // a entrada sem temperatura caiu
  assert.equal(slots[1].symbol, '');
});

test('pick: acompanha a hora ao longo do dia sem novos dados', () => {
  const slots = [0, 1, 2, 3].map(h => ({
    t: T0 + h * H,
    temp: 10 + h,
    symbol: '',
  }));
  assert.equal(pickSlot(slots, T0)?.temp, 10);
  assert.equal(pickSlot(slots, T0 + H - 1)?.temp, 10);
  assert.equal(pickSlot(slots, T0 + H)?.temp, 11);
  assert.equal(pickSlot(slots, T0 + 3.9 * H)?.temp, 13);
});

test('pick: dados velhos ou muito à frente não são mostrados', () => {
  const slots = [{ t: T0, temp: 10, symbol: '' }];
  assert.equal(pickSlot([], T0), null);
  assert.equal(pickSlot(slots, T0 + 1.5 * H)?.temp, 10);
  assert.equal(pickSlot(slots, T0 + 1.5 * H + 1), null);
  assert.equal(pickSlot(slots, T0 - H)?.temp, 10);
  assert.equal(pickSlot(slots, T0 - H - 1), null);
});

test('temperatura: arredonda e nunca mostra -0', () => {
  assert.equal(formatTemp(17.4), '17°');
  assert.equal(formatTemp(17.5), '18°');
  assert.equal(formatTemp(-0.2), '0°');
  assert.equal(formatTemp(-3.6), '-4°');
});

test('símbolos MET → tipo, noite e texto em português', () => {
  const d = (s: string) => {
    const r = describeSymbol(s);
    return [r.kind, r.night, r.label];
  };
  assert.deepEqual(d('clearsky_day'), ['clear', false, 'Céu limpo']);
  assert.deepEqual(d('clearsky_night'), ['clear', true, 'Céu limpo']);
  assert.deepEqual(d('fair_night'), ['partly', true, 'Pouco nublado']);
  assert.deepEqual(d('partlycloudy_day'), [
    'partly',
    false,
    'Parcialmente nublado',
  ]);
  assert.deepEqual(d('cloudy'), ['cloudy', false, 'Nublado']);
  assert.deepEqual(d('fog'), ['fog', false, 'Nevoeiro']);
  assert.deepEqual(d('lightrain'), ['drizzle', false, 'Chuva fraca']);
  assert.deepEqual(d('lightrainshowers_day'), [
    'drizzle',
    false,
    'Aguaceiros fracos',
  ]);
  assert.deepEqual(d('rainshowers_night'), ['rain', true, 'Aguaceiros']);
  assert.deepEqual(d('heavyrain'), ['rain', false, 'Chuva forte']);
  assert.deepEqual(d('heavyrainshowersandthunder_day'), [
    'thunder',
    false,
    'Trovoada',
  ]);
  assert.deepEqual(d('lightsleet'), ['snow', false, 'Aguaneve']);
  assert.deepEqual(d('snow'), ['snow', false, 'Neve']);
  assert.deepEqual(d(''), ['cloudy', false, '']);
  assert.deepEqual(d('novo_codigo_day'), ['cloudy', false, '']);
});

test('relógio: espera exatamente até ao minuto certo', () => {
  assert.equal(msToNextMinute(T0), 60_000);
  assert.equal(msToNextMinute(T0 + 1), 59_999);
  assert.equal(msToNextMinute(T0 + 59_999), 1);
});

test('relógio: só corrige postos com a hora visivelmente errada', () => {
  assert.equal(clockOffset(T0 + 500, T0, T0 + 200), 0);
  assert.equal(clockOffset(T0 + 29_000, T0, T0), 0);
  assert.equal(clockOffset(T0 + 5 * 60_000 + 100, T0, T0 + 200), 5 * 60_000);
  assert.equal(clockOffset(T0 - H, T0, T0), -H);
  assert.equal(clockOffset(Number.NaN, T0, T0), 0);
});

console.log(`\nweather: ${n} testes OK`);
