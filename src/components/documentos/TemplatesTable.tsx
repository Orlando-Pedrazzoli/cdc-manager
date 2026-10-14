// 📄 src/components/documentos/TemplatesTable.tsx
// =============================================================================
// CDC Manager — Modelos de documentos: pesquisa + filtro por tipo + tabela
// -----------------------------------------------------------------------------
// 3.ª reunião/05 (Victor): "a lista vai crescer bastante com os 55 documentos
// enviados; hoje não há pesquisa própria nesta página". O servidor continua a
// entregar a lista completa (poucas dezenas de linhas) e o filtro corre no
// cliente: pesquisa por nome e tipo sem acentos, pills por tipo, contador.
// A tabela em si mudou de sítio (vinha de /admin/modelos/page.tsx) sem
// alterações de aspeto.
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  TEMPLATE_KIND_LABEL,
  type TemplateKind,
} from '@/lib/data/document-templates';
import {
  TemplateEditorButton,
  TemplateToggle,
} from '@/components/documentos/TemplateEditor';

export interface TemplateRow {
  id: string;
  kind: TemplateKind;
  title: string;
  body: string;
  bodyLength: number;
  placeholders: string[];
  allowStaff: boolean;
  requiresSignature: boolean;
  active: boolean;
}

/** "Orientações Pós-Extração" → "orientacoes pos-extracao" */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function TemplatesTable({ templates }: { templates: TemplateRow[] }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<TemplateKind | ''>('');

  // Só os tipos que existem na base aparecem como pills (com contagem)
  const kinds = useMemo(() => {
    const count = new Map<TemplateKind, number>();
    for (const t of templates) count.set(t.kind, (count.get(t.kind) ?? 0) + 1);
    return (Object.keys(TEMPLATE_KIND_LABEL) as TemplateKind[])
      .filter(k => count.has(k))
      .map(k => ({ kind: k, label: TEMPLATE_KIND_LABEL[k], n: count.get(k)! }));
  }, [templates]);

  const filtered = useMemo(() => {
    const q = fold(query);
    return templates.filter(t => {
      if (kind && t.kind !== kind) return false;
      if (!q) return true;
      const hay = `${fold(t.title)} ${fold(TEMPLATE_KIND_LABEL[t.kind])}`;
      return q.split(/\s+/).every(w => hay.includes(w));
    });
  }, [templates, query, kind]);

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    overflow: 'hidden',
  };
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
  };
  const td: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
    verticalAlign: 'top',
  };
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    color: active ? '#FFFFFF' : '#1B2A6B',
    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
    border: `1px solid ${active ? '#1B2A6B' : '#D8DEEF'}`,
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Pesquisa + pills por tipo */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <Input
            id='tpl-search'
            icon={<Search size={15} />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='Pesquisar modelo por nome ou tipo… (ex.: implante, consentimento)'
            autoComplete='off'
            aria-label='Pesquisar modelos'
          />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            type='button'
            onClick={() => setKind('')}
            aria-pressed={kind === ''}
            style={pill(kind === '')}
          >
            Todos · {templates.length}
          </button>
          {kinds.map(k => (
            <button
              key={k.kind}
              type='button'
              onClick={() => setKind(kind === k.kind ? '' : k.kind)}
              aria-pressed={kind === k.kind}
              style={pill(kind === k.kind)}
            >
              {k.label} · {k.n}
            </button>
          ))}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: '#6A7186',
              whiteSpace: 'nowrap',
            }}
          >
            {filtered.length === templates.length
              ? `${templates.length} modelos`
              : `${filtered.length} de ${templates.length} modelos`}
          </span>
        </div>
      </div>

      <div style={card}>
        <div className='cdc-table-scroll'>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Modelo</th>
                <th style={th}>Tipo</th>
                <th style={th}>Campos automáticos</th>
                <th style={th}>Quem emite</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      ...td,
                      textAlign: 'center',
                      color: '#9AA1B4',
                      padding: '28px 12px',
                    }}
                  >
                    Nenhum modelo corresponde a &ldquo;{query}&rdquo;
                    {kind ? ` em ${TEMPLATE_KIND_LABEL[kind]}` : ''}.
                  </td>
                </tr>
              )}
              {filtered.map(t => (
                <tr key={t.id} style={{ opacity: t.active ? 1 : 0.55 }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{t.title}</div>
                    <div style={{ fontSize: '11px', color: '#9AA1B4' }}>
                      {t.bodyLength.toLocaleString('pt-PT')} caracteres
                      {t.requiresSignature ? ' · exige assinatura' : ''}
                      {!t.active ? ' · desativado' : ''}
                    </div>
                  </td>
                  <td style={td}>
                    <Badge variant='info'>{TEMPLATE_KIND_LABEL[t.kind]}</Badge>
                  </td>
                  <td style={{ ...td, fontSize: '11.5px', color: '#6A7186' }}>
                    {t.placeholders.join(', ') || '—'}
                  </td>
                  <td style={td}>
                    {t.allowStaff ? 'Médico e receção' : 'Só médico'}
                  </td>
                  <td
                    style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}
                  >
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <TemplateEditorButton
                        initial={{
                          id: t.id,
                          kind: t.kind,
                          title: t.title,
                          body: t.body,
                          allowStaff: t.allowStaff,
                          requiresSignature: t.requiresSignature,
                          active: t.active,
                        }}
                      />
                      <TemplateToggle id={t.id} active={t.active} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
