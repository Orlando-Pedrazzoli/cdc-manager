// 📄 src/components/documentos/IssueDocumentToolbar.tsx
// =============================================================================
// CDC Manager — Server wrapper: carrega modelos permitidos + consultas
// recentes do paciente e renderiza o botão "Emitir documento".
// =============================================================================

import { defaultClinicForPost } from '@/lib/post-clinic';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { templateListFilter } from '@/lib/template-access';
import DocumentTemplate from '@/models/DocumentTemplate';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
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
  const doctorId =
    role === 'doctor' ? ((await auth())?.user?.doctorId ?? null) : null;
  const [templates, appts, clinics] = await Promise.all([
    // 9.ª ronda (c): o médico não vê os modelos restritos em que não está
    // (contratos); a regra é a mesma da emissão — lib/template-access.ts
    DocumentTemplate.find(templateListFilter({ role, doctorId }))
      .sort({ kind: 1, title: 1 })
      .lean(),
    Appointment.find({
      patientId,
      status: { $in: ['checked-in', 'in-progress', 'completed'] },
      // 28/11: o médico só pode emitir sobre as SUAS consultas (a ação
      // recusa as dos colegas); mostrar as dos outros só dava erro
      ...(role === 'doctor' && doctorId ? { doctorId } : {}),
    })
      .sort({ startAt: -1 })
      .limit(10)
      .select('startAt treatmentTypeId clinicId doctorId')
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
  // 28/11: para a gestão e a receção, cada consulta diz de que médico é —
  // é esse o médico que sai no documento
  const staff = role !== 'doctor';
  const docs = staff
    ? await Doctor.find({
        _id: { $in: appts.map(a => a.doctorId).filter(id => id != null) },
      })
        .select('name')
        .lean()
    : [];
  const doctorOf = new Map(docs.map(d => [String(d._id), d.name]));
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
        label: `${fmt.format(a.startAt).replace(',', '')} — ${nameOf.get(String(a.treatmentTypeId)) ?? 'consulta'}${doctorOf.has(String(a.doctorId)) ? ` — ${doctorOf.get(String(a.doctorId))}` : ''}`,
        clinicId: String(a.clinicId),
      }))}
      staff={staff}
      size={size}
    />
  );
}
