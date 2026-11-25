// 📄 src/app/doutor/pacientes/[id]/page.tsx
// =============================================================================
// CDC Manager — Médico: Ficha clínica do paciente
// -----------------------------------------------------------------------------
// Server Component com separadores por ?tab= (convenção do projeto):
//   anamnese  (default) — AnamneseForm estruturado
//   historico           — notas clínicas cronológicas (append-only) com
//                         médico e consulta de origem
//
// 9.ª ronda (pontos 07 e 08, Victor, 17 e 18/11): o médico abre a ficha
// CLÍNICA de qualquer paciente. Com consultas com o paciente trabalha como
// sempre; sem consultas, a ficha abre SÓ PARA LEITURA (as actions de escrita
// continuam a exigir a relação). Todas as aberturas ficam no registo de
// acessos. Nunca se mostram contactos, morada, NIF, documento de
// identificação, faturação nem o n.º da apólice — só o nome da seguradora.
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
import {
  DocumentsTab,
  type DocumentItem,
} from '@/components/pacientes/DocumentsTab';
import { doctorDocumentFilter } from '@/lib/patient-access';
import ClinicalDocument from '@/models/Document';
import { documentUrls } from '@/lib/storage';
import { PatientLabCases } from '@/components/proteses/PatientLabCases';
import { IssueDocumentToolbar } from '@/components/documentos/IssueDocumentToolbar';
import { DoctorAnamnesisPanel } from '@/components/clinico/DoctorAnamnesisPanel';
import { AnamnesisStatusBanner } from '@/components/clinico/AnamnesisStatusBanner';
import { anamnesisStatus, type QuestionnaireData } from '@/lib/anamnesis';
import { processLabel, SEX_LABEL, type Sex } from '@/lib/domain';
import { AnamnesisReadView } from '@/components/clinico/AnamnesisReadView';
import {
  doctorHasRelation,
  logDoctorPatientView,
} from '@/lib/patient-access-data';

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

