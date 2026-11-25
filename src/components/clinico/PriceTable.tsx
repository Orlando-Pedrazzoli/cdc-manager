// 📄 src/components/clinico/PriceTable.tsx
// =============================================================================
// CDC Manager — Tabela de preços pesquisável (9.ª ronda, ponto 06)
// Só leitura. A pesquisa ignora acentos e maiúsculas e aceita várias
// palavras ("coroa zirc"). Sem botões de exportar ou imprimir (ponto 08).
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatCents } from '@/lib/commissions';

export interface PriceRow {
  id: string;
  name: string;
  category: string | null;
  code: string | null;
  priceCents: number;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const MAX_SHOWN = 200;

export function PriceTable({ rows }: { rows: PriceRow[] }) {
  const [q, setQ] = useState('');
  const indexed = useMemo(
    () =>
      rows.map(r => ({
        row: r,
        hay: norm(`${r.name} ${r.category ?? ''} ${r.code ?? ''}`),
      })),
    [rows],
  );
  const words = norm(q).split(/\s+/).filter(Boolean);
  const found = words.length
    ? indexed.filter(i => words.every(w => i.hay.includes(w)))
    : indexed;
  const shown = found.slice(0, MAX_SHOWN);

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#8A91A6',
    borderBottom: '1px solid #EEF1F8',
  };
  const td: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: '14px',
    color: '#1C2233',
    borderBottom: '1px solid #F4F6FB',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid #D8DEEF',
          borderRadius: '12px',
          padding: '10px 14px',
          backgroundColor: '#FFFFFF',
          maxWidth: 520,
        }}
      >
        <Search size={16} color='#6A7186' aria-hidden='true' />
        <input
          type='search'
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder='Pesquisar tratamento…'
          aria-label='Pesquisar tratamento'
          autoFocus
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '15px',
            color: '#1C2233',
            backgroundColor: 'transparent',
          }}
        />
      </label>
      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }} aria-live='polite'>
        {found.length === 0
          ? 'Nenhum tratamento encontrado.'
          : found.length > MAX_SHOWN
            ? `${found.length} tratamentos; a mostrar os primeiros ${MAX_SHOWN}. Escreva mais para afinar.`
            : `${found.length} tratamento${found.length === 1 ? '' : 's'}.`}
      </p>
      {shown.length > 0 && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Tratamento</th>
                <th style={th}>Categoria</th>
                <th style={th}>Código</th>
                <th style={{ ...th, textAlign: 'right' }}>Preço</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ row }) => (
                <tr key={row.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{row.name}</td>
                  <td style={{ ...td, color: '#6A7186' }}>{row.category ?? '—'}</td>
                  <td style={{ ...td, color: '#6A7186' }}>{row.code ?? '—'}</td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatCents(row.priceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
