// 📄 src/components/clinico/AnamnesisStatusBanner.tsx
// =============================================================================
// CDC Manager — Aviso de estado da anamnese (Fase 3B, E19)
// "deverá despoletar um aviso anualmente (para todos os utilizadores do
// sistema)". Server-safe (sem hooks): usado na ficha (admin/médico), na
// consulta e no portal. Estados: em falta · desatualizada (>1 ano) ·
// por validar (preenchida pelo paciente) · válida (só se `showOk`).
// =============================================================================

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react';
import { anamnesisStatus, ANAMNESIS_STATUS_LABEL } from '@/lib/anamnesis';

const ptDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);

export function AnamnesisStatusBanner({
  questionnaire,
  href,
  showOk = false,
  compact = false,
}: {
  questionnaire: {
    completedAt?: Date | null;
    completedByRole?: string | null;
    reviewedAt?: Date | null;
  } | null;
  /** Link para preencher/rever (ex.: ficha › separador Anamnese) */
  href?: string;
  showOk?: boolean;
  compact?: boolean;
}) {
  const st = anamnesisStatus(questionnaire);
  if (st.state === 'ok' && !showOk) return null;

  const tone =
    st.state === 'ok'
      ? { bg: '#EDF9F2', fg: '#0F7B4D', border: '#BFE6CF' }
      : st.state === 'unreviewed'
        ? { bg: '#EEF2FF', fg: '#2743A6', border: '#C9D3F5' }
        : { bg: '#FFF4E5', fg: '#9A6700', border: '#F5D9A6' };

  const detail =
    st.state === 'missing'
      ? 'A ficha de anamnese é obrigatória antes da consulta.'
      : st.state === 'expired'
        ? `Última atualização em ${ptDate(st.completedAt)} — há ${st.days} dias. Renovar.`
        : st.state === 'unreviewed'
          ? `Preenchida pelo paciente em ${ptDate(st.completedAt)}.`
          : `Atualizada em ${ptDate(st.completedAt)} · válida por mais ${st.daysLeft} dias.`;

  const Icon =
    st.state === 'ok'
      ? CheckCircle2
      : st.state === 'unreviewed'
        ? ClipboardList
        : AlertTriangle;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: compact ? '8px 12px' : '10px 14px',
        borderRadius: '10px',
        border: `1px solid ${tone.border}`,
        backgroundColor: tone.bg,
        color: tone.fg,
        fontSize: compact ? '12.5px' : '13.5px',
      }}
    >
      <Icon size={compact ? 15 : 18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{ANAMNESIS_STATUS_LABEL[st.state]}</strong>
        {!compact && <span> — {detail}</span>}
      </div>
      {href && (
        <Link
          href={href}
          style={{
            fontSize: '12.5px',
            fontWeight: 700,
            color: tone.fg,
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}
        >
          {st.state === 'ok'
            ? 'Ver'
            : st.state === 'unreviewed'
              ? 'Validar'
              : 'Preencher'}
        </Link>
      )}
    </div>
  );
}