// 📄 src/app/doutor/consulta/[id]/page.tsx
// =============================================================================
// CDC Manager — Médico: Fluxo da consulta
// -----------------------------------------------------------------------------
// Server Component. O ecrã onde o médico VIVE durante o atendimento:
//
//   pending/confirmed/checked-in → cabeçalho do paciente + "Iniciar consulta"
//   in-progress                  → registar atos + notas + "Concluir"
//   completed                    → resumo read-only
//   cancelled/no-show            → aviso
//
// RBAC de DADOS: a marcação TEM de pertencer ao doctorId da sessão — caso
// contrário devolve "não encontrada" (sem revelar que existe; não vazamos
// agenda de colegas). Alergias e medicação do ClinicalRecord em BANNER
// vermelho permanente — o requisito de segurança clínica nº 1.
// =============================================================================

import Link from 'next/link';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import Procedure from '@/models/Procedure';
import ClinicalRecord from '@/models/ClinicalRecord';
import { getClinicById } from '@/models/Clinic';
import { minToHhmm } from '@/lib/availability';
import {
  ProcedureList,
  ClinicalNotes,
  type ProcedureItem,
  type TreatmentOption,
  type NoteItem,
} from '@/components/clinico/ProcedureList';
import {
  StartConsultationButton,
  CloseConsultationModal,
} from '@/components/clinico/CloseConsultationModal';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  'checked-in': 'Paciente em espera',
  'in-progress': 'Em curso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  'no-show': 'Falta',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#FFF4DE', fg: '#8A5A00' },
  confirmed: { bg: '#E4EBFF', fg: '#2743A6' },
  'checked-in': { bg: '#E0F5EA', fg: '#0F7B4D' },
  'in-progress': { bg: '#1B2A6B', fg: '#FFFFFF' },
  completed: { bg: '#EAECF3', fg: '#3D4257' },
  cancelled: { bg: '#F6E4E3', fg: '#B3261E' },
  'no-show': { bg: '#F6E4E3', fg: '#B3261E' },
};

/** Instante UTC → "HH:mm" na parede de Lisboa */
function lisbonHhmm(d: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return minToHhmm((Number(p.hour) % 24) * 60 + Number(p.minute));
}

function ageFromBirthDate(birthDate: Date | null | undefined): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

function NotFound() {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        padding: '28px',
        fontSize: '14px',
        color: '#6A7186',
      }}
    >
      Consulta não encontrada.{' '}
      <Link
        href='/doutor/dashboard'
        style={{ color: '#2743A6', fontWeight: 600 }}
      >
        Voltar ao dashboard
      </Link>
    </div>
  );
}

