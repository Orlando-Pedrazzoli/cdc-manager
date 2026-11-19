// 📄 src/components/rx/RxLaunchButton.tsx
// =============================================================================
// CDC Manager — Raio-X: botão "Abrir no iRYS"
// -----------------------------------------------------------------------------
// Abre o paciente no iRYS (MyRay) do posto, como o botão MyRay do Dentoral.
// É uma ligação `cdcrx://` — quem a executa é o lançador instalado no posto
// (scripts/rx-agent). Num posto sem lançador o clique não faz nada; por isso
// o texto de ajuda no `title`.
//
// SEM 'use client': não tem hooks, serve em Server e Client Components.
// Visual 100% inline (convenção do projeto). Sem n.º de processo ou sem
// nome utilizável não há endereço — o botão não aparece.
// =============================================================================

import { ScanLine } from 'lucide-react';
import { irysLaunchUrl } from '@/lib/rx-launch';

export function RxLaunchButton({
  processNumber,
  name,
  size = 'md',
}: {
  processNumber: number | null;
  name: string;
  size?: 'sm' | 'md';
}) {
  const url = irysLaunchUrl({ processNumber, name });
  if (!url) return null;
  const sm = size === 'sm';
  return (
    <a
      href={url}
      title='Abre este paciente no iRYS (MyRay) deste posto. Requer o lançador CDC RX instalado.'
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sm ? '6px' : '8px',
        padding: sm ? '6px 12px' : '9px 18px',
        fontSize: sm ? '13px' : '14px',
        fontWeight: 600,
        borderRadius: '8px',
        backgroundColor: '#EAF0FF',
        color: '#1B2A6B',
        border: '1px solid #EAF0FF',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <ScanLine size={sm ? 14 : 15} />
      Abrir no iRYS
    </a>
  );
}
