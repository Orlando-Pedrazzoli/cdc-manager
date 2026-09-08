// 📄 src/app/conta/marcacoes/page.tsx
// =============================================================================
// CDC Manager — Portal do Paciente: as minhas marcações
// -----------------------------------------------------------------------------
// Duas secções: PRÓXIMAS (pending/confirmed futuras, ordem cronológica) e
// HISTÓRICO (passadas + canceladas, mais recente primeiro, limit 30).
// Linguagem virada ao paciente: estados traduzidos de forma neutra
// ('no-show' → "Não realizada" — nunca culpabilizar por escrito no portal).
// Sem self-service de cancelar/remarcar nesta fase (decisão do processo é
// do Victor): CTA de contacto telefónico da clínica da consulta.
// patientId SEMPRE da sessão.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'As minhas marcações' };

// Labels neutros para o paciente (≠ labels operacionais do staff)
const PATIENT_STATUS_LABEL: Record<
  string,
  { text: string; bg: string; fg: string }
> = {
  pending: { text: 'Aguarda confirmação', bg: '#FFF9EE', fg: '#8A5A00' },
  confirmed: { text: 'Confirmada', bg: '#EDF7EF', fg: '#1E6B34' },
  'checked-in': { text: 'Em curso', bg: '#F5F8FF', fg: '#1B2A6B' },
  'in-progress': { text: 'Em curso', bg: '#F5F8FF', fg: '#1B2A6B' },
  completed: { text: 'Realizada', bg: '#EDF7EF', fg: '#1E6B34' },
  cancelled: { text: 'Cancelada', bg: '#F2F3F7', fg: '#6A7186' },
  'no-show': { text: 'Não realizada', bg: '#F2F3F7', fg: '#6A7186' },
};

function lisbonLong(d: Date): string {
  const s = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
  padding: '14px 16px',
};

type Row = {
  id: string;
  when: string;
  doctor: string;
  clinic: string;
  phone: string | null;
  status: string;
};

function AppointmentRow({
  row,
  showContact,
}: {
  row: Row;
  showContact: boolean;
}) {
  const badge = PATIENT_STATUS_LABEL[row.status] ?? {
    text: row.status,
    bg: '#F2F3F7',
    fg: '#6A7186',
  };
  return (
    <div style={card}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: '#1C2233',
          }}
        >
          {row.when}
        </p>
        <span
          style={{
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: 700,
            color: badge.fg,
            backgroundColor: badge.bg,
            borderRadius: '999px',
            padding: '3px 10px',
          }}
        >
          {badge.text}
        </span>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
        {row.doctor ? `${row.doctor} · ` : ''}
        {row.clinic}
      </p>
      {showContact && row.phone && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6A7186' }}>
          Para remarcar ou cancelar,{' '}
          <a
            href={`tel:${row.phone.replace(/\s/g, '')}`}
            style={{ color: '#2743A6', fontWeight: 600 }}
          >
            ligue {row.phone}
          </a>
          .
        </p>
      )}
    </div>
  );
}

export default async function MyAppointmentsPage() {
  const session = await auth();
  const patientId = session?.user?.patientId;

  await dbConnect();

  const now = new Date();
  const [upcoming, history, clinics, doctors] = await Promise.all([
    patientId
      ? Appointment.find({
          patientId,
          startAt: { $gte: now },
          status: {
            $in: ['pending', 'confirmed', 'checked-in', 'in-progress'],
          },
        })
          .select('startAt status clinicId doctorId')
          .sort({ startAt: 1 })
          .limit(20)
          .lean()
      : [],
    patientId
      ? Appointment.find({
          patientId,
          $or: [
            { startAt: { $lt: now } },
            { status: { $in: ['cancelled', 'no-show', 'completed'] } },
          ],
        })
          .select('startAt status clinicId doctorId')
          .sort({ startAt: -1 })
          .limit(30)
          .lean()
      : [],
    getActiveClinics(),
    Doctor.find({}).select('name').lean(),
  ]);

  const clinicById = new Map(
    clinics.map(c => [String(c._id), { name: c.name, phone: c.phone ?? null }]),
  );
  const doctorById = new Map(doctors.map(d => [String(d._id), d.name]));

  const toRow = (a: (typeof upcoming)[number]): Row => ({
    id: String(a._id),
    when: lisbonLong(a.startAt),
    doctor: doctorById.get(String(a.doctorId)) ?? '',
    clinic: clinicById.get(String(a.clinicId))?.name ?? '',
    phone: clinicById.get(String(a.clinicId))?.phone ?? null,
    status: a.status,
  });

  // Futuras canceladas apareceriam nas duas queries — histórico remove-as
  const upcomingIds = new Set(upcoming.map(a => String(a._id)));
  const historyRows = history
    .filter(a => !upcomingIds.has(String(a._id)))
    .map(toRow);
  const upcomingRows = upcoming.map(toRow);

  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
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
          As minhas marcações
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          Consultas agendadas e histórico de visitas.
        </p>
      </div>

      <section>
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Próximas
        </h2>
        {upcomingRows.length === 0 ? (
          <div style={card}>
            <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
              Não tem consultas agendadas. Para marcar, contacte a clínica.
            </p>
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {upcomingRows.map(row => (
              <AppointmentRow key={row.id} row={row} showContact />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Histórico
        </h2>
        {historyRows.length === 0 ? (
          <div style={card}>
            <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
              Ainda sem visitas registadas.
            </p>
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {historyRows.map(row => (
              <AppointmentRow key={row.id} row={row} showContact={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
