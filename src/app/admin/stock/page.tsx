// 📄 src/app/admin/stock/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Stock
// -----------------------------------------------------------------------------
// Vista única com o catálogo completo e saldos por clínica lado a lado
// (o dia a dia da receção é uma tabela, não navegação). Os saldos vêm do
// stockCache (materialização do ledger), mapeando armazém → clínica.
// v1: um armazém default por clínica, auto-provisionado nas actions.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Product from '@/models/Product';
import Warehouse from '@/models/Warehouse';
import { getActiveClinics } from '@/models/Clinic';
import {
  StockTable,
  type StockProductRow,
  type StockClinic,
} from '@/components/stock/StockTable';
import type { ProductUnit } from '@/lib/domain';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stock' };

export default async function StockPage() {
  const session = await auth();
  if (!session?.user) return null;

  await dbConnect();
  const [clinicsRaw, warehouses, products] = await Promise.all([
    getActiveClinics(),
    Warehouse.find({}).select('clinicId').lean(),
    Product.find({}).sort({ family: 1, name: 1 }).lean(),
  ]);

  const clinics: StockClinic[] = clinicsRaw.map(c => ({
    id: String(c._id),
    slug: c.slug,
    name: c.name,
  }));
  const clinicSlugById = new Map(clinics.map(c => [c.id, c.slug]));
  const warehouseClinicSlug = new Map(
    warehouses.map(w => [
      String(w._id),
      clinicSlugById.get(String(w.clinicId)),
    ]),
  );

  const rows: StockProductRow[] = products.map(p => {
    const balances: Record<string, number> = {};
    for (const c of clinics) balances[c.slug] = 0;
    let total = 0;
    for (const cache of p.stockCache) {
      const slug = warehouseClinicSlug.get(String(cache.warehouseId));
      total += cache.quantity;
      if (slug) balances[slug] = (balances[slug] ?? 0) + cache.quantity;
    }
    return {
      id: String(p._id),
      name: p.name,
      family: p.family ?? null,
      unit: p.unit as ProductUnit,
      supplierName: p.supplierName ?? null,
      supplierRef: p.supplierRef ?? null,
      minStock: p.minStock ?? 0,
      active: !!p.active,
      balances,
      total,
    };
  });

  // Taxonomia emergente: famílias em uso alimentam o datalist e o filtro
  const families = [
    ...new Set(products.map(p => p.family).filter((f): f is string => !!f)),
  ].sort((a, b) => a.localeCompare(b, 'pt'));

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#1C2233',
          }}
        >
          Stock
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Existências por clínica. Entradas, saídas e transferências ficam
          registadas no histórico de cada produto.
        </p>
      </div>

      <StockTable products={rows} clinics={clinics} families={families} />
    </div>
  );
}
