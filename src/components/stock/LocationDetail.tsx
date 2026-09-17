// 📄 src/components/stock/LocationDetail.tsx
// =============================================================================
// CDC Manager — Stock por local: ecrã de um local (client)
// -----------------------------------------------------------------------------
//   · Tabela de produtos no local: saldo, mín/máx (editável inline), estado
//   · Requisitar do armazém central (modal multi-linha, com sugestão
//     max − saldo pré-preenchida — Kanban "repor ao máximo")
//   · Devolver ao central (linha a linha)
//   · Iniciar / continuar / descartar contagem
//   · Editar o próprio local (reutiliza LocationModal)
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  PackagePlus,
  Undo2,
  ClipboardCheck,
  Pencil,
  Power,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { PRODUCT_UNIT_LABEL } from '@/lib/domain';
import {
  requisitionAction,
  returnToCentralAction,
  setStockLevelAction,
  openCountAction,
  discardCountAction,
  toggleLocationActiveAction,
  type StockLocationActionState,
} from '@/actions/stock-locations';
import type { LocationProductRow, LocationCard } from '@/lib/stock-locations';
import { LocationModal, fmtEur } from '@/components/stock/LocationCards';

type Loc = {
  id: string;
  clinicId: string;
  name: string;
  isCentral: boolean;
  active: boolean;
};

function useActionToast(
  state: StockLocationActionState,
  okMsg: string,
  onOk?: (id?: string) => void,
) {
  const router = useRouter();
  const handled = useRef<StockLocationActionState>(undefined);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 8000 });
    if ('success' in state) {
      toast.success(okMsg);
      onOk?.(state.id);
      router.refresh();
    }
  }, [state, okMsg, onOk, router]);
}

