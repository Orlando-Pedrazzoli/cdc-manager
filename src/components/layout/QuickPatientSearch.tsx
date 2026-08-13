// 📄 src/components/layout/QuickPatientSearch.tsx
// =============================================================================
// CDC Manager — Pesquisa rápida de paciente (header admin/receção)
// -----------------------------------------------------------------------------
// O gesto nº 1 do balcão: "chegou o Sr. Silva" → ficha em 2 teclas. Disponível
// em QUALQUER página da área admin sem passar pela listagem.
//
// · Debounce 250ms, mínimo 2 caracteres; pesquisa via server action
//   (quickSearchPatientsAction — mesmos 3 caminhos da listagem: processo,
//   telefone, nome).
// · Teclado: Ctrl/Cmd+K foca de qualquer sítio · ↑/↓ navegam · Enter abre a
//   ficha · Esc fecha. Rato: clique no resultado abre; clique fora fecha.
// · Guarda de corridas: cada pedido leva um nº de sequência — respostas
//   fora de ordem (rede) são descartadas, nunca pisam resultados mais novos.
// · Rodapé "Ver todos" → /admin/pacientes?q= para além do top 8.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  quickSearchPatientsAction,
  type QuickSearchResult,
} from '@/actions/patients';

export function QuickPatientSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<QuickSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // índice destacado (teclado)
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0); // guarda de corridas

  // Ctrl/Cmd+K foca a pesquisa de qualquer sítio da área admin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clique fora fecha o dropdown
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Pesquisa com debounce + descarte de respostas fora de ordem
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      setActive(-1);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const rows = await quickSearchPatientsAction(term);
        if (seq !== seqRef.current) return; // resposta obsoleta — descartar
        setResults(rows);
        setOpen(true);
        setActive(rows.length > 0 ? 0 : -1);
      } catch {
        if (seq === seqRef.current) {
          setResults([]);
          setOpen(true);
          setActive(-1);
        }
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const goTo = (id: string) => {
    setOpen(false);
    setActive(-1);
    setQ('');
    setResults([]);
    router.push(`/admin/pacientes/${id}`);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (active >= 0 && results[active]) {
        e.preventDefault();
        goTo(results[active].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', flex: 1, maxWidth: '420px' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid #D8DEEF',
          borderRadius: '10px',
          padding: '7px 12px',
          backgroundColor: '#F8FAFE',
        }}
      >
        <Search size={15} color='#6A7186' style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onInputKey}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder='Pesquisar paciente — nome, telefone ou nº de processo'
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontSize: '13px',
            color: '#1C2233',
          }}
        />
        <span
          style={{
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: 600,
            color: '#9AA1B4',
            border: '1px solid #E4E8F2',
            borderRadius: '6px',
            padding: '1px 6px',
            backgroundColor: '#FFFFFF',
          }}
        >
          Ctrl K
        </span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4E8F2',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(27, 42, 107, 0.12)',
            overflow: 'hidden',
            zIndex: 60,
          }}
        >
          {results.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '14px 16px',
                fontSize: '13px',
                color: '#9AA1B4',
              }}
            >
              {loading ? 'A pesquisar…' : 'Nenhum paciente encontrado.'}
            </p>
          ) : (
            <>
              {results.map((r, i) => (
                <button
                  key={r.id}
                  type='button'
                  onClick={() => goTo(r.id)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '10px 16px',
                    backgroundColor: i === active ? '#F5F8FF' : '#FFFFFF',
                    borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1C2233',
                    }}
                  >
                    {r.name}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: '1px',
                      fontSize: '12px',
                      color: '#6A7186',
                    }}
                  >
                    Proc. {r.processNumber}
                    {r.phone ? ` · ${r.phone}` : ''}
                    {r.birth ? ` · ${r.birth}` : ''}
                  </span>
                </button>
              ))}
              <Link
                href={`/admin/pacientes?q=${encodeURIComponent(q.trim())}`}
                onClick={() => {
                  setOpen(false);
                  setActive(-1);
                }}
                style={{
                  display: 'block',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#2743A6',
                  textDecoration: 'none',
                  borderTop: '1px solid #EEF1F8',
                  backgroundColor: '#FAFBFE',
                }}
              >
                Ver todos os resultados →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
