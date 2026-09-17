// 📄 src/app/admin/configuracoes/page.tsx
// =============================================================================
// CDC Manager — Admin: Configurações
// -----------------------------------------------------------------------------
// Server Component com separadores por ?tab= (convenção do projeto):
//   · clinicas — dados/políticas + horários por clínica (ClinicSettingsForm),
//     com sub-seletor ?clinic= (mesmo param da agenda/cobrança)
//   · conta — segurança da conta do próprio (mudança de password); padrão
//     preparado para crescer (gestão de utilizadores, sessões, etc.)
// O catálogo de atos foi PROMOVIDO a /admin/tratamentos (entidade de gestão
// própria após a importação da matriz real) — ?tab=catalogo redireciona.
//
// RBAC: o proxy deixa entrar admin+receção em /admin, mas Configurações é
// ADMIN-ONLY (preços, comissões e horários não são da receção) — guard
// próprio nesta página com mensagem educada em vez de redirect seco.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Clinic from '@/models/Clinic';
import {
  ClinicSettingsForm,
  type ClinicSettings,
} from '@/components/configuracoes/ClinicSettingsForm';
import { ChangePasswordForm } from '@/components/configuracoes/ChangePasswordForm';
import {
  UsersPanel,
  type TeamUser,
} from '@/components/configuracoes/UsersPanel';
import { MoloniPanel } from '@/components/configuracoes/MoloniPanel';
import { OrganizationForm } from '@/components/configuracoes/OrganizationForm';
import { getOrganization } from '@/models/Organization';
import { isMoloniConfigured, isMoloniEmissionReady } from '@/lib/moloni';
import User from '@/models/User';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configurações' };

const TABS = [
  { key: 'organizacao', label: 'Organização' },
  { key: 'clinicas', label: 'Clínicas & horários' },
  { key: 'utilizadores', label: 'Utilizadores' },
  { key: 'integracoes', label: 'Integrações' }, // Fase 7A — Moloni
  { key: 'conta', label: 'A minha conta' },
] as const;

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; clinic?: string }>;
}) {
  const { tab, clinic: clinicParam } = await searchParams;

  // Memória muscular/bookmarks: o catálogo viveu aqui até ago/2026
  if (tab === 'catalogo') redirect('/admin/tratamentos');

  const activeTab: (typeof TABS)[number]['key'] = TABS.some(t => t.key === tab)
    ? (tab as (typeof TABS)[number]['key'])
    : 'clinicas';

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
  let clinicPanels: ClinicSettings[] = [];
  let activeClinicSlug = '';
  let teamUsers: TeamUser[] = [];

  if (activeTab === 'utilizadores') {
    // Só contas da equipa (admin/receção); médicos e pacientes têm fluxos
    // próprios. Ordem: ativas primeiro, depois convidadas, depois desativadas.
    const docs = await User.find({
      role: { $in: ['admin', 'receptionist'] },
    })
      .select('name email role status createdAt')
      .sort({ status: 1, name: 1 })
      .lean();
    const dateFmt = new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Lisbon',
    });
    teamUsers = docs.map(u => ({
      id: String(u._id),
      name: u.name,
      email: u.email ?? '',
      role: u.role as TeamUser['role'],
      status: u.status as TeamUser['status'],
      createdAt: dateFmt.format(u.createdAt as Date),
    }));
  } else if (activeTab === 'clinicas') {
    // Todas as clínicas (incl. inativas — settings é o sítio para as ver)
    const docs = await Clinic.find({}).sort({ slug: 1 }).lean();
    clinicPanels = docs.map(d => ({
      id: String(d._id),
      slug: d.slug,
      name: d.name,
      legalName: d.legalName ?? null,
      shortName: d.shortName ?? null,
      color: d.color ?? null,
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
          Identidade da organização, clínicas e horários, utilizadores e
          integrações.
        </p>
      </div>

      {/* Separadores ?tab= — scroll horizontal no telemóvel */}
      <div
        className='cdc-tabs'
        style={{
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
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === 'organizacao' ? (
        <OrganizationForm brand={await getOrganization()} />
      ) : activeTab === 'utilizadores' ? (
        <UsersPanel users={teamUsers} currentUserId={session.user.id ?? ''} />
      ) : activeTab === 'conta' ? (
        <ChangePasswordForm email={session.user.email ?? ''} />
      ) : activeTab === 'integracoes' ? (
        <MoloniPanel
          configured={isMoloniConfigured()}
          ready={isMoloniEmissionReady()}
          present={Object.fromEntries(
            [
              'MOLONI_CLIENT_ID',
              'MOLONI_CLIENT_SECRET',
              'MOLONI_USERNAME',
              'MOLONI_PASSWORD',
              'MOLONI_COMPANY_ID',
              'MOLONI_DOCUMENT_SET_ID',
              'MOLONI_CREDIT_SET_ID',
              'MOLONI_CATEGORY_ID',
              'MOLONI_UNIT_ID',
              'MOLONI_PAYMENT_METHODS',
              'MOLONI_EXEMPTION_REASON',
            ].map(k => [k, !!process.env[k]]),
          )}
        />
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
