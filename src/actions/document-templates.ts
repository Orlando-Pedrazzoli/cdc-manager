// 📄 src/actions/document-templates.ts
// =============================================================================
// CDC Manager — Server Actions: modelos de documentos + emissão (Fase 5A)
// -----------------------------------------------------------------------------
// · ensureDefaultTemplates vive em src/lib/document-templates-seed.ts —
//   não é action (é chamada por páginas de servidor, sem sessão validada)
// · saveTemplateAction / toggleTemplateAction — admin edita/desativa
// · prepareDocumentAction — devolve o texto do modelo já com placeholders
//   substituídos para o médico rever/editar (não grava nada)
// · issueDocumentAction — gera o PDF (react-pdf), sobe ao Cloudinary, cria
//   o Document na ficha (categoria por tipo) e devolve o id; auditado.
// RBAC: emitir → médico sempre; admin/receção só em modelos `allowStaff`
// (certificados de presença, autorizações). Editar modelos → admin.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import DocumentTemplate from '@/models/DocumentTemplate';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import { getActiveClinics } from '@/models/Clinic';
import {
  TEMPLATE_KINDS,
  type TemplateKind,
} from '@/lib/data/document-templates';
import {
  mergeTemplate,
  longDatePt,
  shortDatePt,
  timePt,
} from '@/lib/document-merge';
import { finalizeIssuedDocument } from '@/lib/signing';
import User from '@/models/User';

const OID = /^[0-9a-fA-F]{24}$/;

const EXTRA_PLACEHOLDERS = new Set([
  'acompanhante.nome',
  'dias',
  'tratamento',
]);

async function authorizeDocumentContext(params: {
  userId: string;
  role: string;
  patientId: string;
  clinicId: string | null;
  appointmentId: string | null;
}): Promise<{ doctorId: string | null; clinicId: string } | { error: string }> {
  const user = await User.findById(params.userId)
    .select('role status doctorId clinicIds')
    .lean();
  if (
    !user ||
    user.status !== 'active' ||
    user.role !== params.role ||
    !['admin', 'receptionist', 'doctor'].includes(user.role)
  ) return { error: 'Conta inativa ou permissões alteradas.' };

  const patient = await Patient.findById(params.patientId)
    .select('status')
    .lean();
  if (!patient || patient.status !== 'active')
    return { error: 'Paciente não encontrado ou inativo.' };

  const appointment = params.appointmentId
    ? await Appointment.findOne({
        _id: params.appointmentId,
        patientId: params.patientId,
      }).select('clinicId doctorId').lean()
    : null;
  if (params.appointmentId && !appointment)
    return { error: 'Consulta não encontrada para este paciente.' };

  if (
    appointment &&
    params.clinicId &&
    String(appointment.clinicId) !== params.clinicId
  ) return { error: 'A consulta não pertence à clínica indicada.' };

  const clinics = await getActiveClinics();
  const clinicId =
    params.clinicId ??
    (appointment ? String(appointment.clinicId) : '') ??
    '';
  const resolvedClinicId = clinicId || (user.role === 'admin' ? String(clinics[0]?._id ?? '') : '');
  const clinic = clinics.find(item => String(item._id) === resolvedClinicId);
  if (!clinic) return { error: 'Clínica inválida ou inativa.' };

  if (user.role === 'receptionist') {
    const allowed = (user.clinicIds ?? []).map(id => String(id));
    if (allowed.length > 0 && !allowed.includes(resolvedClinicId))
      return { error: 'Sem permissões para esta clínica.' };
  }

  let doctorId: string | null = null;
  if (user.role === 'doctor') {
    if (!user.doctorId) return { error: 'Perfil médico não associado.' };
    doctorId = String(user.doctorId);
    const doctor = await Doctor.findOne({
      _id: user.doctorId,
      active: true,
      'clinicSchedules.clinicId': resolvedClinicId,
    }).select('_id').lean();
    if (!doctor) return { error: 'Sem permissões para esta clínica.' };
    const relation = await Appointment.exists({
      patientId: params.patientId,
      doctorId: user.doctorId,
      clinicId: resolvedClinicId,
    });
    if (!relation) return { error: 'Paciente não encontrado.' };
    if (appointment && String(appointment.doctorId) !== doctorId)
      return { error: 'A consulta não pertence ao seu perfil médico.' };
  }

  return { doctorId, clinicId: resolvedClinicId };
}

// --- Admin: editar modelos ------------------------------------------------------
export type TemplateFormState =
  { success: true } | { error: string } | undefined;

