// 📄 src/components/produtos/ProductCatalog.tsx
// =============================================================================
// CDC Manager — Produtos: catálogo (7.ª ronda/B2b)
// -----------------------------------------------------------------------------
// Lista dos produtos de venda com PVP (IVA incluído) e taxa de IVA. A gestão
// cria, edita e tira de venda; a receção só consulta.
// =============================================================================

'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  saveSaleProductAction,
  setSaleProductActiveAction,
  type ProductActionState,
} from '@/actions/product-sales';
import {
  VAT_RATES,
  VAT_RATE_LABEL,
  formatEuro,
  vatIncluded,
} from '@/lib/product-sales';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

export interface CatalogItem {
  id: string;
  name: string;
  priceCents: number;
  vatRate: number;
  active: boolean;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#8A91A6',
  borderBottom: '1px solid #EEF1F8',
};
const td: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '14px',
  color: '#1C2233',
  borderBottom: '1px solid #F4F6FB',
};

function ProductForm({
  item,
  onDone,
}: {
  item: CatalogItem | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProductActionState, FormData>(
    async (prev, fd) => {
      const res = await saveSaleProductAction(prev, fd);
      if (res && 'success' in res) {
        toast.success(res.message);
        router.refresh();
        onDone();
      }
      return res;
    },
    undefined,
  );
  return (
    <form
      action={action}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 2fr) minmax(110px, 1fr) minmax(150px, 1fr) auto',
        gap: 12,
        alignItems: 'end',
        padding: '12px',
        border: '1px solid #D8DEEF',
        borderRadius: '10px',
        backgroundColor: '#FAFBFE',
      }}
    >
      <input type='hidden' name='id' value={item?.id ?? ''} />
      <Input
        id={`sp-name-${item?.id ?? 'new'}`}
        name='name'
        label='Produto *'
        defaultValue={item?.name ?? ''}
        maxLength={120}
        placeholder='Ex.: Bisnaga de branqueamento'
        required
      />
      <Input
        id={`sp-price-${item?.id ?? 'new'}`}
        name='price'
        label='Preço com IVA (€) *'
        defaultValue={item ? (item.priceCents / 100).toFixed(2).replace('.', ',') : ''}
        inputMode='decimal'
        placeholder='12,50'
        required
      />
      <Select
        id={`sp-vat-${item?.id ?? 'new'}`}
        name='vatRate'
        label='IVA *'
        defaultValue={String(item?.vatRate ?? 23)}
      >
        {VAT_RATES.map(r => (
          <option key={r} value={r}>
            {VAT_RATE_LABEL[r]}
          </option>
        ))}
      </Select>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type='submit' size='sm' loading={pending}>
          {item ? 'Guardar' : 'Criar produto'}
        </Button>
        <Button type='button' size='sm' variant='secondary' onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
      </div>
      {state && 'error' in state && (
        <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '13px', color: '#B3261E' }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

export function ProductCatalog({
  products,
  isAdmin,
}: {
  products: CatalogItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  // 'new' | id do produto em edição | null
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (p: CatalogItem) => {
    setBusy(p.id);
    const res = await setSaleProductActiveAction(p.id, !p.active);
    setBusy(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(p.active ? 'Produto retirado de venda.' : 'Produto de novo à venda.');
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {products.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Preço (com IVA)</th>
                <th style={th}>IVA</th>
                <th style={{ ...th, textAlign: 'right' }}>Sem IVA</th>
                {isAdmin && <th style={th} />}
              </tr>
            </thead>
            <tbody>
              {products.map(p =>
                editing === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={isAdmin ? 5 : 4} style={{ padding: '8px 0' }}>
                      <ProductForm item={p} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                    <td style={td}>
                      {p.name}
                      {!p.active && (
                        <span style={{ marginLeft: 8, fontSize: '11px', fontWeight: 700, color: '#8A91A6' }}>
                          FORA DE VENDA
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {formatEuro(p.priceCents)}
                    </td>
                    <td style={td}>{p.vatRate}%</td>
                    <td style={{ ...td, textAlign: 'right', color: '#6A7186' }}>
                      {formatEuro(p.priceCents - vatIncluded(p.priceCents, p.vatRate))}
                    </td>
                    {isAdmin && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button size='sm' variant='outline' onClick={() => setEditing(p.id)}>
                          Editar
                        </Button>{' '}
                        <Button
                          size='sm'
                          variant='secondary'
                          loading={busy === p.id}
                          onClick={() => toggle(p)}
                        >
                          {p.active ? 'Tirar de venda' : 'Repor à venda'}
                        </Button>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {isAdmin &&
        (editing === 'new' ? (
          <ProductForm item={null} onDone={() => setEditing(null)} />
        ) : (
          <div>
            <Button size='sm' onClick={() => setEditing('new')}>
              Novo produto
            </Button>
          </div>
        ))}
    </div>
  );
}
