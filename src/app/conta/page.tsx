// 📄 src/app/conta/page.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: página inicial (v2)
// -----------------------------------------------------------------------------
// Home do portal: hero com a PRÓXIMA CONSULTA (data por extenso, médico,
// clínica e telefone clicável), atalhos com contagens reais para as secções
// (Marcações / Documentos / Os meus dados) e contactos das clínicas.
// Set. 2026: o paciente pode CONFIRMAR PRESENÇA e ADICIONAR AO CALENDÁRIO
// (.ics) diretamente no hero — as duas ações que faz no telemóvel.
// Todas as queries filtram pelo patientId DA SESSÃO — regra nº 1 do portal.
// Sem dados clínicos sensíveis: notas, odontograma e planos ficam fora.
// =============================================================================

import { AppointmentActions } from '@/components/portal/AppointmentActions';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import ClinicalDocument from '@/models/Document';
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

  const [next, upcomingCount, docsCount, clinics] = await Promise.all([
    patientId
      ? Appointment.findOne({
          patientId,
          startAt: { $gte: new Date() },
          status: { $in: ['pending', 'confirmed'] },
        })
          .sort({ startAt: 1 })
          .select('startAt clinicId doctorId status')
          .lean()
      : null,
    patientId
      ? Appointment.countDocuments({
          patientId,
          startAt: { $gte: new Date() },
          status: { $in: ['pending', 'confirmed'] },
        })
      : 0,
    patientId
      ? ClinicalDocument.countDocuments({
          patientId,
          visibleToPatient: true,
          voidedAt: null,
        })
      : 0,
    getActiveClinics(),
  ]);

  const [nextClinic, nextDoctor] = await Promise.all([
    next ? clinics.find(c => String(c._id) === String(next.clinicId)) : null,
    next ? Doctor.findById(next.doctorId).select('name').lean() : null,
  ]);

  const shortcuts: Array<{ href: string; title: string; sub: string }> = [
    {
      href: '/conta/marcacoes',
      title: 'As minhas marcações',
      sub:
        upcomingCount > 0
          ? `${upcomingCount} consulta${upcomingCount === 1 ? '' : 's'} agendada${upcomingCount === 1 ? '' : 's'}`
          : 'Histórico e próximas consultas',
    },
    {
      href: '/conta/documentos',
      title: 'Os meus documentos',
      sub:
        docsCount > 0
          ? `${docsCount} documento${docsCount === 1 ? '' : 's'} disponíve${docsCount === 1 ? 'l' : 'is'}`
          : 'Consentimentos, radiografias e receitas',
    },
    {
      href: '/conta/dados',
      title: 'Os meus dados',
      sub: 'Dados pessoais e privacidade',
    },
  ];

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

      {/* Próxima consulta — hero */}
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
            <p
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 600,
                color: '#1C2233',
              }}
            >
              {lisbonLong(next.startAt)}
            </p>
            <p
              style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}
            >
              {nextDoctor?.name ? `${nextDoctor.name} · ` : ''}
              {nextClinic?.name ?? ''}
            </p>
            {next.status === 'pending' && (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '12px',
                  color: '#8A5A00',
                  backgroundColor: '#FFF9EE',
                  border: '1px solid #F2DEB6',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  display: 'inline-block',
                }}
              >
                Aguarda confirmação — confirme abaixo ou aguarde o contacto da
                clínica.
              </p>
            )}
            {/* Confirmar presença (se pendente) + adicionar ao calendário */}
            <AppointmentActions
              appointmentId={String(next._id)}
              status={next.status as string}
            />
            {nextClinic?.phone && (
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: '13px',
                  color: '#6A7186',
                }}
              >
                Precisa de remarcar ou cancelar?{' '}
                <a
                  href={`tel:${nextClinic.phone.replace(/\s/g, '')}`}
                  style={{ color: '#2743A6', fontWeight: 600 }}
                >
                  Ligue {nextClinic.phone}
                </a>
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
            Não tem consultas marcadas. Para marcar, contacte a clínica.
          </p>
        )}
      </div>

      {/* Atalhos para as secções */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {shortcuts.map(s => (
          <Link key={s.href} href={s.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                ...card,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1C2233',
                  }}
                >
                  {s.title}
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: '#6A7186',
                  }}
                >
                  {s.sub}
                </p>
              </div>
              <span
                aria-hidden='true'
                style={{ fontSize: '18px', color: '#C9D4FF' }}
              >
                ›
              </span>
            </div>
          </Link>
        ))}
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
                {c.address ?? ''}
                {c.address && c.phone ? ' · ' : ''}
                {c.phone ? (
                  <a
                    href={`tel:${c.phone.replace(/\s/g, '')}`}
                    style={{ color: '#2743A6', fontWeight: 600 }}
                  >
                    {c.phone}
                  </a>
                ) : null}
                {!c.address && !c.phone ? 'Contacte a receção.' : ''}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