export default async function ConsultationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId || !/^[0-9a-fA-F]{24}$/.test(id)) return <NotFound />;

  await dbConnect();

  const appt = await Appointment.findById(id).lean();
  // Não pertence ao médico → mesma resposta que inexistente (não vazar)
  if (!appt || String(appt.doctorId) !== doctorId) return <NotFound />;

  const [patient, clinic, treatments, procedures, record] = await Promise.all([
    Patient.findById(appt.patientId)
      .select('name processNumber phone birthDate')
      .lean(),
    getClinicById(String(appt.clinicId)),
    TreatmentType.find({ active: true })
      .select('name priceCents controlsTooth')
      .sort({ name: 1 })
      .lean(),
    Procedure.find({ appointmentId: appt._id }).sort({ createdAt: 1 }).lean(),
    ClinicalRecord.findOne({ patientId: appt.patientId })
      .select('allergies currentMedications notes')
      .lean(),
  ]);

  const status = appt.status as AppointmentStatus;
  const st = STATUS_STYLE[status] ?? { bg: '#EAECF3', fg: '#3D4257' };
  const treatmentName =
    treatments.find(t => String(t._id) === String(appt.treatmentTypeId))
      ?.name ?? '—';
  const age = ageFromBirthDate(patient?.birthDate ?? null);

  const procedureItems: ProcedureItem[] = procedures.map(p => ({
    id: String(p._id),
    name: p.nameSnapshot,
    priceCents: p.priceCents,
    toothNumbers: (p.toothNumbers ?? []) as string[],
    notes: (p.notes as string | null) ?? null,
    status: p.status as ProcedureItem['status'],
    voidReason: (p.voidReason as string | null) ?? null,
  }));
  const activeProcedures = procedureItems.filter(p => p.status !== 'void');
  const totalCents = activeProcedures.reduce((s, p) => s + p.priceCents, 0);

  const treatmentOptions: TreatmentOption[] = treatments.map(t => ({
    id: String(t._id),
    name: t.name,
    priceCents: t.priceCents,
    controlsTooth: !!t.controlsTooth,
  }));

  // Notas clínicas DESTA consulta (a ficha completa é o passo seguinte do sprint)
  const noteItems: NoteItem[] = (record?.notes ?? [])
    .filter(
      n => n.appointmentId && String(n.appointmentId) === String(appt._id),
    )
    .map(n => ({
      id: String(n._id),
      text: n.text,
      createdAt: n.createdAt ? lisbonHhmm(n.createdAt) : '—',
    }));

  const allergies = record?.allergies ?? [];
  const medications = record?.currentMedications ?? [];
  const canEdit = status === 'in-progress';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Voltar */}
      <Link
        href='/doutor/dashboard'
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
        <ArrowLeft size={15} />O meu dia
      </Link>

      {/* Cabeçalho do paciente + estado + ação principal */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
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
            <Link
              href={`/doutor/pacientes/${String(appt.patientId)}`}
              title='Abrir ficha clínica'
              style={{ color: '#1B2A6B', textDecoration: 'none' }}
            >
              {patient?.name ?? '(paciente removido)'}
            </Link>
            {patient?.processNumber != null && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6A7186',
                }}
              >
                Proc. {String(patient.processNumber)}
              </span>
            )}
            {age != null && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6A7186',
                }}
              >
                · {age} anos
              </span>
            )}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#3D4257' }}>
            {lisbonHhmm(appt.startAt)}–{lisbonHhmm(appt.endAt)} ·{' '}
            {treatmentName} · {clinic?.name ?? '—'}
            {appt.note ? ` · ${appt.note}` : ''}
          </p>
          {/* Atalhos clínicos — o que o médico abre a meio do atendimento */}
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              gap: '14px',
              flexWrap: 'wrap',
            }}
          >
            {(
              [
                ['', 'Anamnese'],
                ['/odontograma', 'Odontograma'],
                ['/plano', 'Plano'],
                ['?tab=documentos', 'Documentos'],
              ] as const
            ).map(([suffix, label]) => (
              <Link
                key={label}
                href={`/doutor/pacientes/${String(appt.patientId)}${suffix}`}
                style={{ color: '#2743A6', textDecoration: 'none' }}
              >
                {label} →
              </Link>
            ))}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: st.bg,
              color: st.fg,
              whiteSpace: 'nowrap',
            }}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
          {(status === 'pending' ||
            status === 'confirmed' ||
            status === 'checked-in') && (
            <StartConsultationButton appointmentId={id} />
          )}
          {status === 'in-progress' && (
            <CloseConsultationModal
              appointmentId={id}
              actsCount={activeProcedures.length}
              totalCents={totalCents}
            />
          )}
        </div>
      </div>

      {/* BANNER de segurança clínica — alergias e medicação SEMPRE visíveis */}
      {(allergies.length > 0 || medications.length > 0) && (
        <div
          style={{
            backgroundColor: '#F6E4E3',
            border: '1px solid #E5B9B5',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <TriangleAlert
            size={18}
            style={{ color: '#B3261E', flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ fontSize: '13px', color: '#7A1A14' }}>
            {allergies.length > 0 && (
              <p style={{ margin: 0, fontWeight: 700 }}>
                ALERGIAS: {allergies.join(' · ')}
              </p>
            )}
            {medications.length > 0 && (
              <p style={{ margin: allergies.length > 0 ? '4px 0 0' : 0 }}>
                Medicação atual: {medications.join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Corpo por estado */}
      {status === 'cancelled' || status === 'no-show' ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '24px',
            fontSize: '14px',
            color: '#6A7186',
          }}
        >
          Esta consulta foi{' '}
          {status === 'cancelled' ? 'cancelada' : 'marcada como falta'} — não há
          registo clínico a fazer.
        </div>
      ) : (
        <>
          {(canEdit || procedureItems.length > 0) && (
            <ProcedureList
              appointmentId={id}
              procedures={procedureItems}
              treatments={treatmentOptions}
              canEdit={canEdit}
            />
          )}
          {(canEdit || noteItems.length > 0) && (
            <ClinicalNotes
              appointmentId={id}
              notes={noteItems}
              canEdit={canEdit}
            />
          )}
          {!canEdit && status !== 'completed' && (
            <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
              Inicie a consulta para registar atos e notas clínicas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
