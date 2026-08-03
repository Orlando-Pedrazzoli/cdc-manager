// 📄 src/app/doutor/pacientes/[id]/page.tsx
// =============================================================================
// CDC Manager — Médico: Ficha clínica do paciente
// -----------------------------------------------------------------------------
// Server Component com separadores por ?tab= (convenção do projeto):
//   anamnese  (default) — AnamneseForm estruturado
//   historico           — notas clínicas cronológicas (append-only) com
//                         médico e consulta de origem
//
// RBAC de dados: o médico só abre fichas de pacientes com quem tem
// consultas — caso contrário "não encontrado" (sem vazar existência).
// O banner de alergias/medicação repete-se aqui no topo — presença
// PERMANENTE em qualquer ecrã clínico do paciente.
//
// Odontograma e Plano de tratamento (passos 4 e 5 do sprint) terão páginas
// próprias em /odontograma e /plano — os separadores aparecem cá quando
// forem entregues (nunca linkar page.tsx vazia).
// =============================================================================

import Link from 'next/link';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import ClinicalRecord from '@/models/ClinicalRecord';
import {
  AnamneseForm,
  type AnamnesisData,
} from '@/components/clinico/AnamneseForm';

export const dynamic = 'force-dynamic';

function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);
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
      Paciente não encontrado.{' '}
      <Link
        href='/doutor/pacientes'
        style={{ color: '#2743A6', fontWeight: 600 }}
      >
        Voltar aos meus pacientes
      </Link>
    </div>
  );
}

const TABS = [
  { key: 'anamnese', label: 'Anamnese' },
  { key: 'historico', label: 'Histórico clínico' },
] as const;

export default async function DoctorPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === 'historico' ? 'historico' : 'anamnese';

  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId || !/^[0-9a-fA-F]{24}$/.test(id)) return <NotFound />;

  await dbConnect();

  // RBAC: relação médico↔paciente obrigatória
  const hasRelation = await Appointment.exists({ doctorId, patientId: id });
  if (!hasRelation) return <NotFound />;

  const [patient, record] = await Promise.all([
    Patient.findById(id).select('name processNumber phone birthDate').lean(),
    ClinicalRecord.findOne({ patientId: id }).lean(),
  ]);
  if (!patient) return <NotFound />;

  const age = ageFromBirthDate(patient.birthDate ?? null);
  const allergies = record?.allergies ?? [];
  const medications = record?.currentMedications ?? [];

  // Nome de quem atualizou a anamnese + médicos das notas
  const doctorIds = new Set<string>();
  if (record?.anamnesisUpdatedBy)
    doctorIds.add(String(record.anamnesisUpdatedBy));
  for (const n of record?.notes ?? []) doctorIds.add(String(n.doctorId));
  const doctors = doctorIds.size
    ? await Doctor.find({ _id: { $in: [...doctorIds] } })
        .select('name')
        .lean()
    : [];
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));

  const anamnesis: AnamnesisData = {
    allergies,
    currentMedications: medications,
    systemicConditions: (record?.systemicConditions ?? []).map(c => ({
      condition: c.condition,
      detail: (c.detail as string | null) ?? null,
    })),
    smoker: (record?.smoker as boolean | null) ?? null,
    anamnesisNotes: (record?.anamnesisNotes as string | null) ?? null,
    updatedAtLabel: record?.anamnesisUpdatedAt
      ? `Atualizada a ${lisbonDateTime(record.anamnesisUpdatedAt)}${
          record.anamnesisUpdatedBy
            ? ` por ${doctorName.get(String(record.anamnesisUpdatedBy)) ?? '—'}`
            : ''
        }`
      : null,
  };

  const notes = [...(record?.notes ?? [])].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link
        href='/doutor/pacientes'
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
        Os meus pacientes
      </Link>

      {/* Cabeçalho */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '18px 24px',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {patient.name}
          <span
            style={{
              marginLeft: 10,
              fontSize: '13px',
              fontWeight: 500,
              color: '#6A7186',
            }}
          >
            Proc. {String(patient.processNumber ?? '—')}
          </span>
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
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
          {patient.phone ?? 'Sem telefone'}
        </p>
      </div>

      {/* Banner permanente de segurança clínica */}
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

      {/* Separadores ?tab= */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '1px solid #E4E8F2',
        }}
      >
        {TABS.map(t => {
          const active = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={`/doutor/pacientes/${id}?tab=${t.key}`}
              style={{
                padding: '9px 16px',
                fontSize: '14px',
                fontWeight: active ? 700 : 500,
                color: active ? '#1B2A6B' : '#6A7186',
                textDecoration: 'none',
                borderBottom: active
                  ? '2px solid #2743A6'
                  : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === 'anamnese' ? (
        <AnamneseForm patientId={id} initial={anamnesis} />
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          {notes.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '24px 20px',
                fontSize: '14px',
                color: '#6A7186',
              }}
            >
              Sem notas clínicas registadas.
            </p>
          ) : (
            notes.map(n => (
              <div
                key={String(n._id)}
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid #F4F6FB',
                }}
              >
                <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                  {n.createdAt ? lisbonDateTime(n.createdAt) : '—'} ·{' '}
                  {doctorName.get(String(n.doctorId)) ?? 'Médico'}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '14px',
                    color: '#1B2A6B',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {n.text}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
