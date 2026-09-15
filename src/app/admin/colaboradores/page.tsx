// 📄 src/app/admin/colaboradores/page.tsx
// CDC Manager — Admin: Colaboradores (Fase 6A, E16) — SÓ ADMIN
import Link from 'next/link';
import { UsersRound, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Employee, {
  EMPLOYEE_CONTRACT_LABEL,
  type EmployeeContractType,
} from '@/models/Employee';
import { formatCents } from '@/lib/commissions';
import { Badge } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Colaboradores' };

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ inativos?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return null;
  const sp = await searchParams;
  const showInactive = sp.inativos === '1';
  await dbConnect();
  const employees = await Employee.find(showInactive ? {} : { active: true })
    .sort({ active: -1, name: 1 })
    .collation({ locale: 'pt', strength: 2 })
    .lean();
  const ptDate = (d: Date | null | undefined) =>
    d
      ? new Intl.DateTimeFormat('pt-PT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(d)
      : '—';
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
  };
  const td: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#1B2A6B',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <UsersRound size={22} /> Colaboradores
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            Fichas de RH: remuneração, horário, regalias, aumentos, categorias e
            advertências. Área reservada à administração.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href={
              showInactive
                ? '/admin/colaboradores'
                : '/admin/colaboradores?inativos=1'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: '1px solid #D8DEEF',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: '#1B2A6B',
              textDecoration: 'none',
            }}
          >
            {showInactive ? 'Só ativos' : 'Incluir inativos'}
          </Link>
          <Link
            href='/admin/colaboradores/novo'
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              color: '#FFFFFF',
              backgroundColor: '#2743A6',
              textDecoration: 'none',
            }}
          >
            <Plus size={15} /> Novo colaborador
          </Link>
        </div>
      </div>
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Categoria</th>
              <th style={th}>Vínculo</th>
              <th style={th}>Admissão</th>
              <th style={{ ...th, textAlign: 'right' }}>Salário atual</th>
              <th style={th}>Registos</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td style={{ ...td, color: '#6A7186' }} colSpan={6}>
                  Sem colaboradores. Comece por «Novo colaborador».
                </td>
              </tr>
            )}
            {employees.map(e => (
              <tr key={String(e._id)} style={{ opacity: e.active ? 1 : 0.55 }}>
                <td style={td}>
                  <Link
                    href={`/admin/colaboradores/${String(e._id)}`}
                    style={{
                      color: '#1B2A6B',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    {e.name}
                  </Link>
                  {!e.active && (
                    <span style={{ marginLeft: 8 }}>
                      <Badge variant='danger'>Inativo</Badge>
                    </span>
                  )}
                </td>
                <td style={td}>{e.category}</td>
                <td style={td}>
                  {EMPLOYEE_CONTRACT_LABEL[
                    e.contractType as EmployeeContractType
                  ] ?? e.contractType}
                </td>
                <td style={td}>{ptDate(e.startDate)}</td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {e.currentSalaryCents != null
                    ? formatCents(e.currentSalaryCents)
                    : '—'}
                </td>
                <td style={{ ...td, fontSize: '12px', color: '#6A7186' }}>
                  {(e.raises ?? []).length} aumento(s) ·{' '}
                  {(e.categoryChanges ?? []).length} categoria(s) ·{' '}
                  {(e.warnings ?? []).length} advertência(s)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
