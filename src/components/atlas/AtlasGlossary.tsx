// 📄 src/components/atlas/AtlasGlossary.tsx
// =============================================================================
// CDC Manager — Atlas: glossário "explique-me isto" (v2)
// Envolve termos clínicos conhecidos (GLOSSARY) com sublinhado pontilhado;
// ao clicar mostra a explicação em linguagem simples. Puro cliente.
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { GLOSSARY } from '@/lib/data/atlas-flow';

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const REGEX = new RegExp(
  `(${TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi',
);

export function Gloss({ text }: { text: string }) {
  const parts = useMemo(() => text.split(REGEX), [text]);
  return (
    <>
      {parts.map((p, i) => {
        const key = p.toLowerCase();
        const def = GLOSSARY[key];
        return def ? (
          <Term key={i} label={p} def={def} />
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

function Term({ label, def }: { label: string; def: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        style={{
          all: 'unset',
          cursor: 'help',
          borderBottom: '1.5px dotted #2743A6',
          color: 'inherit',
        }}
      >
        {label}
        <sup style={{ fontSize: '0.65em', color: '#2743A6', marginLeft: 1 }}>
          ?
        </sup>
      </button>
      {open && (
        <span
          role='dialog'
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            top: '1.6em',
            width: 300,
            padding: '10px 12px',
            borderRadius: '10px',
            backgroundColor: '#1B2A6B',
            color: '#FFFFFF',
            fontSize: '13px',
            lineHeight: 1.45,
            boxShadow: '0 10px 30px rgba(27,42,107,0.25)',
            fontWeight: 400,
          }}
        >
          <strong
            style={{
              display: 'block',
              marginBottom: 4,
              textTransform: 'capitalize',
            }}
          >
            {label} — em linguagem simples
          </strong>
          {def}
        </span>
      )}
    </span>
  );
}
