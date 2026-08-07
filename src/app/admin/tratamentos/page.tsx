// 📄 src/app/admin/tratamentos/page.tsx
// =============================================================================
// CDC Manager — Admin: Tratamentos (catálogo de atos)
// -----------------------------------------------------------------------------
// Promovido de Configurações→Catálogo a entidade de gestão própria: com a
// matriz real importada do Dentoral (749 atos + seed), o catálogo é trabalho
// vivo do Victor (durações, preços, flags Controla Dente/RX, confirmações),
// não configuração pontual. O link antigo /admin/configuracoes?tab=catalogo
// redireciona para aqui (memória muscular + bookmarks).
//
// RBAC: ADMIN-ONLY (preços e política de catálogo não são da receção) —
// mesmo guard educado de Configurações, mensagem em vez de redirect seco.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import TreatmentType from '@/models/TreatmentType';
import Product from '@/models/Product';
import {
  CatalogTable,
  type CatalogProduct,
  type CatalogTreatment,
} from '@/components/configuracoes/CatalogTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tratamentos' };

export default async function TratamentosPage() {
  const session = await auth();
  if (!session?.user) return null;

  if (session.user.role !== 'admin') {
    return (
      <div style={{ padding: '24px', maxWidth: 720 }}>
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '28px',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Tratamentos
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#6A7186' }}>
            O catálogo de atos (preços e políticas) está reservado à
            administração. Se precisar de uma alteração, fale com a gerência.
          </p>
        </div>
      </div>
    );
  }

  await dbConnect();

  const [docs, productDocs] = await Promise.all([
    TreatmentType.find({}).sort({ category: 1, specialty: 1, name: 1 }).lean(),
    // Produtos ativos para o editor de BOM (materiais consumidos)
    Product.find({ active: true }).select('name unit').sort({ name: 1 }).lean(),
  ]);
  const products: CatalogProduct[] = productDocs.map(p => ({
    id: String(p._id),
    name: p.name,
    unit: p.unit,
  }));
  const treatments: CatalogTreatment[] = docs.map(d => ({
    id: String(d._id),
    slug: d.slug,
    name: d.name,
    specialty: d.specialty as CatalogTreatment['specialty'],
    category: d.category ?? null,
    entityCode: d.entityCode ?? null,
    dentoralCode: d.dentoralCode ?? null,
    durationMin: d.durationMin,
    bufferMin: d.bufferMin,
    priceCents: d.priceCents,
    costCents: d.costCents ?? 0,
    bookableOnline: !!d.bookableOnline,
    requiresEvaluation: !!d.requiresEvaluation,
    controlsTooth: !!d.controlsTooth,
    requiresRxConsent: !!d.requiresRxConsent,
    recallIntervalMonths: d.recallIntervalMonths ?? null,
    notes: d.notes ?? null,
    bom: (d.bom ?? []).map((b: { productId: unknown; quantity: number }) => ({
      productId: String(b.productId),
      quantity: b.quantity,
    })),
    source:
      d.source === 'clinic-confirmed'
        ? 'clinic-confirmed'
        : d.source === 'imported'
          ? 'imported'
          : 'benchmark',
    active: !!d.active,
  }));

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
          Tratamentos
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Catálogo de atos das clínicas: preços, durações, categorias e regras
          clínicas (dente obrigatório, consentimento RX).
        </p>
      </div>

      <CatalogTable treatments={treatments} products={products} />
    </div>
  );
}
