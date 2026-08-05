// 📄 src/app/admin/stock/[id]/page.tsx
// =============================================================================
// CDC Manager — Stock: extrato do produto (o "extrato bancário" do ledger)
// -----------------------------------------------------------------------------
// Cabeçalho com os saldos por clínica + histórico imutável de movimentos:
// data, tipo (entrada verde / saída vermelha), clínica, quantidade com
// sinal, quem registou e a nota. Read-only — correções fazem-se com
// movimentos de acerto, nunca editando o passado.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import mongoose from 'mongoose';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import Warehouse from '@/models/Warehouse';
import User from '@/models/User';
import { getActiveClinics } from '@/models/Clinic';
import {
  PRODUCT_UNIT_LABEL,
  STOCK_MOVEMENT_LABEL,
  STOCK_INBOUND_TYPES,
  type StockMovementType,
  type ProductUnit,
} from '@/lib/domain';
import { Badge } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Produto' };

function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

export default async function ProductLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  if (!mongoose.isValidObjectId(id)) notFound();

  await dbConnect();
  const product = await Product.findById(id).lean();
  if (!product) notFound();

  const [clinics, warehouses, movements] = await Promise.all([
    getActiveClinics(),
    Warehouse.find({}).select('clinicId name').lean(),
    StockMovement.find({ productId: id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const clinicNameById = new Map(clinics.map(c => [String(c._id), c.name]));
  const clinicSlugById = new Map(clinics.map(c => [String(c._id), c.slug]));
  const warehouseById = new Map(warehouses.map(w => [String(w._id), w]));

  const userIds = [
    ...new Set(
      movements
        .filter(m => m.createdByUserId)
        .map(m => String(m.createdByUserId)),
    ),
  ];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('name')
        .lean()
    : [];
  const userById = new Map(users.map(u => [String(u._id), u]));

  // Saldos por clínica a partir do cache
  const balances = clinics.map(c => {
    const slug = clinicSlugById.get(String(c._id));
    const qty = product.stockCache.reduce((sum, cache) => {
      const wh = warehouseById.get(String(cache.warehouseId));
      return wh && String(wh.clinicId) === String(c._id)
        ? sum + cache.quantity
        : sum;
    }, 0);
    return { slug, name: c.name, qty };
  });
  const total = balances.reduce((s, b) => s + b.qty, 0);
  const unitLabel = PRODUCT_UNIT_LABEL[product.unit as ProductUnit];
  const low =
    product.active && (product.minStock ?? 0) > 0 && total < product.minStock;

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: 920,
      }}
    >
      <div>
        <Link
          href='/admin/stock'
          style={{ fontSize: '13px', color: '#6A7186', textDecoration: 'none' }}
        >
          ← Stock
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '6px',
            flexWrap: 'wrap',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            {product.name}
          </h1>
          {product.family && <Badge variant='neutral'>{product.family}</Badge>}
          <Badge variant={product.active ? 'success' : 'neutral'}>
            {product.active ? 'Ativo' : 'Inativo'}
          </Badge>
          {low && <Badge variant='danger'>Repor</Badge>}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          {unitLabel}
          {product.supplierName ? ` · ${product.supplierName}` : ''}
          {product.supplierRef ? ` (ref. ${product.supplierRef})` : ''}
          {(product.minStock ?? 0) > 0 ? ` · mínimo ${product.minStock}` : ''}
        </p>
      </div>

      {/* Saldos */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {balances.map(b => (
          <div
            key={b.slug}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEF1F8',
              borderRadius: '14px',
              padding: '14px 18px',
              minWidth: 150,
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
              {b.name}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '20px',
                fontWeight: 700,
                color: '#1C2233',
              }}
            >
              {b.qty}
            </p>
          </div>
        ))}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '14px 18px',
            minWidth: 150,
          }}
        >
          <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>Total</p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '20px',
              fontWeight: 700,
              color: low ? '#B3261E' : '#1B2A6B',
            }}
          >
            {total}
          </p>
        </div>
      </div>

      {/* Ledger */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid #F4F6FB',
            display: 'flex',
            alignItems: 'baseline',
            gap: '10px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Movimentos
          </h2>
          <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
            históricos são imutáveis — enganos corrigem-se com acertos
          </span>
        </div>

        {movements.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '20px 16px',
              fontSize: '13px',
              color: '#9AA1B4',
            }}
          >
            Ainda sem movimentos — registe a primeira entrada na tabela de
            stock.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {movements.map(m => {
                const inbound = STOCK_INBOUND_TYPES.includes(
                  m.type as StockMovementType,
                );
                const wh = warehouseById.get(String(m.warehouseId));
                const clinicName = wh
                  ? (clinicNameById.get(String(wh.clinicId)) ?? '—')
                  : '—';
                const who = m.createdByUserId
                  ? (userById.get(String(m.createdByUserId))?.name ?? '—')
                  : 'Sistema';
                return (
                  <tr
                    key={String(m._id)}
                    style={{ borderBottom: '1px solid #F4F6FB' }}
                  >
                    <td
                      style={{
                        padding: '10px 14px',
                        fontSize: '13px',
                        color: '#454C63',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lisbonDateTime(m.createdAt as Date)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge variant={inbound ? 'success' : 'danger'}>
                        {STOCK_MOVEMENT_LABEL[m.type as StockMovementType]}
                      </Badge>
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontSize: '13px',
                        color: '#454C63',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {clinicName}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: inbound ? '#1E7A3C' : '#B3261E',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {inbound ? '+' : '−'}
                      {m.quantity}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontSize: '13px',
                        color: '#454C63',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {who}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: '#9AA1B4',
                      }}
                    >
                      {m.note ?? ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
