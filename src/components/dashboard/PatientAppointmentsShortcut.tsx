// 📄 src/components/dashboard/PatientAppointmentsShortcut.tsx
// =============================================================================
// CDC Manager — Dashboard: atalho "Próximas consultas de um paciente"
// -----------------------------------------------------------------------------
// 7.ª ronda/B3 (Victor, 13/11/2026): "adicionar um atalho de ver próximas
// consultas do paciente, para otimizar a busca no dia a dia através do nome,
// data de nascimento, número de contacto".
//
// 25/11/2026 (Orlando): "quando clico não acontece nada". O botão limitava-se
// a pôr o cursor na pesquisa do topo, que não tem realce de foco — no ecrã
// nada mudava. Agora o botão abre a sua própria janela de pesquisa (mesmo
// filtro da pesquisa do topo: nome, telemóvel, NIF, utente, nascimento ou
// processo); escolher o paciente abre a ficha rápida com as próximas
// marcações (PatientQuickView), sem sair do dashboard.
//
// · Debounce 250ms, mínimo 2 caracteres, guarda de corridas por nº de
//   sequência (igual ao QuickPatientSearch).
// · Teclado: ↑/↓ navegam · Enter abre as consultas · Esc fecha.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Search } from 'lucide-react';
import {
  quickSearchPatientsAction,
  type QuickSearchResult,
} from '@/actions/patients';
import { PatientSearchResult } from '@/components/pacientes/PatientSearchResult';
import { PatientQuickView } from '@/components/agenda/PatientQuickView';
import { Modal } from '@/components/ui/Modal';

export function PatientAppointmentsShortcut({
  style,
}: {
  style?: React.CSSProperties;
}) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<QuickSearchResult[]>([]);
  const [searched, setSearched] = useState(false); // já chegou uma resposta
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1); // índice destacado (teclado)
  const [quick, setQuick] = useState<{ id: string; name: string } | null>(null);

  const seqRef = useRef(0); // guarda de corridas

  const reset = () => {
    seqRef.current++; // descarta respostas ainda em trânsito
    setQ('');
    setResults([]);
    setSearched(false);
    setFailed(false);
    setLoading(false);
    setActive(-1);
  };

  const openSearch = () => {
    reset();
    setSearching(true);
  };
  const closeSearch = () => {
    setSearching(false);
    reset();
  };

  // Os resets síncronos vivem no handler, não no effect (React Compiler).
  const onQueryChange = (value: string) => {
    setQ(value);
    if (value.trim().length < 2) {
      seqRef.current++;
      setResults([]);
      setSearched(false);
      setFailed(false);
      setLoading(false);
      setActive(-1);
    } else {
      setLoading(true);
    }
  };

  // Pesquisa com debounce + descarte de respostas fora de ordem.
  useEffect(() => {
    if (!searching) return;
    const term = q.trim();
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const rows = await quickSearchPatientsAction(term);
        if (seq !== seqRef.current) return; // resposta obsoleta — descartar
        setResults(rows);
        setFailed(false);
        setActive(rows.length > 0 ? 0 : -1);
      } catch {
        if (seq !== seqRef.current) return;
        setResults([]);
        setFailed(true);
        setActive(-1);
      }
      setSearched(true);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, searching]);

  const pick = (hit: QuickSearchResult) => {
    setSearching(false);
    reset();
    setQuick({ id: hit.id, name: hit.name });
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (active >= 0 && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    }
  };

  const term = q.trim();
  let hint: string | null = null;
  if (term.length < 2) {
    hint =
      'Escreva pelo menos 2 caracteres: nome, telemóvel, NIF, n.º de utente, data de nascimento ou n.º de processo.';
  } else if (failed) {
    hint = 'Não foi possível pesquisar. Tente outra vez.';
  } else if (results.length === 0) {
    hint = loading || !searched ? 'A pesquisar…' : 'Nenhum paciente encontrado.';
  }

  return (
    <>
      <button
        type='button'
        title='Pesquise o paciente por nome, nascimento ou contacto para ver as próximas consultas'
        onClick={openSearch}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          ...style,
        }}
      >
        <CalendarClock size={15} /> Próximas consultas de um paciente
      </button>

      <Modal
        open={searching}
        onClose={closeSearch}
        title='Próximas consultas de um paciente'
        maxWidth={560}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1.5px solid #2743A6',
            borderRadius: '10px',
            padding: '9px 12px',
            backgroundColor: '#FBFCFF',
          }}
        >
          <Search size={16} color='#6A7186' style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={q}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={onInputKey}
            placeholder='Nome, telemóvel, NIF, utente, nascimento ou processo'
            aria-label='Pesquisar paciente'
            autoComplete='off'
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: '14px',
              color: '#1C2233',
            }}
          />
        </div>

        <div style={{ marginTop: '12px', minHeight: '120px' }}>
          {hint ? (
            <p
              style={{
                margin: 0,
                padding: '6px 2px',
                fontSize: '13px',
                color: failed ? '#B3261E' : '#6A7186',
              }}
            >
              {hint}
            </p>
          ) : (
            <div
              style={{
                border: '1px solid #EEF1F8',
                borderRadius: '10px',
                overflow: 'hidden',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {results.map((r, i) => (
                <PatientSearchResult
                  key={r.id}
                  hit={r}
                  active={i === active}
                  first={i === 0}
                  onSelect={() => pick(r)}
                  onHover={() => setActive(i)}
                />
              ))}
            </div>
          )}
          {!hint && results.length === 8 && (
            <p
              style={{
                margin: '8px 2px 0',
                fontSize: '12px',
                color: '#9AA1B4',
              }}
            >
              A mostrar os 8 primeiros. Escreva mais para afinar a pesquisa.
            </p>
          )}
        </div>
      </Modal>

      <PatientQuickView
        patientId={quick?.id ?? null}
        fallbackName={quick?.name}
        onClose={() => setQuick(null)}
      />
    </>
  );
}
