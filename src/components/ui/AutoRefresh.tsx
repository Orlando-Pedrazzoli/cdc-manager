// 📄 src/components/ui/AutoRefresh.tsx
// =============================================================================
// CDC Manager — Auto-refresh de Server Components
// -----------------------------------------------------------------------------
// A receção deixa a dashboard aberta o dia inteiro; sem isto, o "Agora: X em
// curso" e o "A seguir hoje" ficam obsoletos em minutos. Este componente
// invisível chama router.refresh() periodicamente — re-renderiza o Server
// Component pai com dados frescos do MongoDB SEM recarregar a página nem
// perder scroll/estado.
//
// Poupança de recursos: pausa quando o separador está oculto
// (visibilitychange) e faz refresh imediato ao voltar — o cenário típico da
// receção que alterna entre a dashboard e a agenda.
// =============================================================================

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoRefresh({
  intervalMs = 90_000,
}: {
  /** Intervalo entre refreshes (default 90s — fresco sem martelar o Atlas) */
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => router.refresh(), intervalMs);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh(); // dados frescos imediatos ao voltar ao separador
        start();
      } else {
        stop(); // separador oculto → zero queries desperdiçadas
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