// =============================================================================
// Requisição multi-linha
// =============================================================================
function RequisitionModal({
  loc,
  centralName,
  rows,
  onClose,
}: {
  loc: Loc;
  centralName: string | null;
  rows: LocationProductRow[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    StockLocationActionState,
    FormData
  >(requisitionAction, undefined);
  useActionToast(state, 'Requisição registada', onClose);
  const [search, setSearch] = useState('');
  // Pré-preenche com a sugestão (max − saldo) — a Isabel só confirma
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.filter(r => r.suggested > 0).map(r => [r.id, String(r.suggested)]),
    ),
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      r =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.family ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);
  const lines = Object.entries(qty)
    .map(([productId, v]) => ({ productId, quantity: Number(v) }))
    .filter(l => l.quantity > 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Requisitar do ${centralName ?? 'armazém central'} → ${loc.name}`}
      maxWidth={720}
    >
      <form action={formAction}>
        <input type='hidden' name='toWarehouseId' value={loc.id} />
        <input type='hidden' name='lines' value={JSON.stringify(lines)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            id='req-search'
            label='Pesquisar produto'
            placeholder='Nome ou família…'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div
            style={{
              maxHeight: 380,
              overflow: 'auto',
              border: '1px solid #EEF1F8',
              borderRadius: 10,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#F7F8FB',
                    color: '#6A7186',
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={th}>Produto</th>
                  <th style={{ ...th, textAlign: 'right' }}>No central</th>
                  <th style={{ ...th, textAlign: 'right' }}>Aqui</th>
                  <th style={{ ...th, textAlign: 'right' }}>Máx.</th>
                  <th style={{ ...th, width: 110 }}>Requisitar</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #EEF1F8' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#1C2233' }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#6A7186' }}>
                        {r.family ?? '—'} · {PRODUCT_UNIT_LABEL[r.unit]}
                      </div>
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        color: r.centralBalance <= 0 ? '#B3261E' : undefined,
                      }}
                    >
                      {r.centralBalance}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{r.balance}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#6A7186' }}>
                      {r.max || '—'}
                    </td>
                    <td style={td}>
                      <input
                        type='number'
                        min={0}
                        step='any'
                        value={qty[r.id] ?? ''}
                        onChange={e =>
                          setQty(q => ({ ...q, [r.id]: e.target.value }))
                        }
                        placeholder='0'
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #D8DDEA',
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Textarea
            id='req-note'
            name='note'
            label='Nota (opcional)'
            placeholder='Ex.: reposição quinzenal'
            rows={2}
            maxLength={300}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span
              style={{ fontSize: 12, color: '#6A7186', marginRight: 'auto' }}
            >
              {lines.length} linha{lines.length === 1 ? '' : 's'}
            </span>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type='submit'
              variant='primary'
              disabled={pending || lines.length === 0}
            >
              {pending ? 'A registar…' : 'Registar requisição'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Devolução ao central
// =============================================================================
function ReturnModal({
  loc,
  row,
  onClose,
}: {
  loc: Loc;
  row: LocationProductRow;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    StockLocationActionState,
    FormData
  >(returnToCentralAction, undefined);
  useActionToast(state, 'Devolução registada', onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Devolver ao armazém — ${row.name}`}
      maxWidth={440}
    >
      <form action={formAction}>
        <input type='hidden' name='fromWarehouseId' value={loc.id} />
        <input type='hidden' name='productId' value={row.id} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            id='ret-qty'
            name='quantity'
            type='number'
            min={0.001}
            max={row.balance}
            step='any'
            label={`Quantidade (saldo aqui: ${row.balance} ${PRODUCT_UNIT_LABEL[row.unit]})`}
            required
          />
          <Textarea
            id='ret-note'
            name='note'
            label='Nota (opcional)'
            rows={2}
            maxLength={300}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit' variant='primary' disabled={pending}>
              {pending ? 'A registar…' : 'Devolver'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Níveis mín/máx inline
// =============================================================================
function LevelForm({ loc, row }: { loc: Loc; row: LocationProductRow }) {
  const [state, formAction, pending] = useActionState<
    StockLocationActionState,
    FormData
  >(setStockLevelAction, undefined);
  useActionToast(state, 'Nível guardado');
  return (
    <form
      action={formAction}
      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
    >
      <input type='hidden' name='productId' value={row.id} />
      <input type='hidden' name='warehouseId' value={loc.id} />
      <input
        name='min'
        type='number'
        min={0}
        step='any'
        defaultValue={row.min}
        style={lvlInput}
        aria-label='Mínimo'
      />
      <span style={{ color: '#6A7186' }}>/</span>
      <input
        name='max'
        type='number'
        min={0}
        step='any'
        defaultValue={row.max}
        style={lvlInput}
        aria-label='Máximo'
      />
      <Button type='submit' size='sm' variant='outline' disabled={pending}>
        {pending ? '…' : 'OK'}
      </Button>
    </form>
  );
}

// =============================================================================
// Ecrã
// =============================================================================
export function LocationDetail({
  loc,
  card,
  centralName,
  rows,
  openCount,
  clinics,
  users,
  isAdmin,
}: {
  loc: Loc;
  card: LocationCard;
  centralName: string | null;
  rows: LocationProductRow[];
  openCount: { id: string; openedAt: string } | null;
  clinics: { id: string; name: string }[];
  users: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<
    | { kind: 'req' }
    | { kind: 'ret'; row: LocationProductRow }
    | { kind: 'edit' }
    | null
  >(null);
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [search, setSearch] = useState('');

  const [openState, openAction, opening] = useActionState<
    StockLocationActionState,
    FormData
  >(openCountAction, undefined);
  useActionToast(openState, 'Contagem aberta', id => {
    if (id) router.push(`/admin/stock/contagens/${id}`);
  });
  const [discardState, discardAction, discarding] = useActionState<
    StockLocationActionState,
    FormData
  >(discardCountAction, undefined);
  useActionToast(discardState, 'Contagem descartada');
  const [toggleState, toggleAction, toggling] = useActionState<
    StockLocationActionState,
    FormData
  >(toggleLocationActiveAction, undefined);
  useActionToast(
    toggleState,
    loc.active ? 'Local desativado' : 'Local reativado',
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      r =>
        (!onlyWithStock || r.balance > 0 || r.min > 0 || r.max > 0) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          (r.family ?? '').toLowerCase().includes(q)),
    );
  }, [rows, onlyWithStock, search]);
  const totalValue = rows.reduce(
    (s, r) => s + (r.balance > 0 ? Math.round(r.balance * r.costCents) : 0),
    0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ações */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {isAdmin && !loc.isCentral && loc.active && (
          <Button variant='primary' onClick={() => setModal({ kind: 'req' })}>
            <PackagePlus size={16} style={{ marginRight: 6 }} /> Requisitar do
            armazém
          </Button>
        )}
        {isAdmin && !loc.isCentral && loc.active && !openCount && (
          <form action={openAction}>
            <input type='hidden' name='warehouseId' value={loc.id} />
            <Button type='submit' variant='secondary' disabled={opening}>
              <ClipboardCheck size={16} style={{ marginRight: 6 }} />
              {opening ? 'A abrir…' : 'Iniciar contagem'}
            </Button>
          </form>
        )}
        {openCount && (
          <>
            <Button
              variant='secondary'
              onClick={() =>
                router.push(`/admin/stock/contagens/${openCount.id}`)
              }
            >
              <ClipboardCheck size={16} style={{ marginRight: 6 }} /> Continuar
              contagem
            </Button>
            {isAdmin && (
              <form action={discardAction}>
                <input type='hidden' name='countId' value={openCount.id} />
                <Button
                  type='submit'
                  variant='ghost'
                  size='sm'
                  disabled={discarding}
                >
                  Descartar contagem
                </Button>
              </form>
            )}
          </>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6A7186' }}>
          Valor em stock aqui:{' '}
          <strong style={{ color: '#1C2233' }}>{fmtEur(totalValue)}</strong>
        </span>
        {isAdmin && !loc.isCentral && (
          <>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setModal({ kind: 'edit' })}
            >
              <Pencil size={14} style={{ marginRight: 4 }} /> Editar
            </Button>
            <form action={toggleAction}>
              <input type='hidden' name='id' value={loc.id} />
              <input
                type='hidden'
                name='active'
                value={loc.active ? 'false' : 'true'}
              />
              <Button
                type='submit'
                variant='ghost'
                size='sm'
                disabled={toggling}
              >
                <Power size={14} style={{ marginRight: 4 }} />{' '}
                {loc.active ? 'Desativar' : 'Reativar'}
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Filtros */}
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
            id='loc-search'
            label='Pesquisar'
            placeholder='Produto ou família…'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <label
          style={{
            fontSize: 13,
            color: '#454C63',
            display: 'flex',
            gap: 6,
            paddingBottom: 10,
            cursor: 'pointer',
          }}
        >
          <input
            type='checkbox'
            checked={onlyWithStock}
            onChange={e => setOnlyWithStock(e.target.checked)}
          />
          Só produtos com saldo ou níveis definidos
        </label>
      </div>

      {/* Tabela */}
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
              <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
              {!loc.isCentral && (
                <th style={{ ...th, textAlign: 'right' }}>No central</th>
              )}
              <th style={th}>Estado</th>
              {isAdmin && <th style={th}>Mín. / Máx.</th>}
              {isAdmin && !loc.isCentral && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    ...td,
                    textAlign: 'center',
                    color: '#6A7186',
                    padding: 24,
                  }}
                >
                  {loc.isCentral
                    ? 'Sem produtos com saldo. As entradas de fornecedor fazem-se no separador Catálogo.'
                    : 'Sem produtos neste local — faça uma requisição do armazém central.'}
                </td>
              </tr>
            )}
            {visible.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #EEF1F8' }}>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: '#1C2233' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6A7186' }}>
                    {r.family ?? '—'} · {PRODUCT_UNIT_LABEL[r.unit]}
                  </div>
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontWeight: 700,
                    color: r.belowMin ? '#B3261E' : '#1C2233',
                  }}
                >
                  {r.balance}
                </td>
                {!loc.isCentral && (
                  <td style={{ ...td, textAlign: 'right', color: '#6A7186' }}>
                    {r.centralBalance}
                  </td>
                )}
                <td style={td}>
                  {r.belowMin ? (
                    <Badge variant='danger'>Abaixo do mínimo</Badge>
                  ) : r.max > 0 && r.balance > r.max ? (
                    <Badge variant='warning'>Acima do máximo</Badge>
                  ) : r.min > 0 || r.max > 0 ? (
                    <Badge variant='success'>OK</Badge>
                  ) : (
                    <Badge variant='neutral'>Sem nível</Badge>
                  )}
                </td>
                {isAdmin && (
                  <td style={td}>
                    <LevelForm loc={loc} row={r} />
                  </td>
                )}
                {isAdmin && !loc.isCentral && (
                  <td style={{ ...td, textAlign: 'right' }}>
                    {r.balance > 0 && (
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setModal({ kind: 'ret', row: r })}
                      >
                        <Undo2 size={14} style={{ marginRight: 4 }} /> Devolver
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.kind === 'req' && (
        <RequisitionModal
          loc={loc}
          centralName={centralName}
          rows={rows}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'ret' && (
        <ReturnModal loc={loc} row={modal.row} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'edit' && (
        <LocationModal
          clinics={clinics}
          users={users}
          editing={card}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
};
const lvlInput: React.CSSProperties = {
  width: 64,
  padding: '5px 6px',
  border: '1px solid #D8DDEA',
  borderRadius: 6,
  fontSize: 13,
};
