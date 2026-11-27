// 📄 src/actions/document-templates.ts
// =============================================================================
// CDC Manager — Server Actions: modelos de documentos + emissão (Fase 5A)
// -----------------------------------------------------------------------------
// · ensureDefaultTemplates vive em src/lib/document-templates-seed.ts —
//   não é action (é chamada por páginas de servidor, sem sessão validada)
// · saveTemplateAction / toggleTemplateAction — admin edita/desativa
// · prepareDocumentAction — devolve o texto do modelo já com placeholders
//   substituídos para o médico rever/editar (não grava nada)
// · issueDocumentAction — gera o PDF (react-pdf), sobe ao R2, cria
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
  TEMPLATE_FOLDERS,
  TEMPLATE_KINDS,
  isTimeLockedKind,
  type TemplateKind,
} from '@/lib/data/document-templates';
import {
  mergeTemplate,
  longDatePt,
  shortDatePt,
  timePt,
  stripTitleLine,
} from '@/lib/document-merge';
import { finalizeIssuedDocument } from '@/lib/signing';
import User from '@/models/User';
import { processLabel } from '@/lib/domain';
import { certificateTimes } from '@/lib/certificate-times';
import { cleanDoctorIds, templateIssueBlock } from '@/lib/template-access';

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
  if (params.appointmentId && !OID.test(params.appointmentId)) {
    return { error: 'Consulta inválida.' };
  }
  if (params.clinicId && !OID.test(params.clinicId)) {
    return { error: 'Clínica inválida.' };
  }
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
  // 8.ª ronda/06: pasta (especialidade)
  folder: z.enum(TEMPLATE_FOLDERS).default('geral'),
  title: z.string().trim().min(3).max(120),
  body: z.string().min(10).max(20_000),
  allowStaff: z.preprocess(v => v === 'on' || v === 'true', z.boolean()),
  requiresSignature: z.preprocess(v => v === 'on' || v === 'true', z.boolean()),
  // 9.ª ronda (c): modelo restrito aos médicos escolhidos pela gestão
  restrictedToDoctors: z.preprocess(
    v => v === 'on' || v === 'true',
    z.boolean(),
  ),
  allowedDoctorIds: z.array(z.string()).max(300).default([]),
});

