// 📄 src/components/stock/StockTable.tsx
// =============================================================================
// CDC Manager — Stock: tabela de produtos + modais de operação
// -----------------------------------------------------------------------------
// Uma linha por produto com saldo POR CLÍNICA + total, badge "Repor" quando
// o total desce abaixo do mínimo, e as três operações do dia a dia:
// Entrada · Saída · Transferir (modais; fluxo incremental — fica na página).
//
// Taxonomia emergente: o campo Família do modal de produto é texto livre
// com <datalist> alimentado pelas famílias já usadas — a primeira vez
// escreve-se, depois sugere-se. Sem ecrã de gestão de categorias.
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  createProductAction,
  updateProductAction,
  toggleProductActiveAction,
  registerStockEntryAction,
  registerStockExitAction,
  transferStockAction,
  createProductImageTicketAction,
  setProductImageAction,
  removeProductImageAction,
  type StockActionState,
} from '@/actions/stock';
import {
  PRODUCT_UNITS,
  PRODUCT_UNIT_LABEL,
  MANUAL_IN_TYPES,
  MANUAL_OUT_TYPES,
  STOCK_MOVEMENT_LABEL,
  type ProductUnit,
} from '@/lib/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';

export interface StockClinic {
  id: string;
  slug: string;
  name: string;
}

export interface StockProductRow {
  id: string;
  name: string;
  family: string | null;
  unit: ProductUnit;
  supplierName: string | null;
  supplierRef: string | null;
  minStock: number;
  active: boolean;
  /** thumbnail assinada da foto do produto (null = sem foto) */
  imageThumbUrl: string | null;
  /** saldo por slug de clínica (armazém default) */
  balances: Record<string, number>;
  total: number;
}

// =============================================================================
// Toggle ativo/inativo (padrão do CatalogTable)
// =============================================================================
function ActiveToggle({ product }: { product: StockProductRow }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<StockActionState, FormData>(
    toggleProductActiveAction,
    undefined,
  );
  const handled = useRef<StockActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) router.refresh();
  }, [state, router]);

  return (
    <form action={action} style={{ display: 'inline-flex' }}>
      <input type='hidden' name='id' value={product.id} />
      <input
        type='hidden'
        name='active'
        value={product.active ? 'false' : 'true'}
      />
      <button
        type='submit'
        disabled={pending}
        title={product.active ? 'Desativar produto' : 'Reativar produto'}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.5 : 1,
        }}
      >
        <Badge variant={product.active ? 'success' : 'neutral'}>
          {product.active ? 'Ativo' : 'Inativo'}
        </Badge>
      </button>
    </form>
  );
}

