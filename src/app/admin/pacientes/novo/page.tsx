// 📄 src/app/admin/pacientes/novo/page.tsx
// =============================================================================
// CDC Manager — Admin: Novo Paciente
// -----------------------------------------------------------------------------
// Server Component: carrega os médicos ativos (para o select "médico
// habitual") e entrega o PatientForm em modo criação. O nº de processo é
// atribuído pela action no submit — nunca reservado à vista, para não criar
// buracos na sequência quando um formulário é abandonado.
// =============================================================================

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { PatientForm } from '@/components/pacientes/PatientForm';

export const dynamic = 'force-dynamic';

export default async function NewPatientPage() {
  await dbConnect();
  const doctors = await Doctor.find({ active: true })
    .sort({ name: 1 })
    .select('name')
    .lean();

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
          href='/admin/pacientes'
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
          Pacientes
        </Link>
        <h1
          style={{
            margin: '6px 0 0',
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Novo paciente
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
          O número de processo é atribuído automaticamente ao guardar.
        </p>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <PatientForm
          mode='create'
          doctors={doctors.map(d => ({
            id: String(d._id),
            name: d.name,
          }))}
        />
      </div>
    </div>
  );
}