/** Para a auditoria: o que mudou no acesso dos médicos ao modelo */
function accessChangeSummary(
  before: {
    restrictedToDoctors?: boolean | null;
    allowedDoctorIds?: unknown[] | null;
  } | null,
  restricted: boolean,
  ids: string[],
): string {
  const was = !!before?.restrictedToDoctors;
  const prev = (before?.allowedDoctorIds ?? []).map(String).sort().join(',');
  const now = [...ids].sort().join(',');
  if (was === restricted && prev === now) return '';
  return restricted
    ? ` · acesso restrito a ${ids.length} médico(s)`
    : ' · acesso aberto a todos os médicos';
}

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
      folder: formData.get('folder') || undefined,
      title: formData.get('title'),
      body: formData.get('body'),
      allowStaff: formData.get('allowStaff'),
      requiresSignature: formData.get('requiresSignature'),
      restrictedToDoctors: formData.get('restrictedToDoctors'),
      allowedDoctorIds: formData
        .getAll('allowedDoctorIds')
        .filter((v): v is string => typeof v === 'string'),
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    const d = parsed.data;
    await dbConnect();
    const admin = await User.findById(session.user.id).select('role status').lean();
    if (!admin || admin.status !== 'active' || admin.role !== 'admin')
      return { error: 'Conta inativa ou permissões alteradas.' };
    // Só ficam na lista médicos que existem; sem restrição a lista é limpa
    const wanted = d.restrictedToDoctors ? cleanDoctorIds(d.allowedDoctorIds) : [];
    const allowedDoctorIds = wanted.length
      ? (await Doctor.find({ _id: { $in: wanted } }).select('_id').lean()).map(
          x => String(x._id),
        )
      : [];
    const before = d.id
      ? await DocumentTemplate.findById(d.id)
          .select('restrictedToDoctors allowedDoctorIds')
          .lean()
      : null;
    if (d.id && !before) return { error: 'Modelo não encontrado.' };
    if (d.id) {
      await DocumentTemplate.updateOne(
        { _id: d.id },
        {
          $set: {
            kind: d.kind,
            folder: d.folder,
            title: d.title,
            body: d.body,
            allowStaff: d.allowStaff,
            requiresSignature: d.requiresSignature,
            restrictedToDoctors: d.restrictedToDoctors,
            allowedDoctorIds,
            updatedByUserId: session.user.id,
          },
        },
      );
    } else {
      const key = `${d.kind}-${Date.now().toString(36)}`;
      await DocumentTemplate.create({
        key,
        kind: d.kind,
        folder: d.folder,
        title: d.title,
        body: d.body,
        allowStaff: d.allowStaff,
        requiresSignature: d.requiresSignature,
        restrictedToDoctors: d.restrictedToDoctors,
        allowedDoctorIds,
        updatedByUserId: session.user.id,
      });
    }
    await logAudit({
      userId: session.user.id,
      action: d.id ? 'update' : 'create',
      entityType: 'DocumentTemplate',
      entityId: d.id ?? undefined,
      summary: `Modelo de documento ${d.id ? 'atualizado' : 'criado'}: ${d.title}${accessChangeSummary(before, d.restrictedToDoctors, allowedDoctorIds)}`,
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
  /** 9.ª ronda/20: comprovativo de presença — texto fixo, sem edição */
  locked: boolean;
  /** Entrada ("Chegou") e saída ("Tudo OK") vêm do registo do sistema */
  recordedTimes: boolean;
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
      .select('name nif snsNumber birthDate processNumber address phone email')
      .lean(),
    params.doctorId
      ? Doctor.findById(params.doctorId).select('name fullName licenseNumber').lean()
      : null,
    getActiveClinics(),
    params.appointmentId && OID.test(params.appointmentId)
      ? Appointment.findById(params.appointmentId)
          .select('startAt endAt checkedInAt startedAt completedAt closedAt clinicId')
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
  const times = certificateTimes(appt);
  const values: Record<string, string | null> = {
    'paciente.nome': patient.name,
    'paciente.nif': patient.nif ?? null,
    'paciente.utente': patient.snsNumber ?? null,
    'paciente.nascimento': patient.birthDate
      ? shortDatePt(patient.birthDate)
      : null,
    'paciente.processo': processLabel(patient.processNumber),
    // 9.ª ronda (c): identificação do paciente nos contratos
    'paciente.morada':
      [
        patient.address?.street,
        [patient.address?.postalCode, patient.address?.city]
          .filter(Boolean)
          .join(' '),
      ]
        .filter(Boolean)
        .join(', ') || null,
    'paciente.telemovel': patient.phone ?? null,
    'paciente.email': patient.email ?? null,
    // 9.ª ronda (ponto 19): nome completo do médico, se estiver na ficha
    'medico.nome': doctor ? doctor.fullName || doctor.name : null,
    'medico.cedula': doctor?.licenseNumber ?? null,
    'clinica.nome': clinic?.name ?? null,
    'clinica.morada': clinic?.address ?? clinic?.name ?? null,
    // 3.ª reunião (orientações 06–08): rodapé "Dúvidas ou emergências"
    'clinica.telefone': clinic?.phone ?? null,
    'clinica.email': clinic?.email ?? null,
    data: longDatePt(now),
    'data.curta': shortDatePt(now),
    'consulta.data': shortDatePt(consultaDate as Date),
    // Victor, 25/11 (A4): entrada = hora a que a receção marcou "Chegou";
    // saída = hora a que a faturação foi fechada com "Tudo OK". Regra em
    // lib/certificate-times.ts; os comprovativos sem as duas horas
    // registadas não são emitidos (A5).
    'consulta.inicio': times.entry ? timePt(times.entry) : null,
    'consulta.fim': times.exit ? timePt(times.exit) : null,
    ...Object.fromEntries(
      Object.entries(params.extra).filter(([key, value]) =>
        EXTRA_PLACEHOLDERS.has(key) && typeof value === 'string' && value.length <= 500,
      ),
    ),
  };
  return {
    values,
    patient,
    doctor,
    clinic,
    recordedTimes: times.recorded,
    timesBlockReason: times.blockReason,
  };
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
    // 9.ª ronda (c): receção só nos modelos allowStaff; médico fora da
    // lista de um modelo restrito não o emite (lib/template-access.ts)
    const block = templateIssueBlock(t, { role, doctorId: access.doctorId });
    if (block) return { error: block };
    const locked = isTimeLockedKind(t.kind);
    if (locked && !input.appointmentId)
      return {
        error: 'Escolha a consulta a que o comprovativo se refere.',
      };
    const { values, recordedTimes, timesBlockReason } = await buildValues({
      patientId: input.patientId,
      doctorId: access.doctorId,
      clinicId: access.clinicId,
      appointmentId: input.appointmentId ?? null,
      extra: input.extra ?? {},
    });
    // Victor, 25/11 (A5): sem entrada e saída registadas, não se emite
    if (locked && timesBlockReason) return { error: timesBlockReason };
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
        locked,
        recordedTimes,
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
  /** 9.ª ronda/20: obrigatória nos comprovativos de presença */
  appointmentId?: string | null;
  extra?: Record<string, string>;
}): Promise<{ error?: string; documentId?: string }> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user?.id || role === 'patient' || !role)
      return { error: 'Sem permissões.' };
    if (!OID.test(input.templateId) || !OID.test(input.patientId))
      return { error: 'Dados inválidos.' };
    await dbConnect();
    const t = await DocumentTemplate.findById(input.templateId)
      .select(
        'active allowStaff restrictedToDoctors allowedDoctorIds kind title body',
      )
      .lean();
    if (!t || !t.active) return { error: 'Modelo indisponível.' };
    // A receção fica já barrada nos modelos só do médico; a lista de médicos
    // de um modelo restrito é verificada abaixo, depois de se saber quem é
    if (role !== 'doctor' && !t.allowStaff)
      return { error: 'Este modelo só pode ser emitido pelo médico.' };

    // 9.ª ronda/20: nos comprovativos de presença o texto que chega do
    // browser é IGNORADO — refaz-se aqui, a partir do modelo e das horas
    // registadas na consulta. Ninguém altera a hora de entrada ou de saída.
    const locked = isTimeLockedKind(t.kind);
    const appointmentId = locked ? (input.appointmentId ?? null) : null;
    if (locked && (!appointmentId || !OID.test(appointmentId)))
      return {
        error: 'Escolha a consulta a que o comprovativo se refere.',
      };

    const access = await authorizeDocumentContext({
      userId: session.user.id,
      role,
      patientId: input.patientId,
      clinicId: input.clinicId ?? null,
      appointmentId,
    });
    if ('error' in access) return { error: access.error };
    // 9.ª ronda (c): modelo restrito a médicos escolhidos pela gestão
    const block = templateIssueBlock(t, { role, doctorId: access.doctorId });
    if (block) return { error: block };

    let title = input.title;
    let body = input.body;
    if (locked) {
      const { values, timesBlockReason } = await buildValues({
        patientId: input.patientId,
        doctorId: access.doctorId,
        clinicId: access.clinicId,
        appointmentId,
        extra: input.extra ?? {},
      });
      // Victor, 25/11 (A5): sem entrada e saída registadas, não se emite
      if (timesBlockReason) return { error: timesBlockReason };
      title = t.title;
      body = stripTitleLine(mergeTemplate(t.body, values));
    }

    // Núcleo partilhado com o tablet (src/lib/signing.ts)
    const res = await finalizeIssuedDocument({
      templateId: input.templateId,
      patientId: input.patientId,
      clinicId: access.clinicId,
      doctorId: access.doctorId,
      title,
      body,
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