// Odontograma é subrota própria (versões por URL); os restantes são ?tab=
const TABS = [
  { key: 'anamnese', label: 'Anamnese' },
  { key: 'historico', label: 'Histórico clínico' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'laboratorios', label: 'Laboratórios' }, // E3 — pedidos a terceiros
  { key: 'odontograma', label: 'Odontograma' },
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
  const requestedTab =
    tab === 'historico'
      ? 'historico'
      : tab === 'documentos'
        ? 'documentos'
        : tab === 'laboratorios'
          ? 'laboratorios'
          : 'anamnese';

  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId || !/^[0-9a-fA-F]{24}$/.test(id)) return <NotFound />;

  await dbConnect();

  // Com relação: ficha de trabalho. Sem relação: consulta só de leitura.
  const hasRelation = await doctorHasRelation(doctorId, id);
  const consultOnly = !hasRelation;
  // Laboratórios é trabalho do médico do paciente: fora da consulta
  const activeTab =
    consultOnly && requestedTab === 'laboratorios' ? 'anamnese' : requestedTab;

  // Documentos só no separador de documentos (não anulados; URLs assinadas
  // geradas server-side após o RBAC acima)
  let documents: DocumentItem[] = [];
  if (activeTab === 'documentos') {
    // Victor, 25/11 (B3): a categoria "Outro" não aparece ao médico
    const docs = await ClinicalDocument.find({
      patientId: id,
      voidedAt: null,
      ...doctorDocumentFilter(session.user.id),
    })
      .sort({ createdAt: -1 })
      .populate<{
        uploadedByUserId: { name?: string } | null;
      }>('uploadedByUserId', 'name')
      .lean();
    documents = await Promise.all(docs.map(async d => {
      const { thumbUrl, previewUrl: bigUrl } = await documentUrls({
        publicId: d.publicId,
        resourceType: d.resourceType,
        format: d.format,
      });
      return {
        id: String(d._id),
        category: d.category,
        title: d.title,
        thumbUrl,
        previewUrl: bigUrl,
        format: d.format ?? null,
        bytes: d.bytes ?? 0,
        visibleToPatient: Boolean(d.visibleToPatient),
        uploadedByName: d.uploadedByUserId?.name ?? '—',
        createdAtLabel: d.createdAt ? lisbonDateTime(d.createdAt) : '',
        note: d.note ?? null,
      };
    }));
  }

  const [patient, record, upcoming] = await Promise.all([
    // Só dados clínicos e de identificação mínima (sem contactos nem NIF)
    Patient.findById(id)
      .select('name processNumber birthDate sex insurance.company status')
      .lean(),
    ClinicalRecord.findOne({ patientId: id }).lean(),
    // Próximas consultas: só data, hora e a observação da marcação
    Appointment.find({
      patientId: id,
      startAt: { $gte: new Date() },
      status: { $in: ['pending', 'confirmed', 'checked-in'] },
    })
      .sort({ startAt: 1 })
      .limit(5)
      .select('startAt note')
      .lean(),
  ]);
  if (!patient || patient.status === 'anonymized') return <NotFound />;

  // 9.ª ronda/08: quem abriu a ficha e quando
  await logDoctorPatientView({
    userId: session.user.id,
    patientId: id,
    hasRelation,
    where: 'ficha',
  });

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
          {[
            patient.birthDate
              ? `Nasc. ${lisbonDateTime(patient.birthDate).slice(0, 10)}`
              : null,
            patient.sex ? SEX_LABEL[patient.sex as Sex] : null,
            patient.insurance?.company
              ? `Seguradora / acordo: ${patient.insurance.company}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Sem data de nascimento na ficha'}
        </p>
        {upcoming.length > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#3D4257' }}>
            <strong>Próximas consultas:</strong>{' '}
            {upcoming
              .map(
                a =>
                  `${lisbonDateTime(a.startAt)}${a.note ? ` (${a.note})` : ''}`,
              )
              .join(' · ')}
          </p>
        )}
      </div>

      {/* 9.ª ronda/07: consulta de um paciente que não é do médico */}
      {consultOnly && (
        <div
          role='note'
          style={{
            backgroundColor: '#EEF2FF',
            border: '1px solid #C7D2F5',
            borderRadius: '12px',
            padding: '10px 18px',
            fontSize: '13px',
            color: '#2743A6',
          }}
        >
          <strong>Só leitura.</strong> Não tem consultas com este paciente:
          pode consultar a ficha clínica, mas não alterá-la. Este acesso fica
          registado.
        </div>
      )}

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
        {TABS.filter(t => !(consultOnly && t.key === 'laboratorios')).map(t => {
          const active = t.key === activeTab;
          const href =
            t.key === 'odontograma'
              ? `/doutor/pacientes/${id}/odontograma`
              : `/doutor/pacientes/${id}?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
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

      {activeTab === 'anamnese' && consultOnly ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AnamnesisStatusBanner
            questionnaire={record?.questionnaire ?? null}
            showOk
          />
          {/* Resumo clínico e respostas da anamnese, sem edição e sem as
              observações privadas do médico do paciente */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEF1F8',
              borderRadius: '14px',
              padding: '16px 18px',
              fontSize: '14px',
              color: '#1C2233',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>Alergias:</strong>{' '}
              {allergies.length > 0 ? allergies.join(' · ') : 'nenhuma registada'}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Medicação atual:</strong>{' '}
              {medications.length > 0
                ? medications.join(' · ')
                : 'nenhuma registada'}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Condições sistémicas:</strong>{' '}
              {anamnesis.systemicConditions.length > 0
                ? anamnesis.systemicConditions
                    .map(c => (c.detail ? `${c.condition} (${c.detail})` : c.condition))
                    .join(' · ')
                : 'nenhuma registada'}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Fumador:</strong>{' '}
              {anamnesis.smoker == null ? 'sem registo' : anamnesis.smoker ? 'sim' : 'não'}
            </p>
            {anamnesis.anamnesisNotes && (
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                <strong>Notas da anamnese:</strong> {anamnesis.anamnesisNotes}
              </p>
            )}
            {anamnesis.updatedAtLabel && (
              <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                {anamnesis.updatedAtLabel}
              </p>
            )}
          </div>
          {record?.questionnaire?.data ? (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EEF1F8',
                borderRadius: '14px',
                padding: '16px 18px',
              }}
            >
              <AnamnesisReadView
                data={record.questionnaire.data as QuestionnaireData}
              />
            </div>
          ) : null}
        </div>
      ) : activeTab === 'anamnese' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AnamnesisStatusBanner
            questionnaire={record?.questionnaire ?? null}
            showOk
          />
          <DoctorAnamnesisPanel
            patientId={id}
            data={
              (record?.questionnaire?.data as QuestionnaireData | null) ?? null
            }
            needsReview={
              anamnesisStatus(record?.questionnaire ?? null).state ===
              'unreviewed'
            }
            isMinor={age != null && age < 18}
            privateNotes={(record?.doctorPrivateNotes as string | null) ?? null}
          >
            <AnamneseForm patientId={id} initial={anamnesis} />
          </DoctorAnamnesisPanel>
        </div>
      ) : activeTab === 'documentos' ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '20px',
          }}
        >
          <DocumentsTab
            patientId={id}
            documents={documents}
            readOnly={consultOnly}
            toolbar={
              consultOnly ? undefined : (
                <IssueDocumentToolbar patientId={id} role={'doctor'} size='sm' />
              )
            }
          />
        </div>
      ) : activeTab === 'laboratorios' ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '20px',
          }}
        >
          <PatientLabCases
            patientId={id}
            patientLabel={`${patient.name} · ${processLabel(patient.processNumber)}`}
            mode='doctor'
          />
        </div>
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
