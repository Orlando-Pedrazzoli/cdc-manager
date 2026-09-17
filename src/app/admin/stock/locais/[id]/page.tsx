// 📄 src/app/admin/stock/locais/[id]/page.tsx
// =============================================================================
// CDC Manager — Stock por LOCAL: ecrã de um local (gabinete, central, …)
// -----------------------------------------------------------------------------
// Produtos com saldo e níveis, requisição/devolução, contagem, quem
// trabalhou no gabinete desde a última contagem (Appointment.roomId) e
// extrato de movimentos do local.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getActiveClinics } from '@/models/Clinic';
import User from '@/models/User';
import {
  getLocationDetail,
  getLocationsOverview,
  getRoomStaffing,
} from '@/lib/stock-locations';
import { LocationDetail } from '@/components/stock/LocationDetail';
import { CountStatusBadge, fmtEur } from '@/components/stock/LocationCards';
import { StockNav } from '@/components/stock/StockNav';
import { Badge } from '@/components/ui/Badge';
import {
  WAREHOUSE_KIND_LABEL,
  STOCK_MOVEMENT_LABEL,
  STOCK_COUNT_INTERVAL_DAYS,
  PRODUCT_UNIT_LABEL,
  type ProductUnit,
} from '@/lib/domain';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Local de stock' };

function lisbonDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso));
}
function lisbonDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso));
}

export default async function StockLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  const isAdmin = session.user.role === 'admin';

  await dbConnect();
  const detail = await getLocationDetail(id);
  if (!detail) notFound();
  const { location, rows, openCount, lastClosedCount, movements, centralName } =
    detail;

  const [clinicsRaw, staff, cards] = await Promise.all([
    getActiveClinics(),
    User.find({ role: { $in: ['admin', 'receptionist'] }, status: 'active' })
      .select('name')
      .sort({ name: 1 })
      .lean(),
    getLocationsOverview(),
  ]);
  const card = cards.find(c => c.id === location.id);
  if (!card) notFound();
  const clinicName =
    clinicsRaw.find(c => String(c._id) === location.clinicId)?.name ?? '';

  // Quem trabalhou aqui desde a última contagem (ou últimos 15 dias)
  const since = staffingSince(location.lastCountAt);
  const staffing =
    location.kind === 'operatory'
      ? await getRoomStaffing(location.id, since)
      : [];

  return (
    <div
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <Link
        href='/admin/stock/locais'
        style={{
          fontSize: 13,
          color: '#1B2A6B',
          display: 'inline-flex',
          gap: 6,
          alignItems: 'center',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={14} /> Locais
      </Link>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
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
            {location.name}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6A7186' }}>
            {WAREHOUSE_KIND_LABEL[location.kind]} · {clinicName}
            {location.description ? ` · ${location.description}` : ''}
          </p>
        </div>
        {!location.isCentral && (
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <CountStatusBadge
              status={location.countStatus.status}
              daysUntilDue={location.countStatus.daysUntilDue}
              open={!!openCount}
            />
            {lastClosedCount?.closedAt && (
              <span style={{ fontSize: 12, color: '#6A7186' }}>
                última contagem {lisbonDateTime(lastClosedCount.closedAt)} ·
                consumo {fmtEur(lastClosedCount.consumedValueCents)}
              </span>
            )}
          </div>
        )}
      </div>
      <StockNav active='/admin/stock/locais' />

      <LocationDetail
        loc={{
          id: location.id,
          clinicId: location.clinicId,
          name: location.name,
          isCentral: location.isCentral,
          active: location.active,
        }}
        card={card}
        centralName={centralName}
        rows={rows}
        openCount={openCount}
        clinics={clinicsRaw.map(c => ({ id: String(c._id), name: c.name }))}
        users={staff.map(u => ({ id: String(u._id), name: u.name }))}
        isAdmin={isAdmin}
      />

      {location.kind === 'operatory' && (
        <section>
          <h2
            style={{
              margin: '8px 0 6px',
              fontSize: 15,
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Quem trabalhou neste gabinete
          </h2>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6A7186' }}>
            Desde {lisbonDate(since.toISOString())} (
            {location.lastCountAt
              ? 'última contagem'
              : `últimos ${STOCK_COUNT_INTERVAL_DAYS} dias`}
            ), por consultas com gabinete atribuído na agenda.
          </p>
          {staffing.length === 0 ? (
            <p style={{ fontSize: 13, color: '#6A7186' }}>
              Sem consultas atribuídas a este gabinete no período. Atribua o
              gabinete na nova marcação (Agenda).
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}
            >
              {staffing.map(s => (
                <div
                  key={s.doctorId ?? 'none'}
                  style={{
                    border: '1px solid #EEF1F8',
                    borderRadius: 12,
                    padding: 12,
                    background: '#fff',
                  }}
                >
                  <div
                    style={{ fontWeight: 700, color: '#1C2233', fontSize: 14 }}
                  >
                    {s.doctorName}
                  </div>
                  <div style={{ fontSize: 12, color: '#6A7186', marginTop: 4 }}>
                    {s.appointments} consulta{s.appointments === 1 ? '' : 's'} ·{' '}
                    {s.completed} concluída{s.completed === 1 ? '' : 's'}
                  </div>
                  <div style={{ fontSize: 11, color: '#6A7186' }}>
                    {lisbonDate(s.firstAt)} → {lisbonDate(s.lastAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2
          style={{
            margin: '8px 0 10px',
            fontSize: 15,
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          Movimentos recentes
        </h2>
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
                <th style={th}>Data</th>
                <th style={th}>Tipo</th>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Qtd.</th>
                <th style={th}>Por</th>
                <th style={th}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...td,
                      textAlign: 'center',
                      color: '#6A7186',
                      padding: 20,
                    }}
                  >
                    Sem movimentos.
                  </td>
                </tr>
              )}
              {movements.map(m => (
                <tr key={m.id} style={{ borderTop: '1px solid #EEF1F8' }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {lisbonDateTime(m.at)}
                  </td>
                  <td style={td}>
                    <Badge
                      variant={
                        m.inbound
                          ? 'success'
                          : m.type === 'consumption'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {STOCK_MOVEMENT_LABEL[m.type]}
                    </Badge>
                  </td>
                  <td style={td}>{m.productName}</td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontWeight: 700,
                      color: m.inbound ? '#1E8E3E' : '#B3261E',
                    }}
                  >
                    {m.inbound ? '+' : '−'}
                    {m.quantity}{' '}
                    {PRODUCT_UNIT_LABEL[m.unit as ProductUnit] ?? ''}
                  </td>
                  <td style={td}>{m.byName ?? 'Sistema'}</td>
                  <td style={{ ...td, color: '#6A7186' }}>{m.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// Fora do componente (regra de pureza do React Compiler): Server Component
// dinâmico, o instante é o do pedido
function staffingSince(lastCountAt: string | null): Date {
  return lastCountAt
    ? new Date(lastCountAt)
    : new Date(Date.now() - STOCK_COUNT_INTERVAL_DAYS * 86_400_000);
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
