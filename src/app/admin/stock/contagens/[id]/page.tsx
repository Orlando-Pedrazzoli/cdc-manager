// 📄 src/app/admin/stock/contagens/[id]/page.tsx
// =============================================================================
// CDC Manager — Contagem de stock de um local (aberta → fechar; fechada →
// consulta read-only). É aqui que o consumo do gabinete se apura.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import mongoose from 'mongoose';
import { ArrowLeft } from 'lucide-react';
import StockCount from '@/models/StockCount';
import Warehouse from '@/models/Warehouse';
import User from '@/models/User';
import { CountForm } from '@/components/stock/CountForm';
import { fmtEur } from '@/components/stock/LocationCards';
import { Badge } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contagem de stock' };

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

export default async function StockCountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  if (!mongoose.isValidObjectId(id)) notFound();

  await dbConnect();
  const count = await StockCount.findById(id).lean();
  if (!count) notFound();
  const [wh, closedBy] = await Promise.all([
    Warehouse.findById(count.warehouseId).select('name').lean(),
    count.closedByUserId
      ? User.findById(count.closedByUserId).select('name').lean()
      : null,
  ]);
  const isAdmin = session.user.role === 'admin';
  const open = count.status === 'open';

  return (
    <div
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Link
        href={`/admin/stock/locais/${String(count.warehouseId)}`}
        style={{
          fontSize: 13,
          color: '#1B2A6B',
          display: 'inline-flex',
          gap: 6,
          alignItems: 'center',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={14} /> {wh?.name ?? 'Local'}
      </Link>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Contagem — {wh?.name ?? '—'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6A7186' }}>
            Aberta em {lisbonDateTime(count.createdAt)} · {count.lines.length}{' '}
            produto{count.lines.length === 1 ? '' : 's'}
            {!open && count.closedAt
              ? ` · fechada em ${lisbonDateTime(count.closedAt)}${closedBy ? ` por ${closedBy.name}` : ''}`
              : ''}
          </p>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          {open ? (
            <Badge variant='info'>Em curso</Badge>
          ) : (
            <Badge variant='success'>
              Fechada · consumo {fmtEur(count.consumedValueCents ?? 0)}
            </Badge>
          )}
        </span>
      </div>

      {open ? (
        isAdmin ? (
          <CountForm
            countId={String(count._id)}
            locationId={String(count.warehouseId)}
            lines={count.lines.map(l => ({
              productId: String(l.productId),
              name: l.nameSnapshot,
              unit: l.unitSnapshot,
              expected: l.expected,
              unitCostCents: l.unitCostCents ?? 0,
            }))}
          />
        ) : (
          <p style={{ fontSize: 13, color: '#6A7186' }}>
            Contagem em curso — só o administrador pode fechar.
          </p>
        )
      ) : (
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
                }}
              >
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Esperado</th>
                <th style={{ ...th, textAlign: 'right' }}>Contado</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferença</th>
                <th style={{ ...th, textAlign: 'right' }}>Consumo €</th>
              </tr>
            </thead>
            <tbody>
              {count.lines.map(l => {
                const diff =
                  Math.round(((l.counted ?? 0) - l.expected) * 1000) / 1000;
                return (
                  <tr
                    key={String(l.productId)}
                    style={{ borderTop: '1px solid #EEF1F8' }}
                  >
                    <td style={td}>
                      {l.nameSnapshot}{' '}
                      <span style={{ color: '#6A7186', fontSize: 11 }}>
                        ({l.unitSnapshot})
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#6A7186' }}>
                      {l.expected}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {l.counted ?? '—'}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 700,
                        color:
                          diff < 0
                            ? '#B3261E'
                            : diff > 0
                              ? '#B26A00'
                              : '#1E8E3E',
                      }}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {diff < 0
                        ? fmtEur(Math.round(-diff * (l.unitCostCents ?? 0)))
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {count.note && (
            <p
              style={{
                padding: '10px 12px',
                margin: 0,
                fontSize: 12,
                color: '#6A7186',
              }}
            >
              Nota: {count.note}
            </p>
          )}
        </div>
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
  padding: '9px 12px',
  verticalAlign: 'middle',
};
