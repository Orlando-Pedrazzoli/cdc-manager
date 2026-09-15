// 📄 src/components/documentos/IssueDocumentToolbar.tsx
// =============================================================================
// CDC Manager — Server wrapper: carrega modelos permitidos + consultas
// recentes do paciente e renderiza o botão "Emitir documento".
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import DocumentTemplate from '@/models/DocumentTemplate';
import Appointment from '@/models/Appointment';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { ensureDefaultTemplates } from '@/actions/document-templates';
import { placeholdersIn } from '@/lib/document-merge';
import { IssueDocumentButton } from '@/components/documentos/IssueDocumentButton';

export async function IssueDocumentToolbar({
  patientId,
  role,
  size,
}: {
  patientId: string;
  role: 'doctor' | 'admin' | 'receptionist';
  size?: 'sm' | 'md';
}) {
  await dbConnect();
  await ensureDefaultTemplates();
  const [templates, appts, clinics] = await Promise.all([
    DocumentTemplate.find(
      role === 'doctor' ? { active: true } : { active: true, allowStaff: true },
    )
      .sort({ kind: 1, title: 1 })
      .lean(),
    Appointment.find({
      patientId,
      status: { $in: ['checked-in', 'in-progress', 'completed'] },
    })
      .sort({ startAt: -1 })
      .limit(10)
      .select('startAt treatmentTypeId clinicId')
      .lean(),
    getActiveClinics(),
  ]);
  const tt = await TreatmentType.find({
    _id: { $in: appts.map(a => a.treatmentTypeId) },
  })
    .select('name')
    .lean();
  const nameOf = new Map(tt.map(t => [String(t._id), t.name]));
  const fmt = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
  return (
    <IssueDocumentButton
      patientId={patientId}
      clinicId={
        appts[0]
          ? String(appts[0].clinicId)
          : clinics[0]
            ? String(clinics[0]._id)
            : null
      }
      templates={templates.map(t => ({
        id: String(t._id),
        title: t.title,
        kind: t.kind,
        needs: placeholdersIn(t.body),
      }))}
      appointments={appts.map(a => ({
        id: String(a._id),
        label: `${fmt.format(a.startAt).replace(',', '')} — ${nameOf.get(String(a.treatmentTypeId)) ?? 'consulta'}`,
      }))}
      size={size}
    />
  );
}
