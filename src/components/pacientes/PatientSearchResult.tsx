// 📄 src/components/pacientes/PatientSearchResult.tsx
// =============================================================================
// CDC Manager — Linha de resultado da pesquisa de paciente (partilhada)
// -----------------------------------------------------------------------------
// Apontamento 02 da 2.ª reunião: identificar a pessoa certa entre homónimos
// com a mesma data de nascimento. A mesma linha aparece no header (Ctrl+K),
// no modal de marcação, no walk-in e no pedido de laboratório — o balcão
// aprende uma vez.
//
// Layout: foto (ou iniciais) · nome + nº de processo · linha de
// identificadores (nascimento · NIF · utente · telemóvel). Cada
// identificador presente é mostrado com uma etiqueta curta para não se
// confundirem entre si (são todos 9 dígitos). Estilos inline (convenção).
// =============================================================================

'use client';

import type { PatientSearchHit } from '@/lib/patient-search';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function PatientSearchResult({
  hit,
  active = false,
  onSelect,
  onHover,
  first = false,
}: {
  hit: PatientSearchHit;
  active?: boolean;
  onSelect: () => void;
  onHover?: () => void;
  first?: boolean;
}) {
  const ids: { k: string; v: string }[] = [];
  if (hit.birth) ids.push({ k: 'Nasc.', v: hit.birth });
  if (hit.nif) ids.push({ k: 'NIF', v: hit.nif });
  if (hit.snsNumber) ids.push({ k: 'Utente', v: hit.snsNumber });
  if (hit.phone) ids.push({ k: 'Tel.', v: hit.phone });

  return (
    <button
      type='button'
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        cursor: 'pointer',
        padding: '8px 12px',
        backgroundColor: active ? '#F5F8FF' : '#FFFFFF',
        borderTop: first ? 'none' : '1px solid #F4F6FB',
      }}
    >
      {hit.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada Cloudinary, sem domínio fixo
        <img
          src={hit.photoUrl}
          alt=''
          width={36}
          height={36}
          style={{
            width: 36,
            height: 36,
            borderRadius: '999px',
            objectFit: 'cover',
            flexShrink: 0,
            backgroundColor: '#EEF1F8',
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: '999px',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#E8EDFB',
            color: '#2743A6',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {initials(hit.name)}
        </span>
      )}

      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#1C2233',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {hit.name}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#9AA1B4',
              flexShrink: 0,
            }}
          >
            Proc. {hit.processNumber}
          </span>
        </span>
        <span
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2px 10px',
            marginTop: '2px',
            fontSize: '12px',
            color: '#6A7186',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ids.length === 0 ? (
            <span style={{ color: '#B3261E' }}>sem identificadores</span>
          ) : (
            ids.map(x => (
              <span key={x.k} style={{ whiteSpace: 'nowrap' }}>
                <span style={{ color: '#9AA1B4' }}>{x.k} </span>
                {x.v}
              </span>
            ))
          )}
        </span>
      </span>
    </button>
  );
}