// =============================================================================
// Foto do produto (opcional; só em edição — o produto precisa de existir).
// Fluxo em 3 passos dos documentos: ticket → upload direto → confirmação.
// =============================================================================
function ProductPhotoSection({ product }: { product: StockProductRow }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<'upload' | 'remove' | null>(null);

  const upload = async (file: File | null) => {
    if (!file || pending) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Foto com mais de 10 MB — reduza a resolução.', {
        duration: 7000,
      });
      return;
    }
    setPending('upload');
    try {
      const ticket = await createProductImageTicketAction({
        productId: product.id,
      });
      if (!ticket.ok) {
        toast.error(ticket.error, { duration: 7000 });
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      for (const [key, value] of Object.entries(ticket.ticket.fields)) {
        fd.append(key, String(value));
      }
      const res = await fetch(ticket.ticket.uploadUrl, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        toast.error('O upload falhou — tente novamente.', { duration: 7000 });
        return;
      }
      const confirm = await setProductImageAction({ productId: product.id });
      if (!confirm.ok) {
        toast.error(confirm.error, { duration: 7000 });
        return;
      }
      toast.success('Foto atualizada', { duration: 4000 });
      router.refresh();
    } finally {
      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (pending) return;
    setPending('remove');
    try {
      const res = await removeProductImageAction({ productId: product.id });
      if (!res.ok) {
        toast.error(res.error, { duration: 7000 });
        return;
      }
      toast.success('Foto removida', { duration: 4000 });
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '10px',
          border: '1px solid #EEF1F8',
          backgroundColor: '#F4F6FB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {product.imageThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica
          <img
            src={product.imageThumbUrl}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Package size={22} style={{ color: '#9AA1B4' }} />
        )}
      </div>
      <input
        ref={fileRef}
        type='file'
        accept='image/*'
        style={{ display: 'none' }}
        onChange={e => upload(e.target.files?.[0] ?? null)}
      />
      <Button
        type='button'
        variant='ghost'
        size='sm'
        disabled={pending !== null}
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus size={15} />
        {pending === 'upload'
          ? 'A carregar…'
          : product.imageThumbUrl
            ? 'Substituir foto'
            : 'Adicionar foto'}
      </Button>
      {product.imageThumbUrl && (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={pending !== null}
          onClick={remove}
        >
          <Trash2 size={15} />
          {pending === 'remove' ? 'A remover…' : 'Remover'}
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// Modal de produto (criar/editar) — família com datalist emergente
// =============================================================================
function ProductModal({
  editing,
  families,
  onClose,
}: {
  editing: StockProductRow | null;
  families: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = editing !== null;
  const [createState, createFormAction, createPending] = useActionState<
    StockActionState,
    FormData
  >(createProductAction, undefined);
  const [updateState, updateFormAction, updatePending] = useActionState<
    StockActionState,
    FormData
  >(updateProductAction, undefined);
  const state = isEdit ? updateState : createState;
  const pending = isEdit ? updatePending : createPending;
  const handled = useRef<StockActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) {
      toast.success(isEdit ? 'Produto atualizado' : 'Produto criado', {
        duration: 5000,
      });
      onClose();
      router.refresh();
    }
  }, [state, isEdit, onClose, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar produto — ${editing.name}` : 'Novo produto'}
      maxWidth={560}
    >
      <form action={isEdit ? updateFormAction : createFormAction}>
        {isEdit && <input type='hidden' name='id' value={editing.id} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isEdit && <ProductPhotoSection product={editing} />}
          <Input
            id='prod-name'
            name='name'
            label='Nome do produto'
            defaultValue={editing?.name ?? ''}
            placeholder='Ex.: Luvas nitrilo M (caixa 100)'
            required
            maxLength={160}
          />

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Input
                id='prod-family'
                name='family'
                label='Família'
                defaultValue={editing?.family ?? ''}
                placeholder='Ex.: Descartáveis'
                list='stock-families'
                help='Escreva livremente — famílias já usadas são sugeridas'
              />
              <datalist id='stock-families'>
                {families.map(f => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div style={{ width: 170 }}>
              <Select
                id='prod-unit'
                name='unit'
                label='Unidade'
                defaultValue={editing?.unit ?? 'un'}
                required
              >
                {PRODUCT_UNITS.map(u => (
                  <option key={u} value={u}>
                    {PRODUCT_UNIT_LABEL[u]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ width: 150 }}>
              <Input
                id='prod-min'
                name='minStock'
                label='Stock mínimo'
                type='number'
                min={0}
                step='any'
                defaultValue={editing?.minStock ?? 0}
                help='Total (duas clínicas)'
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id='prod-supplier'
                name='supplierName'
                label='Fornecedor'
                defaultValue={editing?.supplierName ?? ''}
                maxLength={120}
              />
            </div>
            <div style={{ width: 150 }}>
              <Input
                id='prod-ref'
                name='supplierRef'
                label='Ref. fornecedor'
                defaultValue={editing?.supplierRef ?? ''}
                maxLength={80}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '4px',
            }}
          >
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit' variant='primary' disabled={pending}>
              {pending
                ? 'A gravar…'
                : isEdit
                  ? 'Gravar alterações'
                  : 'Criar produto'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Modal de movimento (entrada/saída)
// =============================================================================
function MovementModal({
  kind,
  product,
  clinics,
  onClose,
}: {
  kind: 'entry' | 'exit';
  product: StockProductRow;
  clinics: StockClinic[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isEntry = kind === 'entry';
  const [state, formAction, pending] = useActionState<
    StockActionState,
    FormData
  >(isEntry ? registerStockEntryAction : registerStockExitAction, undefined);
  const handled = useRef<StockActionState>(undefined);
  const [type, setType] = useState<string>(
    isEntry ? MANUAL_IN_TYPES[0] : MANUAL_OUT_TYPES[0],
  );
  const noteRequired = type !== 'purchase' && type !== 'consumption';

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 8000 });
    if ('success' in state) {
      toast.success(isEntry ? 'Entrada registada' : 'Saída registada', {
        duration: 5000,
      });
      onClose();
      router.refresh();
    }
  }, [state, isEntry, onClose, router]);

  const types = isEntry ? MANUAL_IN_TYPES : MANUAL_OUT_TYPES;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${isEntry ? 'Entrada' : 'Saída'} — ${product.name}`}
      maxWidth={480}
    >
      <form action={formAction}>
        <input type='hidden' name='productId' value={product.id} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Select id='mov-clinic' name='clinicId' label='Clínica' required>
                {clinics.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (saldo: {product.balances[c.slug] ?? 0})
                  </option>
                ))}
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              <Select
                id='mov-type'
                name='type'
                label='Tipo'
                value={type}
                onChange={e => setType(e.target.value)}
                required
              >
                {types.map(t => (
                  <option key={t} value={t}>
                    {STOCK_MOVEMENT_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Input
            id='mov-qty'
            name='quantity'
            label={`Quantidade (${PRODUCT_UNIT_LABEL[product.unit]})`}
            type='number'
            min={0.001}
            step='any'
            placeholder='0'
            required
          />

          <Textarea
            id='mov-note'
            name='note'
            label={noteRequired ? 'Motivo (obrigatório)' : 'Nota (opcional)'}
            placeholder={
              noteRequired
                ? 'Ex.: contagem física / caixa danificada'
                : 'Ex.: encomenda Montellano #4512'
            }
            required={noteRequired}
            maxLength={300}
            rows={2}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit' variant='primary' disabled={pending}>
              {pending
                ? 'A registar…'
                : isEntry
                  ? 'Registar entrada'
                  : 'Registar saída'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Modal de transferência entre clínicas
// =============================================================================
function TransferModal({
  product,
  clinics,
  onClose,
}: {
  product: StockProductRow;
  clinics: StockClinic[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    StockActionState,
    FormData
  >(transferStockAction, undefined);
  const handled = useRef<StockActionState>(undefined);
  const [fromId, setFromId] = useState(clinics[0]?.id ?? '');

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 8000 });
    if ('success' in state) {
      toast.success('Transferência registada', { duration: 5000 });
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const destinations = clinics.filter(c => c.id !== fromId);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Transferir — ${product.name}`}
      maxWidth={480}
    >
      <form action={formAction}>
        <input type='hidden' name='productId' value={product.id} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Select
                id='tr-from'
                name='fromClinicId'
                label='De'
                value={fromId}
                onChange={e => setFromId(e.target.value)}
                required
              >
                {clinics.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (saldo: {product.balances[c.slug] ?? 0})
                  </option>
                ))}
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              <Select
                id='tr-to'
                name='toClinicId'
                label='Para'
                key={fromId} // remonta quando a origem muda
                defaultValue={destinations[0]?.id ?? ''}
                required
              >
                {destinations.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Input
            id='tr-qty'
            name='quantity'
            label={`Quantidade (${PRODUCT_UNIT_LABEL[product.unit]})`}
            type='number'
            min={0.001}
            step='any'
            placeholder='0'
            required
          />

          <Textarea
            id='tr-note'
            name='note'
            label='Nota (opcional)'
            placeholder='Ex.: reforço para a semana'
            maxLength={300}
            rows={2}
          />

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}
          >
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit' variant='primary' disabled={pending}>
              {pending ? 'A registar…' : 'Transferir'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Tabela principal
// =============================================================================
type ModalState =
  | { kind: 'product'; editing: StockProductRow | null }
  | { kind: 'entry' | 'exit' | 'transfer'; product: StockProductRow }
  | null;

export function StockTable({
  products,
  clinics,
  families,
}: {
  products: StockProductRow[];
  clinics: StockClinic[];
  families: string[];
}) {
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (!showInactive && !p.active) return false;
      if (family && p.family !== family) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, family, showInactive]);

  const lowCount = products.filter(
    p => p.active && p.minStock > 0 && p.total < p.minStock,
  ).length;

  const th = (label: string, right = false) => (
    <th
      key={label}
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '10px 12px',
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        color: '#6A7186',
        borderBottom: '1px solid #EEF1F8',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {lowCount > 0 && (
        <div
          style={{
            backgroundColor: '#FDEDED',
            border: '1px solid #F3C4C1',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#B3261E',
            fontWeight: 600,
          }}
        >
          {lowCount === 1
            ? '1 produto abaixo do stock mínimo'
            : `${lowCount} produtos abaixo do stock mínimo`}{' '}
          — lista de compras à vista.
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ width: 240 }}>
          <Input
            id='stock-search'
            label='Pesquisar'
            placeholder='Nome do produto…'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ width: 200 }}>
          <Select
            id='stock-family'
            label='Família'
            value={family}
            onChange={e => setFamily(e.target.value)}
          >
            <option value=''>Todas</option>
            {families.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingBottom: '10px',
            fontSize: '13px',
            color: '#454C63',
            cursor: 'pointer',
          }}
        >
          <input
            type='checkbox'
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          Mostrar inativos
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            type='button'
            variant='primary'
            onClick={() => setModal({ kind: 'product', editing: null })}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            Novo produto
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8F9FD' }}>
              {th('Produto')}
              {th('Família')}
              {clinics.map(c => th(c.name, true))}
              {th('Total', true)}
              {th('Estado')}
              {th('')}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5 + clinics.length}
                  style={{
                    padding: '28px 14px',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#6A7186',
                  }}
                >
                  {products.length === 0
                    ? 'Ainda sem produtos — crie o primeiro em «Novo produto».'
                    : 'Nenhum produto corresponde aos filtros.'}
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const low = p.active && p.minStock > 0 && p.total < p.minStock;
              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '1px solid #F4F6FB',
                    opacity: p.active ? 1 : 0.55,
                  }}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '8px',
                          border: '1px solid #EEF1F8',
                          backgroundColor: '#F4F6FB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        {p.imageThumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica
                          <img
                            src={p.imageThumbUrl}
                            alt=''
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          <Package size={16} style={{ color: '#C3C9D9' }} />
                        )}
                      </div>
                      <div>
                        <Link
                          href={`/admin/stock/${p.id}`}
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#1C2233',
                            textDecoration: 'none',
                          }}
                        >
                          {p.name}
                        </Link>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '12px',
                            color: '#9AA1B4',
                          }}
                        >
                          {PRODUCT_UNIT_LABEL[p.unit]}
                          {p.supplierName ? ` · ${p.supplierName}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      fontSize: '13px',
                      color: '#454C63',
                    }}
                  >
                    {p.family ?? '—'}
                  </td>
                  {clinics.map(c => (
                    <td
                      key={c.slug}
                      style={{
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: '#454C63',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.balances[c.slug] ?? 0}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: '10px 12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: low ? '#B3261E' : '#1C2233',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.total}
                    {low && (
                      <span style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                        <Badge variant='danger'>Repor</Badge>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <ActiveToggle product={p} />
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        gap: '4px',
                      }}
                    >
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        title='Entrada'
                        onClick={() => setModal({ kind: 'entry', product: p })}
                      >
                        <ArrowDownToLine size={15} />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        title='Saída'
                        onClick={() => setModal({ kind: 'exit', product: p })}
                      >
                        <ArrowUpFromLine size={15} />
                      </Button>
                      {clinics.length > 1 && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          title='Transferir entre clínicas'
                          onClick={() =>
                            setModal({ kind: 'transfer', product: p })
                          }
                        >
                          <ArrowLeftRight size={15} />
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        title='Editar produto'
                        onClick={() =>
                          setModal({ kind: 'product', editing: p })
                        }
                      >
                        <Pencil size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modais (key remonta ao trocar de alvo) */}
      {modal?.kind === 'product' && (
        <ProductModal
          key={modal.editing?.id ?? 'create'}
          editing={modal.editing}
          families={families}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.kind === 'entry' || modal?.kind === 'exit') && (
        <MovementModal
          key={`${modal.kind}-${modal.product.id}`}
          kind={modal.kind}
          product={modal.product}
          clinics={clinics}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'transfer' && (
        <TransferModal
          key={`tr-${modal.product.id}`}
          product={modal.product}
          clinics={clinics}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
