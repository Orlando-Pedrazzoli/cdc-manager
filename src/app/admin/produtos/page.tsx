// 📄 src/app/admin/produtos/page.tsx
// =============================================================================
// CDC Manager — Admin/Receção: Produtos e venda ao balcão (7.ª ronda/B2b)
// -----------------------------------------------------------------------------
// Victor (13/11/2026): "abaixo da área de tratamentos, adicionar 'produtos'".
// Três blocos:
//   1. Venda ao balcão — a receção regista o que vendeu (sem médico, fora das
//      comissões), com paciente opcional e meio de pagamento
//   2. Vendas dos últimos 30 dias — com o n.º do documento fiscal por anotar
//      e anulação (só a gestão)
//   3. Catálogo — produtos, PVP com IVA e taxa de IVA (só a gestão edita)
// As vendas NÃO emitem fatura: ficam "por faturar" até se anotar o documento.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import { clinicLabel } from '@/lib/branding';
import { getActiveClinics } from '@/models/Clinic';
import Patient from '@/models/Patient';
import ProductSale from '@/models/ProductSale';
import SaleProduct from '@/models/SaleProduct';
import User, { canOperateClinic } from '@/models/User';
import { CounterSaleForm } from '@/components/produtos/CounterSaleForm';
import { ProductCatalog } from '@/components/produtos/ProductCatalog';
import {
  SalesTable,
  type SaleRow,
} from '@/components/produtos/SalesTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Produtos' };

const stampFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Lisbon',
});

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '20px',
};
const h2: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '16px',
  fontWeight: 700,
  color: '#1C2233',
};
const lead: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '13px',
  color: '#6A7186',
};

export default async function ProdutosPage() {
  const session = await requireActiveSession(['admin', 'receptionist'] as const);
  if (!session?.user?.id) return null;
  const isAdmin = session.user.role === 'admin';

  await dbConnect();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [me, clinics, productDocs] = await Promise.all([
    User.findById(session.user.id).select('role clinicIds').lean(),
    getActiveClinics(),
    SaleProduct.find(isAdmin ? {} : { active: true })
      .sort({ active: -1, name: 1 })
      .lean(),
  ]);
  if (!me) return null;
  const myClinics = clinics.filter(c => canOperateClinic(me, String(c._id)));
  const clinicIds = myClinics.map(c => c._id);

  const saleDocs = await ProductSale.find({
    clinicId: { $in: clinicIds },
    soldAt: { $gte: since },
  })
    .sort({ soldAt: -1 })
    .limit(200)
    .lean();

  const patientIds = [
    ...new Set(saleDocs.map(s => String(s.patientId)).filter(v => v !== 'null')),
  ];
  const userIds = [
    ...new Set(
      saleDocs
        .flatMap(s => [s.soldByUserId, s.voidedByUserId])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [patients, users] = await Promise.all([
    patientIds.length
      ? Patient.find({ _id: { $in: patientIds } }).select('name').lean()
      : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('name').lean() : [],
  ]);
  const patientName = new Map(patients.map(p => [String(p._id), p.name]));
  const userName = new Map(users.map(u => [String(u._id), u.name]));
  const clinicName = new Map(clinics.map(c => [String(c._id), clinicLabel(c)]));

  const products = productDocs.map(p => ({
    id: String(p._id),
    name: p.name,
    priceCents: p.priceCents,
    vatRate: p.vatRate,
    active: !!p.active,
  }));
  const sales: SaleRow[] = saleDocs.map(s => ({
    id: String(s._id),
    whenLabel: stampFmt.format(s.soldAt as Date),
    clinic: clinicName.get(String(s.clinicId)) ?? '',
    patientId: s.patientId ? String(s.patientId) : null,
    patientName: s.patientId
      ? (patientName.get(String(s.patientId)) ?? '(paciente)')
      : null,
    items: s.lines.map(l => `${l.quantity}× ${l.name}`).join(', '),
    totalCents: s.totalCents,
    vatCents: s.vatCents,
    payment:
      PAYMENT_METHOD_LABEL[s.paymentMethod as PaymentMethod] ?? s.paymentMethod,
    soldBy: userName.get(String(s.soldByUserId)) ?? '—',
    note: (s.note as string | null) ?? null,
    fiscalDocument: (s.fiscalDocument as string | null) ?? null,
    voided: s.voidedAt
      ? {
          by: s.voidedByUserId
            ? (userName.get(String(s.voidedByUserId)) ?? '—')
            : '—',
          reason: (s.voidReason as string | null) ?? '',
        }
      : null,
  }));
  const live = saleDocs.filter(s => !s.voidedAt);
  const unbilled = live.filter(s => !s.fiscalDocument).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        maxWidth: 1180,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1C2233' }}>
          Produtos
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
          Venda ao balcão de produtos da clínica. Não passam pelos médicos e
          não contam para a faturação nem para as comissões deles.
        </p>
      </div>

      <div style={card}>
        <h2 style={h2}>Venda ao balcão</h2>
        <p style={lead}>
          Escolha os produtos e o meio de pagamento. O paciente é opcional.
        </p>
        {products.filter(p => p.active).length === 0 ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
            Ainda não há produtos à venda.{' '}
            {isAdmin
              ? 'Crie o primeiro no catálogo, mais abaixo.'
              : 'A gestão tem de os criar no catálogo.'}
          </p>
        ) : (
          <CounterSaleForm
            clinics={myClinics.map(c => ({
              id: String(c._id),
              label: clinicLabel(c),
            }))}
            products={products.filter(p => p.active)}
          />
        )}
      </div>

      <div style={card}>
        <h2 style={h2}>Vendas dos últimos 30 dias</h2>
        <p style={lead}>
          {live.length === 0
            ? 'Sem vendas registadas.'
            : `${live.length} venda${live.length === 1 ? '' : 's'}${unbilled > 0 ? ` · ${unbilled} por faturar` : ''}. A venda não emite fatura: anote aqui o n.º do documento quando o passar.`}
        </p>
        {sales.length > 0 && <SalesTable sales={sales} isAdmin={isAdmin} />}
      </div>

      <div style={card}>
        <h2 style={h2}>Catálogo de produtos</h2>
        <p style={lead}>
          O preço é o valor final pago pelo paciente, com IVA incluído.{' '}
          {isAdmin
            ? 'Só a gestão cria e altera produtos.'
            : 'Só a gestão pode alterar o catálogo.'}
        </p>
        <ProductCatalog products={products} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
