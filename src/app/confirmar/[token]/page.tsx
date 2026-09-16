// 📄 src/app/confirmar/[token]/page.tsx
// =============================================================================
// CDC Manager — Página PÚBLICA de confirmação de presença (um clique)
// -----------------------------------------------------------------------------
// O paciente clica "Confirmar presença" no email (marcação ou lembrete 24h)
// e cai aqui SEM login: /confirmar/[token]. Fora dos prefixos protegidos do
// middleware (/admin, /doutor, /conta) — pública de propósito: a fricção
// mata a taxa de confirmação.
//
// ESTA PÁGINA SÓ LÊ. A escrita está em actions/confirm.ts (POST do botão):
// scanners de links de email (Outlook Safe Links, Gmail) abrem o GET e
// confirmavam consultas sozinhos. Continua a ser um clique para o paciente —
// o botão do email traz à página, o botão da página confirma.
//
// Estados:
//   · pending + futura  → mostra a consulta + botão "Confirmar presença"
//   · ?c=1 e confirmed  → "Presença confirmada!" (acabou de clicar)
//   · já confirmed      → "já estava confirmada" (reabrir o link nunca dá erro)
//   · cancelled/no-show → informa e pede contacto à clínica
//   · já passou         → informa que a consulta já decorreu
//   · token inválido    → mensagem neutra (sem revelar nada do sistema)
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Clinic from '@/models/Clinic';
import TreatmentType from '@/models/TreatmentType';
import Doctor from '@/models/Doctor';
import { confirmAttendanceByTokenAction } from '@/actions/confirm';

export const dynamic = 'force-dynamic';

type Outcome =
  | 'pending'
  | 'confirmed-now'
  | 'already-confirmed'
  | 'cancelled'
  | 'past'
  | 'invalid';

export default async function ConfirmarPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token } = await params;
  const { c: confirmedFlag } = await searchParams;
  const justConfirmed = confirmedFlag === '1';
  // Instante único do pedido (Server Component: Date.now() no corpo do render
  // é sinalizado pelo lint do React Compiler como impuro; aqui é deliberado)
  const now = new Date();

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
      } else if (appt.startAt.getTime() <= now.getTime()) {
        outcome = 'past';
      } else if (appt.status === 'pending') {
        outcome = 'pending'; // a escrita só acontece no POST do botão
      } else if (appt.status === 'confirmed' && justConfirmed) {
        outcome = 'confirmed-now';
      } else {
        // confirmed / checked-in / in-progress / completed
        outcome = 'already-confirmed';
      }
    }
  }

  const copy: Record<Outcome, { emoji: string; title: string; body: string }> =
    {
      pending: {
        emoji: '📅',
        title: 'Confirme a sua presença',
        body: 'Carregue no botão para confirmar que vai à consulta.',
      },
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
    details &&
    (outcome === 'pending' ||
      outcome === 'confirmed-now' ||
      outcome === 'already-confirmed');

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

        {outcome === 'pending' && (
          <form action={confirmAttendanceByTokenAction}>
            <input type='hidden' name='token' value={token} />
            <button
              type='submit'
              style={{
                display: 'inline-block',
                marginTop: 18,
                padding: '12px 28px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2743A6',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Confirmar presença
            </button>
          </form>
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
