// 📄 src/components/clinico/OdontogramFinder.tsx
// =============================================================================
// CDC Manager — Atalho "Odontograma": procurar o paciente e abrir o mapa
// -----------------------------------------------------------------------------
// 5.ª ronda/12 (Victor, nov. 2026): "mais um caminho para a receção e os
// médicos procurarem o paciente e abrirem diretamente o odontograma".
// Mesmo padrão do usePatientSearch: a lista é derivada no render e o effect
// só agenda o pedido (sem setState síncrono em effect).
// =============================================================================

'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  findPatientsForOdontogramAction,
  type OdontogramFinderHit,
} from '@/actions/odontogram-finder';
import { Input } from '@/components/ui/Input';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

export function OdontogramFinder({
  basePath,
  editable,
}: {
  /** '/admin/pacientes' ou '/doutor/pacientes' */
  basePath: string;
  /** Área do médico: explica quando pode editar */
  editable: boolean;
}) {
  const [query, setQuery] = useState('');
  const [fetched, setFetched] = useState<{
    query: string;
    items: OdontogramFinderHit[];
  } | null>(null);
  const [, startSearch] = useTransition();
  const active = query.trim().length >= MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    const q = query;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const items = await findPatientsForOdontogramAction(q);
        setFetched({ query: q, items });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, query]);

  const ready = active && fetched?.query === query;
  const results = ready ? fetched.items : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: 760 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1B2A6B' }}>
          Odontograma
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186', lineHeight: 1.5 }}>
          Procure o paciente para abrir diretamente o odontograma.{' '}
          {editable
            ? 'Os seus pacientes abrem para edição; os restantes abrem só para consulta.'
            : 'Abre só para consulta — a edição é do corpo clínico.'}
        </p>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '18px',
        }}
      >
        <Input
          id='odonto-search'
          label='Paciente'
          icon={<Search size={15} />}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder='Nome, nº de processo, telemóvel, NIF, utente ou data de nascimento…'
          autoComplete='off'
          autoFocus
        />

        {ready && results.length === 0 && (
          <p style={{ margin: '14px 0 0', fontSize: '13px', color: '#6A7186' }}>
            Nenhum paciente encontrado.
          </p>
        )}

        {results.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
            {results.map(r => (
              <li key={r.id} style={{ borderTop: '1px solid #F4F6FB' }}>
                <Link
                  href={`${basePath}/${r.id}/odontograma`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '11px 4px',
                    textDecoration: 'none',
                    color: '#1C2233',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
                      {r.name}
                    </span>
                    <span style={{ display: 'block', fontSize: '12px', color: '#6A7186' }}>
                      {r.processNumber != null ? `Proc. ${r.processNumber}` : 'Pré-marcação'}
                      {r.birth ? ` · nasc. ${r.birth}` : ''}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 700, color: '#2743A6' }}>
                    Abrir odontograma →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
