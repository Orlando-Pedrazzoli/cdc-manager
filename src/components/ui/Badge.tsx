// 📄 src/components/ui/Badge.tsx
// =============================================================================
// CDC Manager — UI: Badge
// -----------------------------------------------------------------------------
// Etiqueta de estado (paciente ativo/inativo, marcação confirmada, fatura
// paga…). Presentacional, sem 'use client'.
// =============================================================================

import type { ReactNode } from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

const VARIANT_STYLES: Record<
  BadgeVariant,
  { backgroundColor: string; color: string }
> = {
  success: { backgroundColor: '#E6F4EA', color: '#137333' },
  warning: { backgroundColor: '#FEF3E0', color: '#B06000' },
  danger: { backgroundColor: '#FDEDED', color: '#B3261E' },
  info: { backgroundColor: '#EAF0FF', color: '#2743A6' },
  neutral: { backgroundColor: '#F0F2F7', color: '#6A7186' },
};

export function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  const v = VARIANT_STYLES[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...v,
      }}
    >
      {children}
    </span>
  );
}

/** Mapeamento pronto para o estado do paciente */
export function PatientStatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge variant='success'>Ativo</Badge>;
  if (status === 'inactive') return <Badge variant='neutral'>Inativo</Badge>;
  if (status === 'anonymized')
    return <Badge variant='danger'>Anonimizado</Badge>;
  return <Badge>{status}</Badge>;
}
