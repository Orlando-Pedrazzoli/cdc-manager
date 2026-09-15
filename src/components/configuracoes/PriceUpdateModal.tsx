// 📄 src/components/configuracoes/PriceUpdateModal.tsx
// =============================================================================
// CDC Manager — Tratamentos: Atualizar preços em massa (Fase 4, E8)
// -----------------------------------------------------------------------------
// Âmbito: toda a tabela · uma categoria · linhas escolhidas (picker com lupa)
// Regra: +/− % ou +/− € · arredondamento (cêntimo / 0,50 € / euro)
// Fluxo em 2 passos: Pré-visualizar (antes → depois, sem gravar) → Aplicar.
// O servidor recalcula ao aplicar; nunca confia nos números do ecrã.
// =============================================================================

'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Percent, X } from 'lucide-react';
import {
  previewPriceUpdateAction,
  applyPriceUpdateAction,
  type PricePreviewState,
  type PriceApplyState,
} from '@/actions/price-update';
import { formatCents } from '@/lib/commissions';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TreatmentPicker } from '@/components/clinico/TreatmentPicker';

interface LineOption {
  id: string;
  name: string;
  category: string | null;
  code?: string | null;
  priceCents: number;
}

export function PriceUpdateButton({
  categories,
  lines,
}: {
  categories: string[];
  lines: LineOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant='secondary' onClick={() => setOpen(true)}>
        <Percent size={15} style={{ marginRight: 6 }} />
        Atualizar preços
      </Button>
      {open && (
        <PriceUpdateModal
          categories={categories}
          lines={lines}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PriceUpdateModal({
  categories,
  lines,
  onClose,
}: {
  categories: string[];
  lines: LineOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<'all' | 'category' | 'lines'>('all');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<LineOption[]>([]);
  const [pickerValue, setPickerValue] = useState('');
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [rounding, setRounding] = useState<'cent' | 'half-euro' | 'euro'>(
    'cent',
  );
  const [reason, setReason] = useState('');

  const [preview, previewAction, previewing] = useActionState<
    PricePreviewState,
    FormData
  >(previewPriceUpdateAction, undefined);
  const [applied, applyAction, applying] = useActionState<
    PriceApplyState,
    FormData
  >(applyPriceUpdateAction, undefined);
  const handled = useRef<PriceApplyState>(undefined);
  useEffect(() => {
    if (!applied || applied === handled.current) return;
    handled.current = applied;
    if ('error' in applied) {
      toast.error(applied.error);
      return;
    }
    toast.success(`${applied.updated} preço(s) atualizado(s).`);
    router.refresh();
    onClose();
  }, [applied, router, onClose]);

  const buildForm = () => {
    const fd = new FormData();
    fd.set('scope', scope);
    fd.set('category', category);
    fd.set('lineIds', JSON.stringify(selected.map(l => l.id)));
    fd.set('mode', mode);
    fd.set('value', value);
    fd.set('rounding', rounding);
    fd.set('reason', reason);
    return fd;
  };

  const rows = useMemo(
    () => (preview && 'rows' in preview ? preview.rows : []),
    [preview],
  );
  const changed = useMemo(
    () => rows.filter(r => r.toCents !== r.fromCents),
    [rows],
  );

  const scopeBtn = (k: 'all' | 'category' | 'lines', label: string) => (
    <button
      type='button'
      onClick={() => setScope(k)}
      style={{
        flex: 1,
        padding: '8px 10px',
        border: `1.5px solid ${scope === k ? '#2743A6' : '#D8DEEF'}`,
        backgroundColor: scope === k ? '#EEF2FF' : '#FFFFFF',
        color: '#1B2A6B',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title='Atualizar preços da tabela'
      maxWidth={760}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Âmbito */}
        <div>
          <p style={lbl}>Âmbito</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {scopeBtn('all', 'Toda a tabela')}
            {scopeBtn('category', 'Uma categoria')}
            {scopeBtn('lines', 'Linhas escolhidas')}
          </div>
        </div>
        {scope === 'category' && (
          <Select
            label='Categoria'
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value=''>— Selecionar —</option>
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
        {scope === 'lines' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TreatmentPicker
              name='_picker'
              label='Adicionar linha'
              required={false}
              options={lines.filter(l => !selected.some(s => s.id === l.id))}
              value={pickerValue}
              onChange={id => {
                const l = lines.find(x => x.id === id);
                if (l) setSelected(s => [...s, l]);
                setPickerValue('');
              }}
              placeholder='Pesquisar ato para adicionar…'
            />
            {selected.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.map(l => (
                  <span
                    key={l.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 999,
                      backgroundColor: '#EEF2FF',
                      color: '#1B2A6B',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {l.name} · {formatCents(l.priceCents)}
                    <button
                      type='button'
                      onClick={() =>
                        setSelected(s => s.filter(x => x.id !== l.id))
                      }
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        color: '#6A7186',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Regra */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
          }}
        >
          <Select
            label='Tipo'
            value={mode}
            onChange={e => setMode(e.target.value as 'percent' | 'amount')}
          >
            <option value='percent'>Percentagem (%)</option>
            <option value='amount'>Valor (€)</option>
          </Select>
          <Input
            label={mode === 'percent' ? 'Variação (%)' : 'Variação (€)'}
            inputMode='decimal'
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={mode === 'percent' ? 'ex.: 2,7 ou -5' : 'ex.: 7 ou -3'}
            help='Negativo = descida'
          />
          <Select
            label='Arredondar'
            value={rounding}
            onChange={e => setRounding(e.target.value as typeof rounding)}
          >
            <option value='cent'>Ao cêntimo</option>
            <option value='half-euro'>Aos 0,50 €</option>
            <option value='euro'>Ao euro</option>
          </Select>
        </div>
        <Input
          label='Motivo (opcional)'
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={200}
          placeholder='ex.: atualização anual 2027'
        />

        {preview && 'error' in preview && <p style={errBox}>{preview.error}</p>}

        {/* Pré-visualização */}
        {rows.length > 0 && (
          <div
            style={{
              border: '1px solid #EEF1F8',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#F8F9FD',
                fontSize: '12.5px',
                color: '#3D4257',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                <strong>{changed.length}</strong> de {rows.length} preços mudam
                · {preview && 'ruleLabel' in preview ? preview.ruleLabel : ''}
              </span>
              <span>
                {preview && 'totalFrom' in preview
                  ? `${formatCents(preview.totalFrom)} → ${formatCents(preview.totalTo)} (soma da tabela)`
                  : ''}
              </span>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px',
                }}
              >
                <tbody>
                  {rows.slice(0, 300).map(r => (
                    <tr
                      key={r.id}
                      style={{ opacity: r.toCents === r.fromCents ? 0.5 : 1 }}
                    >
                      <td style={cell}>
                        {r.name}
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: '11px',
                            color: '#9AA1B4',
                          }}
                        >
                          {r.category ?? ''}
                        </span>
                      </td>
                      <td
                        style={{
                          ...cell,
                          textAlign: 'right',
                          color: '#6A7186',
                        }}
                      >
                        {formatCents(r.fromCents)}
                      </td>
                      <td
                        style={{
                          ...cell,
                          textAlign: 'center',
                          color: '#9AA1B4',
                        }}
                      >
                        →
                      </td>
                      <td
                        style={{
                          ...cell,
                          textAlign: 'right',
                          fontWeight: 700,
                          color:
                            r.toCents > r.fromCents
                              ? '#0F7B4D'
                              : r.toCents < r.fromCents
                                ? '#B3261E'
                                : '#1B2A6B',
                        }}
                      >
                        {formatCents(r.toCents)}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 300 && (
                    <tr>
                      <td style={{ ...cell, color: '#9AA1B4' }} colSpan={4}>
                        … e mais {rows.length - 300} linhas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
          Só afeta preços futuros: atos já registados mantêm o valor congelado.
          Cada ato guarda o histórico das últimas alterações.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type='button'
            variant='outline'
            loading={previewing}
            onClick={() => startTransition(() => previewAction(buildForm()))}
          >
            Pré-visualizar
          </Button>
          <Button
            type='button'
            loading={applying}
            disabled={changed.length === 0}
            onClick={() => {
              if (
                !confirm(
                  `Aplicar a ${changed.length} preço(s)? Esta ação fica registada.`,
                )
              )
                return;
              startTransition(() => applyAction(buildForm()));
            }}
          >
            Aplicar {changed.length > 0 ? `(${changed.length})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const lbl: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1B2A6B',
};
const cell: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #F4F6FB',
  color: '#1B2A6B',
};
const errBox: React.CSSProperties = {
  margin: 0,
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '14px',
  backgroundColor: '#FDEDED',
  color: '#B3261E',
};
