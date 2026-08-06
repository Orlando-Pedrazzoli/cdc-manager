// 📄 src/app/admin/pacientes/[id]/page.tsx
// =============================================================================
// CDC Manager — Admin: Ficha do Paciente
// -----------------------------------------------------------------------------
// Server Component. Estrutura da ficha:
//   PatientHeader (identidade + ações) → separadores → conteúdo do separador.
//
// Separadores por URL (?tab=) em vez de estado de cliente: partilháveis,
// back/forward funciona, e cada separador futuro carrega só os SEUS dados.
//   dados      → formulário de edição (Sprint 1 — este)
//   consultas  → placeholder (Sprint 2: agenda/marcações)
//   clinico    → placeholder (Sprint 3: anamnese, odontograma, planos)
//   documentos → placeholder (Sprint 3/5: RX, consentimentos, faturas)
// =============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { ArrowLeft } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import Appointment from '@/models/Appointment';
import {
  PatientHeader,
  type PatientHeaderData,
} from '@/components/pacientes/PatientHeader';
import {
  PatientForm,
  type PatientFormInitial,
} from '@/components/pacientes/PatientForm';
import {
  DocumentsTab,
  type DocumentItem,
} from '@/components/pacientes/DocumentsTab';
import ClinicalDocument from '@/models/Document';
import { signedPreviewUrl } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'dados', label: 'Dados' },
  { key: 'consultas', label: 'Consultas' },
  { key: 'clinico', label: 'Registo clínico' },
  { key: 'documentos', label: 'Documentos' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function toDateInput(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) notFound();

  const tab: TabKey = (
    TABS.some(t => t.key === rawTab) ? rawTab : 'dados'
  ) as TabKey;

  await dbConnect();
  const [patient, portalUser] = await Promise.all([
    Patient.findById(id).lean(),
    User.findOne({ patientId: id, role: 'patient' }).select('status').lean(),
  ]);
  if (!patient || patient.status === 'anonymized') notFound();

  // 1ª/última consulta derivadas das marcações concluídas (paridade Dentoral)
  const consultBounds = await Appointment.aggregate<{
    first: Date | null;
    last: Date | null;
  }>([
    {
      $match: {
        patientId: new mongoose.Types.ObjectId(id),
        status: { $in: ['completed'] },
      },
    },
    {
      $group: {
        _id: null,
        first: { $min: '$startAt' },
        last: { $max: '$startAt' },
      },
    },
  ]);
  const lisbonShort = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  });
  const bounds = consultBounds[0] ?? null;

  const header: PatientHeaderData = {
    id,
    processNumber: patient.processNumber,
    name: patient.name,
    status: patient.status,
    birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
    phone: patient.phone ?? null,
    email: patient.email ?? null,
    photoThumbUrl: patient.photoPublicId
      ? signedPreviewUrl(patient.photoPublicId, { width: 192 })
      : null,
    deceased: Boolean(patient.deceasedAt),
    firstConsultLabel: bounds?.first ? lisbonShort.format(bounds.first) : null,
    lastConsultLabel: bounds?.last ? lisbonShort.format(bounds.last) : null,
    portalStatus:
      portalUser?.status === 'active'
        ? 'active'
        : portalUser
          ? 'invited'
          : 'none',
  };

  // Médicos só são necessários no separador de dados (formulário)
  const doctors =
    tab === 'dados'
      ? (
          await Doctor.find({ active: true })
            .sort({ name: 1 })
            .select('name')
            .lean()
        ).map(d => ({ id: String(d._id), name: d.name }))
      : [];

  // Documentos só no separador de documentos (não anulados; URLs assinadas
  // geradas AQUI, server-side, já com a sessão validada pelo proxy)
  let documents: DocumentItem[] = [];
  if (tab === 'documentos') {
    const lisbonDateTime = new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Lisbon',
    });
    const docs = await ClinicalDocument.find({ patientId: id, voidedAt: null })
      .sort({ createdAt: -1 })
      .populate<{
        uploadedByUserId: { name?: string } | null;
      }>('uploadedByUserId', 'name')
      .lean();
    documents = docs.map(d => {
      const isImage = d.resourceType === 'image';
      const isPdf = d.format === 'pdf';
      return {
        id: String(d._id),
        category: d.category,
        title: d.title,
        thumbUrl: isImage
          ? signedPreviewUrl(d.publicId, { width: 480, isPdf })
          : null,
        previewUrl: isImage
          ? signedPreviewUrl(d.publicId, { width: 1600, isPdf })
          : null,
        format: d.format ?? null,
        bytes: d.bytes ?? 0,
        visibleToPatient: Boolean(d.visibleToPatient),
        uploadedByName: d.uploadedByUserId?.name ?? '—',
        createdAtLabel: d.createdAt ? lisbonDateTime.format(d.createdAt) : '',
        note: d.note ?? null,
      };
    });
  }

  const initial: PatientFormInitial = {
    name: patient.name,
    birthDate: toDateInput(patient.birthDate),
    nif: patient.nif ?? '',
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    maritalStatus: patient.maritalStatus ?? '',
    nationality: patient.nationality ?? '',
    referredBy: patient.referredBy ?? '',
    deceased: Boolean(patient.deceasedAt),
    street: patient.address?.street ?? '',
    postalCode: patient.address?.postalCode ?? '',
    city: patient.address?.city ?? '',
    profession: patient.profession ?? '',
    preferredChannel: patient.preferredChannel ?? 'whatsapp',
    preferredDoctorId: patient.preferredDoctorId
      ? String(patient.preferredDoctorId)
      : '',
    notes: patient.notes ?? '',
    hasConsentData: Boolean(patient.consents?.dataProcessingAt),
    hasConsentReminders: Boolean(patient.consents?.remindersAt),
    hasConsentMarketing: Boolean(patient.consents?.marketingAt),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link
        href='/admin/pacientes'
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
        Pacientes
      </Link>

      <PatientHeader patient={header} />

      {/* Separadores */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid #EEF1F8',
        }}
      >
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={
                t.key === 'dados'
                  ? `/admin/pacientes/${id}`
                  : `/admin/pacientes/${id}?tab=${t.key}`
              }
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                color: active ? '#2743A6' : '#6A7186',
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

      {/* Conteúdo do separador */}
      {tab === 'dados' ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: 860,
          }}
        >
          <PatientForm
            mode='edit'
            patientId={id}
            initial={initial}
            doctors={doctors}
          />
        </div>
      ) : tab === 'documentos' ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <DocumentsTab patientId={id} documents={documents} />
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            color: '#9AA1B4',
            fontSize: '14px',
          }}
        >
          {tab === 'consultas' &&
            'Histórico e marcação de consultas — disponível no Sprint 2 (agenda).'}
          {tab === 'clinico' &&
            'Anamnese, odontograma e planos de tratamento — disponível no Sprint 3.'}
        </div>
      )}
    </div>
  );
}
