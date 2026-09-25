// 📄 src/components/clinico/TreatmentPicker.tsx
// =============================================================================
// CDC Manager — Consulta: seletor de ato com pesquisa (P12 — "lupa de
// pesquisa prática na tabela de preços")
// -----------------------------------------------------------------------------
// Substitui o <select> de 749 atos por um combobox pesquisável:
//   · escreve-se nome, categoria ou código Dentoral; filtra em tempo real
//     (ignora acentos e maiúsculas), máx. 40 resultados ordenados por
//     relevância (começa-por › contém)
//   · setas ↑↓ + Enter escolhem; Esc fecha; clique fora fecha
//   · o valor escolhido vai num hidden `treatmentTypeId` (form action)
// Reutilizável (PlanEditor na Fase 4). Estilos inline (convenção).
// =============================================================================

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface PickerOption {
  id: string;
  name: string;
  category: string | null;
  code?: string | null;
  /** Opcional — a agenda não mostra preço */
  priceCents?: number;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const eur = (c: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(
    c / 100,
  );

export function TreatmentPicker({
  name,
  label = 'Ato *',
  options,
  value,
  onChange,
  required = true,
  placeholder = 'Pesquisar ato, categoria ou código…',
}: {
  name: string;
  label?: string;
  options: PickerOption[];
  value: string; // id selecionado ou ''
  onChange: (id: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find(o => o.id === value) ?? null,
    [options, value],
  );

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return options.slice(0, 40);
    const tokens = q.split(/\s+/);
    const scored: { o: PickerOption; s: number }[] = [];
    for (const o of options) {
      const n = fold(o.name);
      const c = fold(o.category ?? '');
      const k = fold(o.code ?? '');
      const hay = `${n} ${c} ${k}`;
      if (!tokens.every(t => hay.includes(t))) continue;
      let s = 0;
      if (n.startsWith(q)) s += 3;
      else if (n.includes(q)) s += 2;
      if (k && k.startsWith(q)) s += 3;
      if (c.includes(q)) s += 1;
      scored.push({ o, s });
    }
    return scored
      .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name))
      .slice(0, 40)
      .map(x => x.o);
  }, [options, query]);

  // fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // manter item ativo visível
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: PickerOption) => {
    onChange(o.id);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <label
        style={{
          display: 'block',
          fontSize: '13px',
          fontWeight: 600,
          color: '#1B2A6B',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input type='hidden' name={name} value={value} required={required} />

      {selected ? (
        // --- estado escolhido ---
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1.5px solid #2743A6',
            backgroundColor: '#EEF2FF',
            borderRadius: '10px',
            padding: '8px 10px 8px 12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Nome COMPLETO: os atos do catálogo chegam aos 98 caracteres
                ("CONSULTA DE MEDICINA DENTARIA DE URGENCIA NOCTURNA") e o
                que os distingue está no fim — nunca cortar com reticências */}
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#1B2A6B',
                lineHeight: 1.3,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
              }}
              title={selected.name}
            >
              {selected.name}
            </div>
            <div style={{ fontSize: '11px', color: '#6A7186' }}>
              {selected.category ?? '—'}
              {selected.code ? ` · cód. ${selected.code}` : ''}
              {selected.priceCents != null
                ? ` · ${eur(selected.priceCents)}`
                : ''}
            </div>
          </div>
          <button
            type='button'
            onClick={clear}
            title='Trocar ato'
            style={{
              border: 'none',
              background: 'transparent',
              color: '#6A7186',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        // --- pesquisa ---
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9AA1B4',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete='off'
            role='combobox'
            aria-expanded={open}
            aria-controls='treatment-picker-list'
            aria-autocomplete='list'
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1.5px solid #D8DEEF',
              borderRadius: '10px',
              padding: '10px 12px 10px 36px',
              fontSize: '14px',
              color: '#1B2A6B',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          />
        </div>
      )}

      {open && !selected && (
        <ul
          ref={listRef}
          id='treatment-picker-list'
          role='listbox'
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 320,
            overflowY: 'auto',
            listStyle: 'none',
            margin: '4px 0 0',
            padding: 4,
            backgroundColor: '#FFFFFF',
            border: '1px solid #D8DEEF',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(27,42,107,0.12)',
          }}
        >
          {results.length === 0 && (
            <li
              style={{
                padding: '10px 12px',
                fontSize: '13px',
                color: '#6A7186',
              }}
            >
              Sem resultados para «{query}»
            </li>
          )}
          {results.map((o, i) => (
            <li
              key={o.id}
              role='option'
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => {
                e.preventDefault(); // não perder o foco antes do click
                choose(o);
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '8px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: i === active ? '#EEF2FF' : 'transparent',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1B2A6B',
                    lineHeight: 1.3,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                  }}
                  title={o.name}
                >
                  {o.name}
                </div>
                <div style={{ fontSize: '11px', color: '#6A7186' }}>
                  {o.category ?? '—'}
                  {o.code ? ` · ${o.code}` : ''}
                </div>
              </div>
              {o.priceCents != null && (
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1B2A6B',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {eur(o.priceCents)}
                </span>
              )}
            </li>
          ))}
          {!query && options.length > 40 && (
            <li
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                color: '#9AA1B4',
              }}
            >
              A mostrar 40 de {options.length} — escreva para filtrar
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
