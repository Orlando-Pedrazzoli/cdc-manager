// 📄 src/app/doutor/pacientes/page.tsx
// =============================================================================
// CDC Manager — Médico: Os meus pacientes
// -----------------------------------------------------------------------------
// Server Component. A lista mostra os pacientes com quem o médico TEM OU
// TEVE consultas (deriva das Appointments com o seu doctorId).
//
// 9.ª ronda (ponto 07, Victor, 17 e 18/11): "pode tirar a trava para o médico
// pesquisar pacientes: os médicos trocam muitos pacientes". A PESQUISA
// (?q=, por nome ou n.º de processo) passa a procurar também nos outros
// pacientes da clínica; essas fichas abrem só para leitura e o acesso fica
// registado. Continua a NÃO haver lista geral: sem pesquisar, só aparecem
// os pacientes do médico. Contactos (telemóvel, e-mail) não são mostrados
// nem servem para pesquisar.
// =============================================================================

import Link from 'next/link';
import { Search } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import {
  DOCTOR_SEARCH_LIMIT,
  DOCTOR_SEARCH_MIN_CHARS,
  doctorPatientSearchOr,
} from '@/lib/patient-access';

export const dynamic = 'force-dynamic';

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
  // Só nome ou n.º de processo (lib/patient-access.ts)
  const or = search ? doctorPatientSearchOr(search) : [];
  if (or.length > 0) filter.$or = or;
  const searchTooShort = search.length > 0 && or.length === 0;

  const [patients, others] = await Promise.all([
    Patient.find(filter).select('name processNumber birthDate').lean(),
    // Outros pacientes da clínica: só com pesquisa, e poucos de cada vez
    or.length > 0
      ? Patient.find({
          status: 'active',
          _id: { $nin: grouped.map(g => g._id) },
          $or: or,
        })
          .sort({ name: 1 })
          .limit(DOCTOR_SEARCH_LIMIT + 1)
          .select('name processNumber birthDate')
          .lean()
      : Promise.resolve([]),
  ]);
  const moreOthers = others.length > DOCTOR_SEARCH_LIMIT;
  const otherPatients = others.slice(0, DOCTOR_SEARCH_LIMIT);
  const birth = (d: Date | null | undefined) =>
    d ? `Nasc. ${lisbonDate(d)}` : 'Sem data de nascimento';

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
              placeholder='Nome ou n.º de processo…'
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
            {searchTooShort
              ? `Escreva pelo menos ${DOCTOR_SEARCH_MIN_CHARS} letras do nome, ou o n.º de processo.`
              : search
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
                    {birth(p.birthDate)}
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

      {/* 9.ª ronda/07: outros pacientes da clínica — só com pesquisa */}
      {or.length > 0 && (
        <div>
          <h2
            style={{
              margin: '4px 0 2px',
              fontSize: '15px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Outros pacientes da clínica
          </h2>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6A7186' }}>
            Sem consultas consigo: a ficha abre só para leitura e o acesso fica
            registado.
          </p>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEF1F8',
              borderRadius: '14px',
              overflow: 'hidden',
            }}
          >
            {otherPatients.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '20px',
                  fontSize: '14px',
                  color: '#6A7186',
                }}
              >
                Nenhum outro paciente corresponde à pesquisa.
              </p>
            ) : (
              otherPatients.map(p => (
                <Link
                  key={String(p._id)}
                  href={`/doutor/pacientes/${String(p._id)}`}
                  style={{
                    display: 'block',
                    padding: '12px 20px',
                    borderBottom: '1px solid #F4F6FB',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    style={{ fontSize: '14px', fontWeight: 600, color: '#1B2A6B' }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{ marginLeft: 8, fontSize: '12px', color: '#6A7186' }}
                  >
                    Proc. {String(p.processNumber ?? '—')} · {birth(p.birthDate)}
                  </span>
                </Link>
              ))
            )}
            {moreOthers && (
              <p
                style={{
                  margin: 0,
                  padding: '10px 20px',
                  fontSize: '12px',
                  color: '#6A7186',
                }}
              >
                Há mais resultados: escreva mais do nome para afinar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
