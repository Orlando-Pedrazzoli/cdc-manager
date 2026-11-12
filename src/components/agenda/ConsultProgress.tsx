// 📄 src/components/agenda/ConsultProgress.tsx
// =============================================================================
// CDC Manager — Barra de tempo da consulta
// -----------------------------------------------------------------------------
// Ideia do Victor (11/11/2026): "uma barra que vai sendo preenchida à medida
// que o tempo da consulta passa, de acordo com a duração marcada. É útil
// sobretudo para o médico, que trabalha de costas para o computador: ao olhar
// para a barra, percebe logo que o tempo está a acabar."
//
// Conta sobre o horário MARCADO (início → fim). Cores: azul enquanto há
// tempo, âmbar nos últimos 20% (ou 5 minutos), vermelho depois da hora.
// O relógio é um store externo partilhado (um só intervalo para todas as
// barras do ecrã), lido com useSyncExternalStore — no servidor e na
// hidratação devolve 0 e a barra não é desenhada.
// =============================================================================

'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 15_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => listeners.forEach(l => l()), TICK_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
// Snapshot estável entre ticks (arredondado ao intervalo)
const getNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const getServerNow = () => 0;

export function consultProgress(startMs: number, endMs: number, nowMs: number) {
  const total = Math.max(1, endMs - startMs);
  const elapsed = nowMs - startMs;
  const ratio = Math.min(1, Math.max(0, elapsed / total));
  const leftMin = Math.ceil((endMs - nowMs) / 60_000);
  const warnAt = Math.min(total * 0.2, 5 * 60_000);
  const state: 'ok' | 'ending' | 'over' =
    nowMs >= endMs ? 'over' : endMs - nowMs <= warnAt ? 'ending' : 'ok';
  return { ratio, leftMin, state };
}

const COLOR = { ok: '#2743A6', ending: '#D98300', over: '#B3261E' } as const;

export function ConsultProgress({
  startMs,
  endMs,
  variant = 'card',
}: {
  startMs: number;
  endMs: number;
  /** card = fio no fundo do cartão da agenda; row = barra fina com texto;
   *  header = barra grande no ecrã da consulta */
  variant?: 'card' | 'row' | 'header';
}) {
  const now = useSyncExternalStore(subscribe, getNow, getServerNow);
  if (now === 0) return null;
  const { ratio, leftMin, state } = consultProgress(startMs, endMs, now);
  const color = COLOR[state];
  const label =
    state === 'over'
      ? leftMin >= 0
        ? 'Tempo esgotado'
        : `Tempo esgotado há ${-leftMin} min`
      : `Falta${leftMin === 1 ? '' : 'm'} ${leftMin} min`;

  if (variant === 'card') {
    return (
      <span
        title={label}
        aria-label={label}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 5,
          backgroundColor: 'rgba(20, 27, 51, 0.14)',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${ratio * 100}%`,
            backgroundColor: color,
            transition: 'width 1s linear',
          }}
        />
      </span>
    );
  }

  const big = variant === 'header';
  return (
    <div
      role='progressbar'
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: big ? 14 : 8,
        marginTop: big ? 10 : 4,
        maxWidth: big ? 640 : 260,
      }}
    >
      <div
        style={{
          flex: 1,
          height: big ? 14 : 6,
          borderRadius: 999,
          backgroundColor: '#E6E9F1',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${ratio * 100}%`,
            backgroundColor: color,
            borderRadius: 999,
            transition: 'width 1s linear',
          }}
        />
      </div>
      <span
        style={{
          flexShrink: 0,
          fontSize: big ? '15px' : '11px',
          fontWeight: 700,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {label}
      </span>
    </div>
  );
}
