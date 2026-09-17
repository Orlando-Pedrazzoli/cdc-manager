// 📄 src/app/admin/stock/locais/page.tsx
// =============================================================================
// CDC Manager — Stock por LOCAL: visão geral (set/2026, pedido da Isabel)
// -----------------------------------------------------------------------------
// Cartões por clínica: armazém central + gabinetes + esterilização + receção
// + serviços. Alertas FEFO (validades) no topo. A receção vê; só o admin
// cria locais, requisita e conta.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import User from '@/models/User';
import {
  getLocationsOverview,
  getExpiringPurchases,
} from '@/lib/stock-locations';
import { LocationCards } from '@/components/stock/LocationCards';
import { StockNav } from '@/components/stock/StockNav';
import { STOCK_EXPIRY_ALERT_DAYS } from '@/lib/domain';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stock — Locais' };

function lisbonDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso));
}

export default async function StockLocationsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const isAdmin = session.user.role === 'admin';

  await dbConnect();
  const [clinicsRaw, cards, staff, expiring] = await Promise.all([
    getActiveClinics(),
    getLocationsOverview(),
    User.find({ role: { $in: ['admin', 'receptionist'] }, status: 'active' })
      .select('name')
      .sort({ name: 1 })
      .lean(),
    getExpiringPurchases(),
  ]);
  const clinics = clinicsRaw.map(c => ({ id: String(c._id), name: c.name }));
  const users = staff.map(u => ({ id: String(u._id), name: u.name }));

  return (
    <div
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <div>
        <h1
          style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1C2233' }}
        >
          Stock
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6A7186' }}>
          Tudo o que entra na clínica entra no armazém central; os gabinetes e
          restantes locais recebem por requisição e o consumo apura-se na
          contagem quinzenal — nunca pela linha de tratamento.
        </p>
      </div>
      <StockNav active='/admin/stock/locais' />

      {expiring.length > 0 && (
        <div
          style={{
            background: '#FFF6E5',
            border: '1px solid #F5D9A6',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: '#7A4B00',
          }}
        >
          <strong>Validades (FEFO):</strong> {expiring.length} entrada
          {expiring.length === 1 ? '' : 's'} a expirar em ≤{' '}
          {STOCK_EXPIRY_ALERT_DAYS} dias —{' '}
          {expiring.slice(0, 4).map((e, i) => (
            <span key={`${e.productId}-${i}`}>
              {i > 0 ? '; ' : ''}
              {e.productName}
              {e.lot ? ` (lote ${e.lot})` : ''} {e.expired ? 'EXPIROU' : 'até'}{' '}
              {lisbonDate(e.expiryDate)} em {e.warehouseName}
            </span>
          ))}
          {expiring.length > 4 ? '; …' : ''}
        </div>
      )}

      <LocationCards
        cards={cards}
        clinics={clinics}
        users={users}
        isAdmin={isAdmin}
      />
    </div>
  );
}
