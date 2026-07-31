// 📄 src/components/pacientes/PatientSearch.tsx
// =============================================================================
// CDC Manager — Pacientes: barra de pesquisa + filtro de estado
// -----------------------------------------------------------------------------
// Client Component fino: o ÚNICO trabalho é escrever ?q=&status= no URL com
// debounce (400ms) — quem pesquisa a sério é o Server Component da listagem.
// router.replace evita entupir o histórico do browser tecla a tecla; a
// mudança de pesquisa faz reset da página para 1.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function PatientSearch({
  initialQ,
  initialStatus,
}: {
  initialQ: string;
  initialStatus: 'active' | 'inactive' | 'all';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Não navegar no mount (o URL já reflete o estado inicial)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set('q', q.trim());
      if (status !== 'active') sp.set('status', status);
      // page omitido de propósito: nova pesquisa começa na página 1
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, status, pathname, router]);

  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
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
          type='text'
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder='Pesquisar por nome, telefone ou nº de processo…'
          aria-label='Pesquisar pacientes'
          className='outline-none focus:ring-2'
          style={{
            width: '100%',
            borderRadius: '8px',
            border: '1px solid #D8DEEF',
            padding: '9px 12px 9px 38px',
            fontSize: '14px',
            color: '#1B2A6B',
            backgroundColor: '#FFFFFF',
          }}
        />
      </div>

      <select
        value={status}
        onChange={e =>
          setStatus(e.target.value as 'active' | 'inactive' | 'all')
        }
        aria-label='Filtrar por estado'
        className='outline-none focus:ring-2'
        style={{
          borderRadius: '8px',
          border: '1px solid #D8DEEF',
          padding: '9px 12px',
          fontSize: '14px',
          color: '#1B2A6B',
          backgroundColor: '#FFFFFF',
        }}
      >
        <option value='active'>Ativos</option>
        <option value='inactive'>Inativos</option>
        <option value='all'>Todos</option>
      </select>
    </div>
  );
}
