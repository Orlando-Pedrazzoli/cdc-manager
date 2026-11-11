// 📄 src/components/clinico/odontograma/OdontogramaHistorico.tsx
// =============================================================================
// CDC Manager — Odontograma: histórico de tratamentos no mesmo ecrã
// -----------------------------------------------------------------------------
// 5.ª ronda/03: passou para o LADO do mapa (lista compacta, rolagem
// própria) — antes era uma tabela por baixo e perdia-se o mapa de vista.
// 4.ª ronda (Victor, nov. 2026), ponto 07: todos os atos
// do paciente por data, com dente(s) e faces, médico responsável e
// observações. Com um dente selecionado no mapa, filtra-se por esse dente
// com um clique; clicar no número de um dente na tabela seleciona-o no mapa.
// Dados: lib/odontogram-history.ts (carregados pela página, uma só vez).
// =============================================================================

'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type { OdontogramHistoryEntry } from '@/lib/odontogram-history';

const STATUS: Record<string, { label: string; color: string }> = {
  planned: { label: 'Planeado', color: '#B26A00' },
  completed: { label: 'Executado', color: '#2743A6' },
  invoiced: { label: 'Executado', color: '#2743A6' },
  void: { label: 'Anulado', color: '#9AA1B4' },
};
const PAGE = 40;

const chip = (active: boolean): React.CSSProperties => ({
  padding: '5px 11px',
  borderRadius: '999px',
  border: `1px solid ${active ? '#2743A6' : '#D5DBEA'}`,
  backgroundColor: active ? '#2743A6' : '#FFFFFF',
  color: active ? '#FFFFFF' : '#3D4257',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
});

export function OdontogramaHistorico({
  history,
  selected,
  onSelect,
}: {
  history: OdontogramHistoryEntry[];
  /** Dente selecionado no mapa (ou null) */
  selected: string | null;
  onSelect: (toothNumber: string) => void;
}) {
  const [onlyTooth, setOnlyTooth] = useState(false);
  const [showPlanned, setShowPlanned] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  const byTooth = onlyTooth && selected;
  const rows = history.filter(
    h => (showPlanned || h.status !== 'planned') && (!byTooth || h.teeth.includes(selected)),
  );
  const shown = rows.slice(0, limit);
  const hasNotes = history.some(h => h.kind === 'note');

  return (
    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #EEF1F8', borderRadius: '14px', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
          <ClipboardList size={16} />
          Histórico de tratamentos
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6A7186' }}>
            {rows.length} registo{rows.length === 1 ? '' : 's'}
            {hasNotes ? ' · inclui notas clínicas' : ''}
          </span>
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type='button' onClick={() => setOnlyTooth(false)} aria-pressed={!byTooth} style={chip(!byTooth)}>
            Todos os dentes
          </button>
          <button
            type='button'
            onClick={() => setOnlyTooth(true)}
            aria-pressed={!!byTooth}
            disabled={!selected}
            title={selected ? undefined : 'Selecione um dente no mapa'}
            style={{ ...chip(!!byTooth), opacity: selected ? 1 : 0.5, cursor: selected ? 'pointer' : 'default' }}
          >
            {selected ? `Só o dente ${selected}` : 'Só o dente selecionado'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6, fontSize: '12px', color: '#3D4257', cursor: 'pointer' }}>
            <input type='checkbox' checked={showPlanned} onChange={() => setShowPlanned(v => !v)} />
            Planeados
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          {byTooth ? `Sem atos registados no dente ${selected}.` : 'Sem atos registados.'}
        </p>
      ) : (
        <div>
          {/* 5.ª ronda/03: lista compacta (cabe na coluna ao lado do mapa):
              data · dente(s) · médico / ato / observações */}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map(h => {
              const st = h.status ? STATUS[h.status] : null;
              const isVoid = h.status === 'void';
              return (
                <li
                  key={h.id}
                  style={{
                    padding: '9px 2px',
                    borderBottom: '1px solid #F4F6FB',
                    opacity: isVoid ? 0.55 : 1,
                    backgroundColor: h.kind === 'note' ? '#FAFBFE' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', fontSize: '12px', color: '#6A7186' }}>
                    <span style={{ fontWeight: 700, color: '#1B2A6B', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {h.dateLabel ?? <span style={{ color: '#B26A00' }}>A realizar</span>}
                    </span>
                    {h.teeth.map(t => (
                      <button
                        key={t}
                        type='button'
                        onClick={() => onSelect(t)}
                        title={`Selecionar o dente ${t} no mapa`}
                        style={{
                          padding: '1px 7px',
                          borderRadius: '6px',
                          border: `1px solid ${selected === t ? '#2743A6' : '#D5DBEA'}`,
                          backgroundColor: selected === t ? '#EEF2FF' : '#FFFFFF',
                          color: '#1B2A6B',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                    {h.faces.length > 0 && <span>{h.faces.join('')}</span>}
                    {h.doctorName && <span style={{ marginLeft: 'auto', textAlign: 'right' }}>{h.doctorName}</span>}
                  </div>
                  <div style={{ marginTop: 3, fontSize: '13px', color: '#1C2233', textDecoration: isVoid ? 'line-through' : 'none' }}>
                    <span style={{ fontWeight: h.kind === 'note' ? 500 : 600, fontStyle: h.kind === 'note' ? 'italic' : 'normal' }}>{h.name}</span>
                    {st && h.status !== 'completed' && h.status !== 'invoiced' && (
                      <span style={{ marginLeft: 8, fontSize: '11px', fontWeight: 700, color: st.color }}>{st.label}</span>
                    )}
                  </div>
                  {h.notes && (
                    <div style={{ marginTop: 2, fontSize: '12.5px', color: '#3D4257', whiteSpace: 'pre-wrap' }}>{h.notes}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > limit && (
            <div style={{ paddingTop: 10, textAlign: 'center' }}>
              <button type='button' onClick={() => setLimit(l => l + PAGE)} style={chip(false)}>
                Mostrar mais ({rows.length - limit} por ver)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
