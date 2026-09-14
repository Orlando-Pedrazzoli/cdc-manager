// 📄 src/components/sala-espera/AutoRefresh.tsx
// =============================================================================
// CDC Manager — Sala de espera: refresh automático (server component page)
// Re-renderiza a página de N em N segundos para os tempos "esperou" e as
// médias acompanharem o que se passa na receção, sem WebSockets.
// =============================================================================

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
