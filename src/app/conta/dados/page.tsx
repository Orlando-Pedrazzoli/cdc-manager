// 📄 src/app/conta/dados/page.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: os meus dados
// -----------------------------------------------------------------------------
// Dados pessoais em LEITURA (transparência RGPD: o titular vê o que a
// clínica guarda sobre si) + estado dos consentimentos com data. Edição
// direta fica de fora por decisão: a ficha é fonte de verdade
// clínico-administrativa — alterações passam pela receção (auditáveis).
// Sem NUNCA expor dados clínicos: anamnese, alertas e notas ficam fora.
// patientId SEMPRE da sessão.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { getActiveClinics } from '@/models/Clinic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Os meus dados' };

function lisbonDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '18px 20px',
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '11px', color: '#9AA1B4' }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: '14px', color: '#1C2233' }}>
        {value ?? '—'}
      </p>
    </div>
  );
}

function ConsentRow({ label, at }: { label: string; at: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
      }}
    >
      <p style={{ margin: 0, fontSize: '13px', color: '#1C2233' }}>{label}</p>
      <span
        style={{
          flexShrink: 0,
          fontSize: '11px',
          fontWeight: 700,
          borderRadius: '999px',
          padding: '3px 10px',
          color: at ? '#1E6B34' : '#6A7186',
          backgroundColor: at ? '#EDF7EF' : '#F2F3F7',
        }}
      >
        {at ? `Dado em ${at}` : 'Não dado'}
      </span>
    </div>
  );
}

export default async function MyDataPage() {
  const session = await auth();
  const patientId = session?.user?.patientId;

  await dbConnect();

  const [patient, clinics] = await Promise.all([
    patientId
      ? Patient.findById(patientId)
          .select(
            'processNumber name birthDate nif phone email address consents',
          )
          .lean()
      : null,
    getActiveClinics(),
  ]);

  if (!patient) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={card}>
          <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
            Não foi possível carregar os seus dados. Contacte a clínica.
          </p>
        </div>
      </div>
    );
  }

  const addressLine =
    [
      patient.address?.street,
      [patient.address?.postalCode, patient.address?.city]
        .filter(Boolean)
        .join(' '),
    ]
      .filter(Boolean)
      .join(', ') || null;

  const mainPhone = clinics.find(c => c.phone)?.phone ?? null;

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
          Os meus dados
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Informação que a clínica guarda sobre si.
        </p>
      </div>

      {/* Dados pessoais */}
      <div style={card}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Dados pessoais
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label='Nome' value={patient.name} />
          <Field label='Nº de processo' value={String(patient.processNumber)} />
          <Field
            label='Data de nascimento'
            value={lisbonDate(patient.birthDate)}
          />
          <Field label='NIF' value={patient.nif ?? null} />
          <Field label='Telefone' value={patient.phone ?? null} />
          <Field label='Email' value={patient.email ?? null} />
          <Field label='Morada' value={addressLine} />
        </div>
      </div>

      {/* Privacidade / RGPD */}
      <div style={card}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Privacidade e consentimentos
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ConsentRow
            label='Tratamento de dados pessoais'
            at={lisbonDate(patient.consents?.dataProcessingAt)}
          />
          <ConsentRow
            label='Lembretes de consulta'
            at={lisbonDate(patient.consents?.remindersAt)}
          />
          <ConsentRow
            label='Comunicações e campanhas'
            at={lisbonDate(patient.consents?.marketingAt)}
          />
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Para atualizar os seus dados ou alterar consentimentos, contacte a
        receção
        {mainPhone ? (
          <>
            {' '}
            (
            <a
              href={`tel:${mainPhone.replace(/\s/g, '')}`}
              style={{ color: '#2743A6', fontWeight: 600 }}
            >
              {mainPhone}
            </a>
            )
          </>
        ) : null}
        . Tem o direito de aceder, retificar e apagar os seus dados nos termos
        do RGPD.
      </p>
    </div>
  );
}
