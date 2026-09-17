// 📄 src/components/stock/CountForm.tsx
// =============================================================================
// CDC Manager — Contagem de um local: formulário de fecho
// -----------------------------------------------------------------------------
// Uma linha por produto com o ESPERADO (congelado na abertura) e o campo
// CONTADO. A diferença aparece em tempo real com a cor certa (falta =
// consumo, sobra = acerto). O fecho só envia as linhas preenchidas — o
// que não foi contado não gera movimento nenhum (nunca se assume).
// Botão "Igual ao esperado" para os locais onde quase nada mexeu.
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PRODUCT_UNIT_LABEL, type ProductUnit } from '@/lib/domain';
import {
  closeCountAction,
  type StockLocationActionState,
} from '@/actions/stock-locations';

export interface CountLineView {
  productId: string;
  name: string;
  unit: string;
  expected: number;
  unitCostCents: number;
}

export function CountForm({
  countId,
  locationId,
  lines,
}: {
  countId: string;
  locationId: string;
  lines: CountLineView[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    StockLocationActionState,
    FormData
  >(closeCountAction, undefined);
  const handled = useRef<StockLocationActionState>(undefined);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 8000 });
    if ('success' in state) {
      toast.success('Contagem fechada — consumo apurado');
      router.push(`/admin/stock/locais/${locationId}`);
      router.refresh();
    }
  }, [state, locationId, router]);

  const [counted, setCounted] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter(l => !q || l.name.toLowerCase().includes(q));
  }, [lines, search]);

  const payload = Object.entries(counted)
    .filter(([, v]) => v.trim() !== '')
    .map(([productId, v]) => ({ productId, counted: Number(v) }));

  const summary = useMemo(() => {
    let consumedCents = 0;
    let lines_ = 0;
    let diffs = 0;
    for (const l of lines) {
      const v = counted[l.productId];
      if (v === undefined || v.trim() === '') continue;
      lines_++;
      const diff = Number(v) - l.expected;
      if (diff < 0) {
        diffs++;
        consumedCents += Math.round(-diff * l.unitCostCents);
      } else if (diff > 0) diffs++;
    }
    return { consumedCents, lines: lines_, diffs };
  }, [lines, counted]);

  return (
    <form action={formAction}>
      <input type='hidden' name='countId' value={countId} />
      <input type='hidden' name='counted' value={JSON.stringify(payload)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ width: 260 }}>
            <Input
              id='cnt-search'
              label='Pesquisar'
              placeholder='Produto…'
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setCounted(prev => {
                const next = { ...prev };
                for (const l of visible)
                  if (!next[l.productId])
                    next[l.productId] = String(l.expected);
                return next;
              })
            }
          >
            Preencher com o esperado
          </Button>
          <Button type='button' variant='ghost' onClick={() => setCounted({})}>
            Limpar
          </Button>
        </div>

        <div
          style={{
            border: '1px solid #EEF1F8',
            borderRadius: 14,
            overflow: 'auto',
            background: '#fff',
          }}
        >
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr
                style={{
                  background: '#F7F8FB',
                  color: '#6A7186',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Esperado</th>
                <th style={{ ...th, width: 130 }}>Contado</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => {
                const v = counted[l.productId];
                const has = v !== undefined && v.trim() !== '';
                const diff = has
                  ? Math.round((Number(v) - l.expected) * 1000) / 1000
                  : null;
                return (
                  <tr
                    key={l.productId}
                    style={{ borderTop: '1px solid #EEF1F8' }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#1C2233' }}>
                        {l.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#6A7186' }}>
                        {PRODUCT_UNIT_LABEL[l.unit as ProductUnit] ?? l.unit}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#6A7186' }}>
                      {l.expected}
                    </td>
                    <td style={td}>
                      <input
                        type='number'
                        min={0}
                        step='any'
                        inputMode='decimal'
                        value={v ?? ''}
                        onChange={e =>
                          setCounted(c => ({
                            ...c,
                            [l.productId]: e.target.value,
                          }))
                        }
                        placeholder='—'
                        style={{
                          width: '100%',
                          padding: '7px 8px',
                          border: '1px solid #D8DDEA',
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      />
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 700,
                        color:
                          diff === null
                            ? '#C9D0E3'
                            : diff < 0
                              ? '#B3261E'
                              : diff > 0
                                ? '#B26A00'
                                : '#1E8E3E',
                      }}
                    >
                      {diff === null
                        ? '—'
                        : diff < 0
                          ? `${diff} (consumo)`
                          : diff > 0
                            ? `+${diff} (sobra)`
                            : '0'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Textarea
          id='cnt-note'
          name='note'
          label='Nota (opcional)'
          placeholder='Ex.: contagem quinzenal; caixa de luvas partilhada com o Gab. 2'
          rows={2}
          maxLength={300}
        />

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#fff',
            borderTop: '1px solid #EEF1F8',
            padding: '12px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: '#6A7186' }}>
            {summary.lines} de {lines.length} contados · {summary.diffs} com
            diferença · consumo estimado{' '}
            <strong style={{ color: '#1C2233' }}>
              {new Intl.NumberFormat('pt-PT', {
                style: 'currency',
                currency: 'EUR',
              }).format(summary.consumedCents / 100)}
            </strong>
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <Button
              type='button'
              variant='ghost'
              onClick={() => router.push(`/admin/stock/locais/${locationId}`)}
            >
              Voltar
            </Button>
            <Button
              type='submit'
              variant='primary'
              disabled={pending || payload.length === 0}
            >
              {pending ? 'A fechar…' : 'Fechar contagem'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'middle',
};
