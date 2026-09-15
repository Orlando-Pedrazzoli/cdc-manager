// 📄 src/app/admin/colaboradores/[id]/page.tsx
// CDC Manager — Admin: ficha de colaborador (Fase 6A, E16) — SÓ ADMIN
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Employee from '@/models/Employee';
import User from '@/models/User';
import { getActiveClinics } from '@/models/Clinic';
import { formatCents } from '@/lib/commissions';
import {
  EmployeeForm,
  type EmployeeInitial,
} from '@/components/colaboradores/EmployeeForm';
import {
  EmployeeHistories,
  type HistoryEntry,
} from '@/components/colaboradores/EmployeeHistory';

export const dynamic = 'force-dynamic';

const iso = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : '';
const ptDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
const eur = (c: number | null | undefined) =>
  c != null ? (c / 100).toFixed(2).replace('.', ',') : '';

export default async function ColaboradorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return null;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) notFound();
  await dbConnect();
  const [emp, clinics] = await Promise.all([
    Employee.findById(id).lean(),
    getActiveClinics(),
  ]);
  if (!emp) notFound();
  const userIds = Array.from(
    new Set(
      [
        ...(emp.raises ?? []),
        ...(emp.categoryChanges ?? []),
        ...(emp.warnings ?? []),
      ].map(x => String(x.byUserId)),
    ),
  );
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('name')
        .lean()
    : [];
  const nameOf = new Map(users.map(u => [String(u._id), u.name]));
  const entry = (
    x: { _id: unknown; at: Date; byUserId: unknown },
    note: string | null,
    value: string,
  ): HistoryEntry => ({
    id: String(x._id),
    at: ptDate(x.at),
    by: nameOf.get(String(x.byUserId)) ?? '—',
    note,
    value,
  });

  const initial: EmployeeInitial = {
    id,
    name: emp.name,
    category: emp.category,
    contractType: emp.contractType ?? 'sem-termo',
    startDate: iso(emp.startDate),
    endDate: iso(emp.endDate),
    nif: emp.nif ?? '',
    niss: emp.niss ?? '',
    phone: emp.phone ?? '',
    email: emp.email ?? '',
    clinicIds: (emp.clinicIds ?? []).map(String),
    initialSalaryEuros: eur(emp.initialSalaryCents),
    socialSecurityRate:
      emp.socialSecurityRate != null ? String(emp.socialSecurityRate) : '',
    irsRate: emp.irsRate != null ? String(emp.irsRate) : '',
    schedule: emp.schedule ?? '',
    benefits: emp.benefits ?? '',
    notes: emp.notes ?? '',
  };
  const kpi = (l: string, v: string) => (
    <div
      style={{
        flex: '1 1 160px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: 12,
        padding: '10px 14px',
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: '#6A7186' }}>{l}</p>
      <p
        style={{
          margin: '2px 0 0',
          fontSize: 17,
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        {v}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link
          href='/admin/colaboradores'
          style={{ fontSize: '13px', color: '#6A7186', textDecoration: 'none' }}
        >
          ← Colaboradores
        </Link>
        <h1
          style={{
            margin: '6px 0 0',
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {emp.name}
          {!emp.active && (
            <span style={{ marginLeft: 10, fontSize: 13, color: '#B3261E' }}>
              (inativo)
            </span>
          )}
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 14, color: '#6A7186' }}>
          {emp.category}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi(
          'Salário atual',
          emp.currentSalaryCents != null
            ? formatCents(emp.currentSalaryCents)
            : '—',
        )}
        {kpi(
          'Salário inicial',
          emp.initialSalaryCents != null
            ? formatCents(emp.initialSalaryCents)
            : '—',
        )}
        {kpi(
          'Seg. Social',
          emp.socialSecurityRate != null ? `${emp.socialSecurityRate}%` : '—',
        )}
        {kpi('IRS', emp.irsRate != null ? `${emp.irsRate}%` : '—')}
        {kpi('Admissão', emp.startDate ? ptDate(emp.startDate) : '—')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <EmployeeForm
          initial={initial}
          clinics={clinics.map(c => ({ id: String(c._id), name: c.name }))}
        />
        <EmployeeHistories
          employeeId={id}
          active={!!emp.active}
          raises={[...(emp.raises ?? [])]
            .reverse()
            .map(x => entry(x, x.note ?? null, formatCents(x.newSalaryCents)))}
          categories={[...(emp.categoryChanges ?? [])]
            .reverse()
            .map(x => entry(x, x.note ?? null, x.category))}
          warnings={[...(emp.warnings ?? [])]
            .reverse()
            .map(x => entry(x, x.text, 'Advertência'))}
        />
      </div>
    </div>
  );
}
