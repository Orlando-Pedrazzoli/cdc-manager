// 📄 src/app/confirmar/[token]/page.tsx
// =============================================================================
// CDC Manager — Página PÚBLICA de confirmação de presença (um clique)
// -----------------------------------------------------------------------------
// O paciente clica "Confirmar presença" no email (marcação ou lembrete 24h)
// e cai aqui SEM login: /confirmar/[token]. Fora dos prefixos protegidos do
// middleware (/admin, /doutor, /conta) — pública de propósito: a fricção
// mata a taxa de confirmação (o padrão da indústria é one-tap confirm).
//
// Regras:
//   · pending + futura  → confirma (confirmedAt/Via='email') e agradece
//   · já confirmed      → idempotente: "já estava confirmada" (reclicar o
//                         link do email nunca dá erro)
//   · cancelled/no-show → informa e pede contacto à clínica
//   · já passou         → informa que a consulta já decorreu
//   · token inválido    → mensagem neutra (sem revelar nada do sistema)
//
// A transição AQUI é deliberadamente restrita a pending→confirmed via
// updateOne condicional (filtro por status) — sem corrida com o balcão.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Clinic from '@/models/Clinic';
import TreatmentType from '@/models/TreatmentType';
import Doctor from '@/models/Doctor';

export const dynamic = 'force-dynamic';

type Outcome =
  | 'confirmed-now'
  | 'already-confirmed'
  | 'cancelled'
  | 'past'
  | 'invalid';

export default async function ConfirmarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let outcome: Outcome = 'invalid';
  let details: {
    patientFirstName: string;
    clinicName: string;
    clinicPhone: string | null;
    dateLabel: string;
    timeLabel: string;
    treatmentName: string;
    doctorName: string | null;
  } | null = null;

  // Token: base64url gerado com 24 bytes (32 chars) — validar formato antes
  // de tocar na BD (lookup barato + sem queries com lixo)
  if (/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    await dbConnect();
    const appt = await Appointment.findOne({ confirmToken: token }).select(
      'status startAt patientId clinicId treatmentTypeId doctorId',
    );

    if (appt) {
      const [patient, clinic, treatment, doctor] = await Promise.all([
        Patient.findById(appt.patientId).select('name'),
        Clinic.findById(appt.clinicId).select('name phone'),
        TreatmentType.findById(appt.treatmentTypeId).select('name'),
        appt.doctorId
          ? Doctor.findById(appt.doctorId).select('name')
          : Promise.resolve(null),
      ]);

      const parts = new Intl.DateTimeFormat('pt-PT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Lisbon',
      }).formatToParts(appt.startAt);
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
      const rawDate = `${get('weekday')}, ${get('day')} de ${get('month')}`;

      details = {
        patientFirstName: (patient?.name ?? '').split(' ')[0] || 'Paciente',
        clinicName: clinic?.name ?? 'a clínica',
        clinicPhone: clinic?.phone ?? null,
        dateLabel: rawDate.charAt(0).toUpperCase() + rawDate.slice(1),
        timeLabel: `${get('hour')}:${get('minute')}`,
        treatmentName: treatment?.name ?? '—',
        doctorName: doctor?.name ?? null,
      };

      if (appt.status === 'cancelled' || appt.status === 'no-show') {
        outcome = 'cancelled';
      } else if (appt.startAt.getTime() <= Date.now()) {
        outcome = 'past';
      } else if (appt.status === 'pending') {
        // Condicional no filtro: se a receção confirmar em simultâneo,
        // matchedCount=0 e caímos em "já confirmada" — nunca sobrescreve
        const res = await Appointment.updateOne(
          { _id: appt._id, status: 'pending' },
          {
            $set: {
              status: 'confirmed',
              confirmedAt: new Date(),
              confirmedVia: 'email',
            },
          },
        );
        outcome =
          res.modifiedCount === 1 ? 'confirmed-now' : 'already-confirmed';
      } else {
        // confirmed / checked-in / in-progress / completed
        outcome = 'already-confirmed';
      }
    }
  }

  const copy: Record<Outcome, { emoji: string; title: string; body: string }> =
    {
      'confirmed-now': {
        emoji: '✅',
        title: 'Presença confirmada!',
        body: 'Obrigado. A sua confirmação foi registada — até breve!',
      },
      'already-confirmed': {
        emoji: '✅',
        title: 'Consulta já confirmada',
        body: 'A sua presença já estava confirmada. Não precisa de fazer mais nada — até breve!',
      },
      cancelled: {
        emoji: 'ℹ️',
        title: 'Esta marcação foi cancelada',
        body: 'Se pretende remarcar, contacte a clínica.',
      },
      past: {
        emoji: 'ℹ️',
        title: 'Esta consulta já decorreu',
        body: 'Se pretende marcar nova consulta, contacte a clínica.',
      },
      invalid: {
        emoji: '⚠️',
        title: 'Link inválido',
        body: 'Este link de confirmação não é válido. Se recebeu este email da clínica, contacte-nos por telefone.',
      },
    };
  const c = copy[outcome];
  const showDetails =
    details && (outcome === 'confirmed-now' || outcome === 'already-confirmed');

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F4F6FB',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          backgroundColor: '#FFFFFF',
          border: '1px solid #D8DEEF',
          borderRadius: '16px',
          padding: '32px 28px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(27,42,107,0.08)',
        }}
      >
        <div style={{ fontSize: '44px', lineHeight: 1 }}>{c.emoji}</div>
        <h1
          style={{
            margin: '16px 0 8px',
            fontSize: '20px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {c.title}
        </h1>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: '14px',
            lineHeight: 1.7,
            color: '#3A3F4A',
          }}
        >
          {details && outcome === 'confirmed-now'
            ? `Olá ${details.patientFirstName}! ${c.body}`
            : c.body}
        </p>

        {showDetails && details && (
          <div
            style={{
              textAlign: 'left',
              backgroundColor: '#F4F6FB',
              borderRadius: '10px',
              padding: '14px 16px',
              fontSize: '14px',
              color: '#1B2A6B',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <span>
              <strong>{details.dateLabel}</strong> às{' '}
              <strong>{details.timeLabel}</strong>
            </span>
            <span>{details.treatmentName}</span>
            {details.doctorName && <span>Dr(a). {details.doctorName}</span>}
            <span style={{ color: '#6A7186' }}>{details.clinicName}</span>
          </div>
        )}

        {details?.clinicPhone &&
          (outcome === 'cancelled' ||
            outcome === 'past' ||
            outcome === 'invalid') && (
            <a
              href={`tel:${details.clinicPhone}`}
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '10px 22px',
                borderRadius: '8px',
                backgroundColor: '#2743A6',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Ligar à clínica
            </a>
          )}

        <p
          style={{
            margin: '20px 0 0',
            fontSize: '12px',
            color: '#6A7186',
          }}
        >
          Centro Dentário Colombo · CDC Manager
        </p>
      </div>
    </main>
  );
}
