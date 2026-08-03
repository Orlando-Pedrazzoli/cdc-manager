// 📄 src/app/admin/medicos/novo/page.tsx
// =============================================================================
// CDC Manager — Admin: Novo Médico
// Server Component: carrega as clínicas ativas para o editor de horários e
// entrega o DoctorForm em modo criação.
// =============================================================================

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import { getActiveClinics } from '@/models/Clinic';
import { DoctorForm } from '@/components/medicos/DoctorForm';

export const dynamic = 'force-dynamic';

export default async function NewDoctorPage() {
  await dbConnect();
  const clinics = (await getActiveClinics()).map(c => ({
    id: String(c._id),
    name: c.name,
  }));

  return (
    <div
      style={{
        maxWidth: 860,
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div>
        <Link
          href='/admin/medicos'
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#6A7186',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={15} />
          Corpo Clínico
        </Link>
        <h1
          style={{
            margin: '6px 0 0',
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Novo profissional
        </h1>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <DoctorForm mode='create' clinics={clinics} />
      </div>
    </div>
  );
}