const templateSchema = z.object({
  id: z.string().regex(OID).nullable().default(null),
  kind: z.enum(TEMPLATE_KINDS),
  title: z.string().trim().min(3).max(120),
  body: z.string().min(10).max(20_000),
  allowStaff: z.preprocess(v => v === 'on' || v === 'true', z.boolean()),
  requiresSignature: z.preprocess(v => v === 'on' || v === 'true', z.boolean()),
});

export async function saveTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'admin')
      return { error: 'Só a administração edita modelos.' };
    const parsed = templateSchema.safeParse({
      id: formData.get('id') || null,
      kind: formData.get('kind'),
      title: formData.get('title'),
      body: formData.get('body'),
      allowStaff: formData.get('allowStaff'),
      requiresSignature: formData.get('requiresSignature'),
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    await dbConnect();
    const admin = await User.findById(session.user.id).select('role status').lean();
    if (!admin || admin.status !== 'active' || admin.role !== 'admin')
      return { error: 'Conta inativa ou permissões alteradas.' };
    if (d.id) {
      await DocumentTemplate.updateOne(
        { _id: d.id },
        {
          $set: {
            kind: d.kind,
            title: d.title,
            body: d.body,
            allowStaff: d.allowStaff,
            requiresSignature: d.requiresSignature,
            updatedByUserId: session.user.id,
          },
        },
      );
    } else {
      const key = `${d.kind}-${Date.now().toString(36)}`;
      await DocumentTemplate.create({
        key,
        kind: d.kind,
        title: d.title,
        body: d.body,
        allowStaff: d.allowStaff,
        requiresSignature: d.requiresSignature,
        updatedByUserId: session.user.id,
      });
    }
    await logAudit({
      userId: session.user.id,
      action: d.id ? 'update' : 'create',
      entityType: 'DocumentTemplate',
      entityId: d.id ?? undefined,
      summary: `Modelo de documento ${d.id ? 'atualizado' : 'criado'}: ${d.title}`,
    });
    revalidatePath('/admin/modelos');
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

export async function toggleTemplateAction(
  id: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin')
    return { error: 'Sem permissões.' };
  if (!OID.test(id)) return { error: 'Modelo inválido.' };
  await dbConnect();
  const admin = await User.findById(session.user.id).select('role status').lean();
  if (!admin || admin.status !== 'active' || admin.role !== 'admin')
    return { error: 'Conta inativa ou permissões alteradas.' };
  const t = await DocumentTemplate.findById(id).select('active title');
  if (!t) return { error: 'Modelo não encontrado.' };
  t.set('active', !t.active);
  await t.save();
  revalidatePath('/admin/modelos');
  return {};
}

// --- Preparar (merge) -----------------------------------------------------------
export interface PreparedDocument {
  templateId: string;
  kind: TemplateKind;
  title: string;
  body: string;
  requiresSignature: boolean;
  missing: string[]; // placeholders sem valor (ficam "________")
}

async function buildValues(params: {
  patientId: string;
  doctorId: string | null;
  clinicId: string | null;
  appointmentId: string | null;
  extra: Record<string, string>;
}) {
  const [patient, doctor, clinics, appt] = await Promise.all([
    Patient.findById(params.patientId)
      .select('name nif snsNumber birthDate processNumber')
      .lean(),
    params.doctorId
      ? Doctor.findById(params.doctorId).select('name licenseNumber').lean()
      : null,
    getActiveClinics(),
    params.appointmentId && OID.test(params.appointmentId)
      ? Appointment.findById(params.appointmentId)
          .select('startAt endAt startedAt completedAt clinicId')
          .lean()
      : null,
  ]);
  if (!patient) throw new Error('Paciente não encontrado.');
  const clinic =
    clinics.find(
      c =>
        String(c._id) ===
        (params.clinicId ?? (appt ? String(appt.clinicId) : '')),
    ) ?? clinics[0];
  const now = new Date();
  const consultaDate = appt ? (appt.startedAt ?? appt.startAt) : now;
  const values: Record<string, string | null> = {
    'paciente.nome': patient.name,
    'paciente.nif': patient.nif ?? null,
    'paciente.utente': patient.snsNumber ?? null,
    'paciente.nascimento': patient.birthDate
      ? shortDatePt(patient.birthDate)
      : null,
    'paciente.processo': String(patient.processNumber),
    'medico.nome': doctor?.name ?? null,
    'medico.cedula': doctor?.licenseNumber ?? null,
    'clinica.nome': clinic?.name ?? null,
    'clinica.morada': clinic?.address ?? clinic?.name ?? null,
    // 3.ª reunião (orientações 06–08): rodapé "Dúvidas ou emergências"
    'clinica.telefone': clinic?.phone ?? null,
    'clinica.email': clinic?.email ?? null,
    data: longDatePt(now),
    'data.curta': shortDatePt(now),
    'consulta.data': shortDatePt(consultaDate as Date),
    'consulta.inicio': appt
      ? timePt((appt.startedAt ?? appt.startAt) as Date)
      : null,
    'consulta.fim': appt
      ? timePt((appt.completedAt ?? appt.endAt) as Date)
      : null,
    ...Object.fromEntries(
      Object.entries(params.extra).filter(([key, value]) =>
        EXTRA_PLACEHOLDERS.has(key) && typeof value === 'string' && value.length <= 500,
      ),
    ),
  };
  return { values, patient, doctor, clinic };
}

export async function prepareDocumentAction(input: {
  templateId: string;
  patientId: string;
  appointmentId?: string | null;
  clinicId?: string | null;
  extra?: Record<string, string>;
}): Promise<{ error?: string; doc?: PreparedDocument }> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user?.id || role === 'patient' || !role)
      return { error: 'Sem permissões.' };
    if (!OID.test(input.templateId) || !OID.test(input.patientId))
      return { error: 'Dados inválidos.' };
    await dbConnect();
    const access = await authorizeDocumentContext({
      userId: session.user.id,
      role,
      patientId: input.patientId,
      clinicId: input.clinicId ?? null,
      appointmentId: input.appointmentId ?? null,
    });
    if ('error' in access) return { error: access.error };
    const t = await DocumentTemplate.findById(input.templateId).lean();
    if (!t || !t.active) return { error: 'Modelo indisponível.' };
    if (role !== 'doctor' && !t.allowStaff)
      return { error: 'Este modelo só pode ser emitido pelo médico.' };
    const { values } = await buildValues({
      patientId: input.patientId,
      doctorId: access.doctorId,
      clinicId: access.clinicId,
      appointmentId: input.appointmentId ?? null,
      extra: input.extra ?? {},
    });
    const body = mergeTemplate(t.body, values);
    const missing = Object.entries(values)
      .filter(
        ([k, v]) => (v == null || v === '') && t.body.includes(`{{${k}}}`),
      )
      .map(([k]) => k);
    return {
      doc: {
        templateId: String(t._id),
        kind: t.kind as TemplateKind,
        title: t.title,
        body,
        requiresSignature: !!t.requiresSignature,
        missing,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// --- Emitir ---------------------------------------------------------------------
export async function issueDocumentAction(input: {
  templateId: string;
  patientId: string;
  clinicId?: string | null;
  title: string;
  body: string; // texto final, já editado
  signatureDataUrl?: string | null;
  visibleToPatient?: boolean;
}): Promise<{ error?: string; documentId?: string }> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user?.id || role === 'patient' || !role)
      return { error: 'Sem permissões.' };
    if (!OID.test(input.templateId) || !OID.test(input.patientId))
      return { error: 'Dados inválidos.' };
    await dbConnect();
    const access = await authorizeDocumentContext({
      userId: session.user.id,
      role,
      patientId: input.patientId,
      clinicId: input.clinicId ?? null,
      appointmentId: null,
    });
    if ('error' in access) return { error: access.error };
    const t = await DocumentTemplate.findById(input.templateId)
      .select('active allowStaff')
      .lean();
    if (!t || !t.active) return { error: 'Modelo indisponível.' };
    if (role !== 'doctor' && !t.allowStaff)
      return { error: 'Este modelo só pode ser emitido pelo médico.' };

    // Núcleo partilhado com o tablet (src/lib/signing.ts)
    const res = await finalizeIssuedDocument({
      templateId: input.templateId,
      patientId: input.patientId,
      clinicId: access.clinicId,
      doctorId: access.doctorId,
      title: input.title,
      body: input.body,
      signatureDataUrl: input.signatureDataUrl ?? null,
      visibleToPatient: input.visibleToPatient ?? true,
      userId: session.user.id,
      via: 'balcao',
    });
    if (res.error) return res;
    revalidatePath(`/admin/pacientes/${input.patientId}`);
    revalidatePath(`/doutor/pacientes/${input.patientId}`);
    return res;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
