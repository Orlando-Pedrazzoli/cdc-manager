// 📄 src/app/conta/page.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: página inicial (v1 mínima)
// -----------------------------------------------------------------------------
// O login de paciente aterra AQUI (auth.config PATIENT_PREFIX = '/conta').
// Versão mínima e honesta enquanto o portal completo não chega: mostra a
// PRÓXIMA CONSULTA do paciente e os contactos das clínicas. Sem links para
// secções que ainda não existem. O portal completo (marcações, documentos
// com visibleToPatient, faturas) é a fase seguinte — esta página cresce aí.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'A Minha Conta' };

function lisbonLong(d: Date): string {
  const s = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '18px 20px',
};

export default async function PatientHomePage() {
  const session = await auth();
  const patientId = session?.user?.patientId;
  const firstName = (session?.user?.name ?? '').split(' ')[0];

  await dbConnect();

  const [next, clinics] = await Promise.all([
    patientId
      ? Appointment.findOne({
          patientId,
          startAt: { $gte: new Date() },
          status: { $in: ['pending', 'confirmed'] },
        })
          .sort({ startAt: 1 })
          .select('startAt clinicId doctorId')
          .lean()
      : null,
    getActiveClinics(),
  ]);

  const [nextClinic, nextDoctor] = await Promise.all([
    next ? clinics.find(c => String(c._id) === String(next.clinicId)) : null,
    next ? Doctor.findById(next.doctorId).select('name').lean() : null,
  ]);

  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {firstName ? `Olá, ${firstName}` : 'A Minha Conta'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Bem-vindo ao portal do paciente.
        </p>
      </div>

      {/* Próxima consulta */}
      <div style={card}>
        <p
          style={{
            margin: '0 0 6px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          A sua próxima consulta
        </p>
        {next ? (
          <>
            <p style={{ margin: 0, fontSize: '15px', color: '#1C2233' }}>
              {lisbonLong(next.startAt)}
            </p>
            <p
              style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}
            >
              {nextDoctor?.name ? `${nextDoctor.name} · ` : ''}
              {nextClinic?.name ?? ''}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
            Não tem consultas marcadas. Para marcar, contacte a clínica.
          </p>
        )}
      </div>

      {/* Contactos das clínicas */}
      <div style={card}>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Contactos
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {clinics.map(c => (
            <div key={c.slug}>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1C2233',
                }}
              >
                {c.name}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '13px',
                  color: '#6A7186',
                }}
              >
                {[c.address, c.phone].filter(Boolean).join(' · ') ||
                  'Contacte a receção.'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Em breve: as suas marcações, documentos e faturas, aqui no portal.
      </p>
    </div>
  );
}
