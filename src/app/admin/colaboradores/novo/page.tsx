// 📄 src/app/admin/colaboradores/novo/page.tsx
// CDC Manager — Admin: novo colaborador (Fase 6A) — SÓ ADMIN
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getActiveClinics } from '@/models/Clinic';
import { EmployeeForm } from '@/components/colaboradores/EmployeeForm';

export const metadata = { title: 'Novo colaborador' };

export default async function NovoColaboradorPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return null;
  const clinics = await getActiveClinics();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          Novo colaborador
        </h1>
      </div>
      <EmployeeForm
        clinics={clinics.map(c => ({ id: String(c._id), name: c.name }))}
      />
    </div>
  );
}
