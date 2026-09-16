// 📄 src/components/pacientes/RelativesEditor.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: familiares / pessoas de referência (E11)
// -----------------------------------------------------------------------------
// "linkar ou colocar o número de sistema de outro paciente que seja família,
// nome, telefone e identificar o grau de parentesco". Cada linha é OU outro
// paciente da clínica (pesquisa por nome/nº processo — liga o patientId e
// puxa nome/telefone) OU um contacto livre. Serializa em JSON no hidden
// `relatives` que o PatientForm submete.
// =============================================================================

'use client';

import { useEffect, useState, useTransition } from 'react';
import { Link2, Plus, Trash2, UserRound } from 'lucide-react';
import { findPatientsAction } from '@/actions/appointments';
import { RELATIONSHIPS, RELATIONSHIP_LABEL } from '@/lib/domain';

export interface RelativeRow {
  patientId: string | null;
  name: string;
  phone: string;
  relationship: string;
}

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #D8DEEF',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '13px',
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
};

export function RelativesEditor({ initial }: { initial: RelativeRow[] }) {
  const [rows, setRows] = useState<RelativeRow[]>(initial);
  const update = (i: number, patch: Partial<RelativeRow>) =>
    setRows(r => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const add = () =>
    setRows(r => [
      ...r,
      { patientId: null, name: '', phone: '', relationship: '' },
    ]);

  const json = JSON.stringify(
    rows
      .filter(r => r.name.trim() || r.patientId)
      .map(r => ({
        patientId: r.patientId,
        name: r.name.trim(),
        phone: r.phone.trim() || null,
        relationship: r.relationship,
      })),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type='hidden' name='relatives' value={json} />
      {rows.length === 0 && (
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          Sem familiares registados. Útil quando o paciente não responde às
          confirmações ou o número está errado.
        </p>
      )}
      {rows.map((r, i) => (
        <RelativeLine
          key={i}
          row={r}
          onChange={patch => update(i, patch)}
          onRemove={() => remove(i)}
        />
      ))}
      {rows.length < 10 && (
        <button
          type='button'
          onClick={add}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: '1px dashed #C7CEE0',
            borderRadius: '8px',
            padding: '7px 12px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#2743A6',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Adicionar familiar / contacto de referência
        </button>
      )}
    </div>
  );
}

function RelativeLine({
  row,
  onChange,
  onRemove,
}: {
  row: RelativeRow;
  onChange: (p: Partial<RelativeRow>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  // Resultado etiquetado pela pesquisa que o originou; a lista mostrada é
  // DERIVADA no render (só se ainda corresponde ao texto atual e a linha não
  // tem paciente ligado) — sem setState síncrono no effect.
  const [fetched, setFetched] = useState<{
    query: string;
    items: { id: string; label: string }[];
  } | null>(null);
  const [, start] = useTransition();

  const active = !row.patientId && query.trim().length >= 2;
  useEffect(() => {
    if (!active) return;
    const q = query;
    const timer = setTimeout(() => {
      start(async () => {
        const items = await findPatientsAction(q);
        setFetched({ query: q, items });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [active, query]);

  const results = active && fetched?.query === query ? fetched.items : [];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.2fr 1.2fr auto',
        gap: 8,
        alignItems: 'start',
        border: '1px solid #EEF1F8',
        borderRadius: '10px',
        padding: '10px',
        backgroundColor: '#F8F9FD',
      }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          {row.patientId ? (
            <Link2
              size={13}
              style={{
                position: 'absolute',
                left: 9,
                top: 11,
                color: '#2743A6',
              }}
            />
          ) : (
            <UserRound
              size={13}
              style={{
                position: 'absolute',
                left: 9,
                top: 11,
                color: '#9AA1B4',
              }}
            />
          )}
          <input
            value={row.name}
            onChange={e => {
              onChange({ name: e.target.value, patientId: null });
              setQuery(e.target.value);
            }}
            placeholder='Nome (ou pesquisar paciente da clínica)'
            autoComplete='off'
            style={{ ...field, paddingLeft: 28 }}
          />
        </div>
        {row.patientId && (
          <span style={{ fontSize: '11px', color: '#2743A6', fontWeight: 600 }}>
            Ligado à ficha de outro paciente
          </span>
        )}
        {!row.patientId && results.length > 0 && (
          <ul
            style={{
              position: 'absolute',
              zIndex: 20,
              left: 0,
              right: 0,
              margin: '4px 0 0',
              padding: 4,
              listStyle: 'none',
              backgroundColor: '#FFFFFF',
              border: '1px solid #D8DEEF',
              borderRadius: '10px',
              boxShadow: '0 10px 30px rgba(27,42,107,0.12)',
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {results.map(p => (
              <li key={p.id}>
                <button
                  type='button'
                  onMouseDown={e => {
                    e.preventDefault();
                    // label = "nº processo · Nome · telefone" (findPatientsAction)
                    const parts = p.label.split('·').map(x => x.trim());
                    const name = parts[1] ?? parts[0];
                    const phone = parts[2] ?? '';
                    onChange({ patientId: p.id, name, phone }); // lista some (derivada)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#1B2A6B',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        value={row.phone}
        onChange={e => onChange({ phone: e.target.value })}
        placeholder='Telefone'
        inputMode='tel'
        style={field}
      />
      <select
        value={row.relationship}
        onChange={e => onChange({ relationship: e.target.value })}
        style={field}
      >
        <option value=''>Parentesco…</option>
        {RELATIONSHIPS.map(r => (
          <option key={r} value={r}>
            {RELATIONSHIP_LABEL[r]}
          </option>
        ))}
      </select>
      <button
        type='button'
        onClick={onRemove}
        title='Remover'
        style={{
          border: 'none',
          background: 'transparent',
          color: '#9AA1B4',
          cursor: 'pointer',
          padding: 8,
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
