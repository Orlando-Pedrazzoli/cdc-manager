// 📄 src/components/layout/ClockWeather.tsx
// =============================================================================
// CDC Manager — Barra superior: hora local + temperatura
// -----------------------------------------------------------------------------
// As áreas Admin/Receção e Médico ficam abertas das 09:00 às 23:00. Este
// bloco dá a hora de Lisboa e o tempo lá fora de relance, em todas as
// páginas, no mesmo desenho do bloco do utilizador (2 linhas, mesmas cores).
//
// Pensado para um ecrã que nunca fecha:
//  · Relógio: muda ao segundo 00 de cada minuto (temporizador alinhado, não
//    um setInterval que vai derivando) e acerta-se ao voltar ao separador ou
//    ao acordar o PC — os browsers abrandam temporizadores em segundo plano.
//  · Fuso fixo Europe/Lisbon; se o relógio do Windows estiver errado mais de
//    30 s, corrige-se pela hora do servidor.
//  · Tempo: /api/tempo de 15 em 15 min, só com o separador visível. O
//    servidor guarda a previsão 3 h e envia as próximas horas, por isso a
//    temperatura acompanha o dia sem pedidos extra ao fornecedor.
//  · Falha do tempo → mostra só a hora. Nunca um erro, nunca um valor velho.
//  · Sem saltos de layout: algarismos tabulares e espaço reservado antes de
//    hidratar. Não anuncia cada minuto a leitores de ecrã.
// Escondido abaixo de 1024px (.cdc-ambient) — o telemóvel já mostra a hora.
// =============================================================================

'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  CLINIC_TIME_ZONE,
  clockOffset,
  describeSymbol,
  formatTemp,
  msToNextMinute,
  pickSlot,
  type WeatherKind,
  type WeatherPayload,
} from '@/lib/weather';

// --- Relógio partilhado (um só temporizador por separador) -----------------------
let offsetMs = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const nowMs = () => Date.now() + offsetMs;
const emit = () => listeners.forEach(l => l());

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      emit();
      schedule();
    },
    msToNextMinute(nowMs()) + 40,
  );
}
function wake() {
  if (document.visibilityState !== 'visible') return;
  emit();
  schedule();
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    schedule();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    }
  };
}
/** Minuto atual (inteiro) — só muda de valor quando o minuto muda. */
const getMinute = () => Math.floor(nowMs() / 60_000);
const getServerMinute = () => null;

// --- Formatação ------------------------------------------------------------------
const timeFmt = new Intl.DateTimeFormat('pt-PT', {
  timeZone: CLINIC_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateFmt = new Intl.DateTimeFormat('pt-PT', {
  timeZone: CLINIC_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ICONS: Record<WeatherKind, [day: LucideIcon, night: LucideIcon]> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  thunder: [CloudLightning, CloudLightning],
  snow: [CloudSnow, CloudSnow],
};

const REFRESH_MINUTES = 15;
const RETRY_MINUTES = 2;

const C = {
  navy: '#1B2A6B',
  faint: '#6A7186',
  icon: '#2743A6',
  line: '#EEF1F8',
};
const top = {
  margin: 0,
  fontSize: '14px',
  fontWeight: 600,
  color: C.navy,
  lineHeight: 1.3,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;
const sub = {
  margin: 0,
  fontSize: '12px',
  color: C.faint,
  whiteSpace: 'nowrap',
} as const;

export function ClockWeather() {
  const minute = useSyncExternalStore(subscribe, getMinute, getServerMinute);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const lastFetchMinute = useRef(Number.NEGATIVE_INFINITY);
  const busy = useRef(false);

  // Tempo: ao montar, de 15 em 15 min e ao voltar ao separador (o relógio
  // "acorda" nesses momentos, por isso basta reagir ao minuto).
  useEffect(() => {
    if (minute === null || busy.current) return;
    if (document.visibilityState !== 'visible') return;
    if (minute - lastFetchMinute.current < REFRESH_MINUTES) return;

    busy.current = true;
    const sentAt = Date.now();
    fetch('/api/tempo', { cache: 'no-store' })
      .then(res => (res.ok ? (res.json() as Promise<WeatherPayload>) : null))
      .then(data => {
        if (!data || !Array.isArray(data.slots)) throw new Error('sem dados');
        const next = clockOffset(data.now, sentAt, Date.now());
        if (next !== offsetMs) {
          offsetMs = next;
          emit();
          schedule();
        }
        lastFetchMinute.current =
          data.slots.length > 0
            ? getMinute()
            : getMinute() - REFRESH_MINUTES + RETRY_MINUTES;
        setWeather(data);
      })
      .catch(() => {
        // rede em baixo / sessão expirada: tenta de novo daqui a pouco
        lastFetchMinute.current = getMinute() - REFRESH_MINUTES + RETRY_MINUTES;
      })
      .finally(() => {
        busy.current = false;
      });
  }, [minute]);

  const ready = minute !== null;
  const date = ready ? new Date(minute * 60_000) : null;
  const slot =
    ready && weather ? pickSlot(weather.slots, minute * 60_000) : null;
  const info = slot ? describeSymbol(slot.symbol) : null;
  const Icon = info ? ICONS[info.kind][info.night ? 1 : 0] : null;

  return (
    <div
      className='cdc-ambient'
      role='group'
      aria-label='Hora local e tempo'
      style={{ alignItems: 'center', gap: '14px', flexShrink: 0 }}
    >
      {slot && info && Icon && (
        <>
          <div
            title={`${weather?.place ?? ''} · previsão para esta hora · dados: MET Norway`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon
              size={22}
              color={C.icon}
              strokeWidth={1.8}
              aria-hidden='true'
            />
            <div>
              <p style={top}>
                <span className='cdc-sr-only'>Temperatura </span>
                {formatTemp(slot.temp)}
                <span style={{ fontWeight: 500, color: C.faint }}>
                  {' '}
                  {weather?.place}
                </span>
              </p>
              <p className='cdc-ambient-detail' style={sub}>
                {info.label || 'Agora'}
              </p>
            </div>
          </div>
          <span
            aria-hidden='true'
            style={{ width: 1, height: 28, backgroundColor: C.line }}
          />
        </>
      )}
      <div
        style={{
          textAlign: 'right',
          minWidth: 78,
          visibility: ready ? 'visible' : 'hidden',
        }}
      >
        <p
          style={{ ...top, fontSize: '16px', fontWeight: 700, lineHeight: 1.2 }}
        >
          <time dateTime={date?.toISOString()} suppressHydrationWarning>
            {date ? timeFmt.format(date) : '00:00'}
          </time>
        </p>
        <p style={sub}>{date ? capitalize(dateFmt.format(date)) : '—'}</p>
      </div>
    </div>
  );
}
