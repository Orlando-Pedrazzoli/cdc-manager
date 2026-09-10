// 📄 src/components/agenda/DateJump.tsx
// =============================================================================
// CDC Manager — Agenda: salto direto de data
// -----------------------------------------------------------------------------
// Client Component mínimo: um <input type="date"> que navega para o dia
// escolhido preservando clínica/vista/filtros. Substitui os 30 cliques nas
// setas para chegar a um dia do mês seguinte (feedback da demo de 09/09).
// =============================================================================

'use client';

import { useRouter } from 'next/navigation';

export function DateJump({
  date,
  makeHref,
}: {
  date: string; // 'YYYY-MM-DD' atualmente aberto
  makeHref: string; // href com '__DATE__' como placeholder do dia
}) {
  const router = useRouter();
  return (
    <input
      type='date'
      value={date}
      aria-label='Ir para o dia'
      onChange={e => {
        const v = e.target.value;
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          router.push(makeHref.replace('__DATE__', v));
        }
      }}
      style={{
        height: 34,
        padding: '0 10px',
        border: '1px solid #D8DEEF',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1B2A6B',
        backgroundColor: '#FFFFFF',
      }}
    />
  );
}
