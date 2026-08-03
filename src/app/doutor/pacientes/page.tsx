// 📄 src/app/doutor/pacientes/page.tsx
// =============================================================================
// CDC Manager — Médico: Os meus pacientes
// -----------------------------------------------------------------------------
// Server Component. RBAC de dados: o médico vê APENAS pacientes com quem
// TEM OU TEVE consultas (deriva das Appointments com o seu doctorId) — a
// base global de 86k fichas não é navegável daqui; é a materialização do
// requisito "cada médico vê apenas os seus dados".
//
// Pesquisa por nome (todas as palavras, mesmo padrão da listagem admin)
// via URL param ?q= — server-only, partilhável.
// =============================================================================

import Link from 'next/link';
import { Search } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';

export const dynamic = 'force-dynamic';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lisbonDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

export default async function DoctorPatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId) return null;

  await dbConnect();

  // Pacientes do médico = distintos nas suas marcações, com a data da
  // última consulta (qualquer estado — a relação clínica existe)
  const grouped = await Appointment.aggregate<{
    _id: mongoose.Types.ObjectId;
    lastAt: Date;
    total: number;
  }>([
    { $match: { doctorId: new mongoose.Types.ObjectId(doctorId) } },
    {
      $group: {
        _id: '$patientId',
        lastAt: { $max: '$startAt' },
        total: { $sum: 1 },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: 500 },
  ]);

  const byPatient = new Map(grouped.map(g => [String(g._id), g]));
  const filter: Record<string, unknown> = {
    _id: { $in: grouped.map(g => g._id) },
  };
  const search = (q ?? '').trim();
  if (search) {
    // Todas as palavras têm de aparecer no nome (padrão do projeto)
    filter.$and = search
      .split(/\s+/)
      .map(w => ({ name: { $regex: escapeRegex(w), $options: 'i' } }));
  }

  const patients = await Patient.find(filter)
    .select('name processNumber phone')
    .lean();

  // Reordenar pela última consulta (o find não preserva a ordem do $in)
  patients.sort(
    (a, b) =>
      (byPatient.get(String(b._id))?.lastAt.getTime() ?? 0) -
      (byPatient.get(String(a._id))?.lastAt.getTime() ?? 0),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
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
            }}
          >
            Os meus pacientes
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {patients.length} paciente{patients.length === 1 ? '' : 's'} com
            consultas consigo
          </p>
        </div>

        {/* Pesquisa server-only por URL */}
        <form method='GET' style={{ display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9AA1B4',
              }}
            />
            <input
              name='q'
              defaultValue={search}
              placeholder='Pesquisar por nome…'
              style={{
                border: '1px solid #D8DEEF',
                borderRadius: '10px',
                padding: '9px 12px 9px 34px',
                fontSize: '14px',
                width: 260,
                color: '#1B2A6B',
              }}
            />
          </div>
          <button
            type='submit'
            style={{
              borderRadius: '10px',
              border: 'none',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: '#2743A6',
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            Pesquisar
          </button>
        </form>
      </div>

      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        {patients.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '28px 20px',
              fontSize: '14px',
              color: '#6A7186',
            }}
          >
            {search
              ? 'Nenhum paciente seu corresponde à pesquisa.'
              : 'Ainda não tem consultas com pacientes.'}
          </p>
        ) : (
          patients.map(p => {
            const g = byPatient.get(String(p._id));
            return (
              <Link
                key={String(p._id)}
                href={`/doutor/pacientes/${String(p._id)}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '13px 20px',
                  borderBottom: '1px solid #F4F6FB',
                  textDecoration: 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1B2A6B',
                    }}
                  >
                    {p.name}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6A7186',
                      }}
                    >
                      Proc. {String(p.processNumber ?? '—')}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '12px',
                      color: '#6A7186',
                    }}
                  >
                    {p.phone ?? 'Sem telefone'}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    color: '#6A7186',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {g?.total ?? 0} consulta{(g?.total ?? 0) === 1 ? '' : 's'} ·
                  última {g ? lisbonDate(g.lastAt) : '—'}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
