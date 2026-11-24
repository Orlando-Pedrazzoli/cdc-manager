// 📄 src/components/novidades/FilterChip.tsx
// CDC Manager — Novidades: filtro (tema / período / tipo / língua).
// O clique responde logo: enquanto a navegação decorre o botão fica já
// marcado e a pulsar (useLinkStatus) — o médico vê que o toque foi aceite
// sem esperar pelo PubMed.
'use client';

import type { ReactNode } from 'react';
import Link, { useLinkStatus } from 'next/link';

function ChipFace({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span
      aria-busy={pending || undefined}
      style={{
        display: 'inline-block',
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${on ? '#2743A6' : '#D8DEEF'}`,
        backgroundColor: on ? '#2743A6' : '#FFFFFF',
        color: on ? '#FFFFFF' : '#1B2A6B',
        fontSize: '12.5px',
        fontWeight: 600,
        animation: pending ? 'cdcPulse 1s ease-in-out infinite' : undefined,
      }}
    >
      {children}
    </span>
  );
}

export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      style={{ textDecoration: 'none' }}
    >
      <ChipFace active={active}>{children}</ChipFace>
    </Link>
  );
}
