// 📄 src/app/admin/configuracoes/page.tsx
// =============================================================================
// CDC Manager — Admin: Configurações
// -----------------------------------------------------------------------------
// Server Component com separadores por ?tab= (convenção do projeto):
//   · catalogo — catálogo de atos (CatalogTable): o Victor carrega a matriz
//     real de preços aqui, sem deploys
//   · clinicas — dados/políticas + horários por clínica (ClinicSettingsForm),
//     com sub-seletor ?clinic= (mesmo param da agenda/cobrança)
//
// RBAC: o proxy deixa entrar admin+receção em /admin, mas Configurações é
// ADMIN-ONLY (preços, comissões e horários não são da receção) — guard
// próprio nesta página com mensagem educada em vez de redirect seco.
// =============================================================================

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import TreatmentType from '@/models/TreatmentType';
import Clinic from '@/models/Clinic';
import {
  CatalogTable,
  type CatalogTreatment,
} from '@/components/configuracoes/CatalogTable';
import {
  ClinicSettingsForm,
  type ClinicSettings,
} from '@/components/configuracoes/ClinicSettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configurações' };

const TABS = [
  { key: 'catalogo', label: 'Catálogo de atos' },
  { key: 'clinicas', label: 'Clínicas & horários' },
] as const;

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; clinic?: string }>;
}) {
  const { tab, clinic: clinicParam } = await searchParams;
  const activeTab = tab === 'clinicas' ? 'clinicas' : 'catalogo';

  const session = await auth();
  if (!session?.user) return null;

  // Admin-only: a receção vê uma mensagem, não um erro
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
            Configurações
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#6A7186' }}>
            Esta área (preços, comissões e horários das clínicas) está reservada
            à administração. Se precisar de uma alteração, fale com a gerência.
          </p>
        </div>
      </div>
    );
  }

  await dbConnect();

  // ---------------------------------------------------------------------------
  // Dados por separador (fetch só do que o separador ativo precisa)
  // ---------------------------------------------------------------------------
  let treatments: CatalogTreatment[] = [];
  let clinicPanels: ClinicSettings[] = [];
  let activeClinicSlug = '';

  if (activeTab === 'catalogo') {
    const docs = await TreatmentType.find({})
      .sort({ specialty: 1, name: 1 })
      .lean();
    treatments = docs.map(d => ({
      id: String(d._id),
      slug: d.slug,
      name: d.name,
      specialty: d.specialty as CatalogTreatment['specialty'],
      durationMin: d.durationMin,
      bufferMin: d.bufferMin,
      priceCents: d.priceCents,
      bookableOnline: !!d.bookableOnline,
      requiresEvaluation: !!d.requiresEvaluation,
      recallIntervalMonths: d.recallIntervalMonths ?? null,
      notes: d.notes ?? null,
      source:
        d.source === 'clinic-confirmed' ? 'clinic-confirmed' : 'benchmark',
      active: !!d.active,
    }));
  } else {
    // Todas as clínicas (incl. inativas — settings é o sítio para as ver)
    const docs = await Clinic.find({}).sort({ slug: 1 }).lean();
    clinicPanels = docs.map(d => ({
      id: String(d._id),
      slug: d.slug,
      name: d.name,
      legalName: d.legalName ?? null,
      nipc: d.nipc ?? null,
      address: d.address ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      maxConcurrentAppointments: d.maxConcurrentAppointments,
      onlineMinNoticeHours: d.onlineMinNoticeHours,
      onlineMaxAdvanceDays: d.onlineMaxAdvanceDays,
      cancellationMinNoticeHours: d.cancellationMinNoticeHours,
      bookableOnline: !!d.bookableOnline,
      defaultDoctorCommission: d.defaultDoctorCommission,
      openingHours: (d.openingHours ?? []).map(
        (day: {
          weekday: number;
          ranges: { start: string; end: string }[];
        }) => ({
          weekday: day.weekday,
          ranges: (day.ranges ?? []).map(r => ({ start: r.start, end: r.end })),
        }),
      ),
    }));
    activeClinicSlug =
      clinicPanels.find(c => c.slug === clinicParam)?.slug ??
      clinicPanels.find(c => c.slug === 'colombo')?.slug ??
      clinicPanels[0]?.slug ??
      '';
  }

  const activeClinic = clinicPanels.find(c => c.slug === activeClinicSlug);

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
          Configurações
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Catálogo de atos, dados das clínicas e horários de funcionamento.
        </p>
      </div>

      {/* Separadores ?tab= */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '1px solid #E4E8F2',
        }}
      >
        {TABS.map(t => {
          const active = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={`/admin/configuracoes?tab=${t.key}`}
              style={{
                padding: '9px 16px',
                fontSize: '14px',
                fontWeight: active ? 700 : 500,
                color: active ? '#1B2A6B' : '#6A7186',
                textDecoration: 'none',
                borderBottom: active
                  ? '2px solid #2743A6'
                  : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === 'catalogo' ? (
        <CatalogTable treatments={treatments} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sub-seletor de clínica (?clinic=, mesmo param da agenda) */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {clinicPanels.map(c => {
              const active = c.slug === activeClinicSlug;
              return (
                <Link
                  key={c.slug}
                  href={`/admin/configuracoes?tab=clinicas&clinic=${c.slug}`}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '999px',
                    fontSize: '13px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    backgroundColor: active ? '#2743A6' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#454C63',
                    border: active ? '1px solid #2743A6' : '1px solid #E4E8F2',
                  }}
                >
                  {c.name}
                </Link>
              );
            })}
          </div>

          {activeClinic ? (
            // key remonta os forms (e o estado local dos horários) ao trocar
            <ClinicSettingsForm key={activeClinic.id} clinic={activeClinic} />
          ) : (
            <p style={{ fontSize: '14px', color: '#6A7186' }}>
              Sem clínicas registadas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
