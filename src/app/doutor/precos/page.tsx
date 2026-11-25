// 📄 src/app/doutor/precos/page.tsx
// =============================================================================
// CDC Manager — Médico: Tabela de preços (9.ª ronda, ponto 06)
// "Uma área com a tabela de preços, para todos poderem pesquisar o preço dos
// tratamentos" (Victor, 17 e 18/11). Só leitura e só o que interessa ao
// balcão: ato, categoria, código e PVP. Custos e comissões não vêm para aqui.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { requireActiveSession } from '@/lib/require-active-session';
import TreatmentType from '@/models/TreatmentType';
import { PriceTable } from '@/components/clinico/PriceTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tabela de preços' };

export default async function DoutorPrecosPage() {
  const session = await requireActiveSession(['doctor'] as const);
  if (!session?.user?.id) return null;
  await dbConnect();
  const treatments = await TreatmentType.find({ active: true })
    .select('name category dentoralCode priceCents')
    .sort({ category: 1, name: 1 })
    .lean();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
          Tabela de preços
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Preços de tabela dos tratamentos. Pesquise pelo nome, pela categoria
          ou pelo código.
        </p>
      </div>
      <PriceTable
        rows={treatments.map(t => ({
          id: String(t._id),
          name: t.name,
          category: (t.category as string | null) ?? null,
          code: (t.dentoralCode as string | null) ?? null,
          priceCents: t.priceCents ?? 0,
        }))}
      />
    </div>
  );
}
