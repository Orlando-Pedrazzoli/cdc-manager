// 📄 src/components/documentos/IssueDocumentToolbar.tsx
// =============================================================================
// CDC Manager — Server wrapper: carrega modelos permitidos + consultas
// recentes do paciente e renderiza o botão "Emitir documento".
// =============================================================================

import { defaultClinicForPost } from '@/lib/post-clinic';
import { dbConnect } from '@/lib/mongodb';
import DocumentTemplate from '@/models/DocumentTemplate';
import Appointment from '@/models/Appointment';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { ensureDefaultTemplates } from '@/lib/document-templates-seed';
import { placeholdersIn } from '@/lib/document-merge';
import { sortByFolder, templateFolder } from '@/lib/data/document-templates';
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
  // 9.ª ronda/03: sem consulta, o documento sai pela unidade deste posto
  const postClinic = await defaultClinicForPost(clinics);
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
          : postClinic
            ? String(postClinic._id)
            : null
      }
      templates={sortByFolder(
        templates.map(t => ({
          id: String(t._id),
          title: t.title,
          kind: t.kind,
          // 8.ª ronda/06: agrupados por pasta (especialidade)
          folder: templateFolder(t.folder),
          needs: placeholdersIn(t.body),
        })),
      )}
      appointments={appts.map(a => ({
        id: String(a._id),
        label: `${fmt.format(a.startAt).replace(',', '')} — ${nameOf.get(String(a.treatmentTypeId)) ?? 'consulta'}`,
      }))}
      size={size}
    />
  );
}
