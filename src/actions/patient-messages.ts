// 📄 src/actions/patient-messages.ts
// =============================================================================
// CDC Manager — Server Actions: mensagens ao paciente (7.ª ronda/A1)
// -----------------------------------------------------------------------------
// Parabéns de aniversário e seguimento de falta, a partir do dashboard.
//   · sendPatientMessageEmailAction — envia o email (Resend) e regista
//   · logWhatsAppMessageAction — regista que a receção abriu o WhatsApp com a
//     mensagem pronta (o envio em si é feito por ela, no WhatsApp)
// Cada envio fica em Notification (quem, quando, canal) e na auditoria.
//
// Consentimento: o email de PARABÉNS é uma comunicação de cortesia/marketing
// e só sai para quem deu consentimento de marketing na ficha. O seguimento de
// FALTA diz respeito a uma consulta do próprio paciente e não precisa dele.
// Regras e textos em lib/patient-messages.ts.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { readOrganizationSettings } from '@/lib/org-settings';
import { sendPatientMessageEmail } from '@/lib/resend';
import {
  MESSAGE_KINDS,
  isDoNotUseName,
  renderMessage,
  toWhatsAppNumber,
  type MessageKind,
} from '@/lib/patient-messages';
import Appointment from '@/models/Appointment';
import Clinic from '@/models/Clinic';
import Notification from '@/models/Notification';
import { getOrganization } from '@/models/Organization';
import Patient from '@/models/Patient';
import User from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const timeFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Lisbon',
});

const NOTIFICATION_TYPE = {
  birthday: 'birthday-greeting',
  'no-show': 'no-show-followup',
} as const;

const EMAIL_SUBJECT: Record<MessageKind, (clinic: string) => string> = {
  birthday: clinic => `Feliz aniversário! — ${clinic}`,
  'no-show': clinic => `Sentimos a sua falta — ${clinic}`,
};

async function requireStaff() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para enviar mensagens.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== role) {
    throw new Error(
      'Conta inativa ou permissões alteradas. Inicie sessão novamente.',
    );
  }
  return session.user;
}

type Input = {
  patientId: string;
  kind: MessageKind;
  /** Obrigatório na mensagem de falta: a marcação a que o paciente faltou */
  appointmentId?: string | null;
};

/** Carrega o paciente e monta o texto final, com as validações comuns */
async function prepare(input: Input) {
  if (!OBJECT_ID.test(input.patientId)) throw new Error('Paciente inválido.');
  if (!MESSAGE_KINDS.includes(input.kind)) throw new Error('Mensagem inválida.');

  const patient = await Patient.findById(input.patientId)
    .select('name phone email status deceasedAt consents')
    .lean();
  if (!patient || patient.status !== 'active') {
    throw new Error('Paciente não encontrado ou inativo.');
  }
  if (patient.deceasedAt || isDoNotUseName(patient.name)) {
    throw new Error('Esta ficha não deve receber mensagens.');
  }

  let clinicName: string | null = null;
  let clinicPhone: string | null = null;
  let time: string | null = null;
  let appointmentId: string | null = null;
  if (input.kind === 'no-show') {
    if (!input.appointmentId || !OBJECT_ID.test(input.appointmentId)) {
      throw new Error('Marcação inválida.');
    }
    const appt = await Appointment.findById(input.appointmentId)
      .select('patientId clinicId startAt status')
      .lean();
    if (!appt || String(appt.patientId) !== input.patientId) {
      throw new Error('Marcação não encontrada.');
    }
    if (appt.status !== 'no-show') {
      throw new Error('Esta marcação não está registada como falta.');
    }
    appointmentId = String(appt._id);
    time = timeFmt.format(appt.startAt as Date);
    const clinic = await Clinic.findById(appt.clinicId).select('name phone').lean();
    clinicName = clinic?.name ?? null;
    clinicPhone = (clinic?.phone as string | null) ?? null;
  }

  const [org, settings] = await Promise.all([
    getOrganization(),
    readOrganizationSettings(),
  ]);
  const name = clinicName ?? org.name;
  const text = renderMessage(
    input.kind,
    input.kind === 'birthday'
      ? settings.messageTemplates.birthday
      : settings.messageTemplates.noShow,
    { patientName: patient.name, clinicName: name, clinicPhone, time },
  );
  return { patient, text, clinicName: name, appointmentId };
}

export async function sendPatientMessageEmailAction(
  input: Input,
): Promise<{ success: true } | { error: string }> {
  let staff;
  let ctx;
  try {
    staff = await requireStaff();
    ctx = await prepare(input);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const email = (ctx.patient.email as string | null)?.trim();
  if (!email) return { error: 'O paciente não tem email na ficha.' };
  if (input.kind === 'birthday' && !ctx.patient.consents?.marketingAt) {
    return {
      error:
        'O paciente não deu consentimento para comunicações de marketing. Registe-o na ficha antes de enviar o email de parabéns.',
    };
  }

  const res = await sendPatientMessageEmail({
    to: email,
    subject: EMAIL_SUBJECT[input.kind](ctx.clinicName),
    text: ctx.text,
  });
  const now = new Date();
  await Notification.create({
    type: NOTIFICATION_TYPE[input.kind],
    channel: 'email',
    patientId: input.patientId,
    recipient: email,
    appointmentId: ctx.appointmentId,
    status: res.ok ? 'sent' : 'failed',
    sentAt: res.ok ? now : null,
    failedAt: res.ok ? null : now,
    errorMessage: res.ok ? null : res.error.slice(0, 500),
    sentByUserId: staff.id,
  });
  if (!res.ok) {
    return { error: 'O email não foi enviado. Tente de novo ou use o WhatsApp.' };
  }
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Patient',
    entityId: input.patientId,
    patientId: input.patientId,
    summary:
      input.kind === 'birthday'
        ? 'Email de parabéns enviado'
        : 'Email de seguimento de falta enviado',
    changedFields: [],
  });
  revalidatePath('/admin/dashboard');
  return { success: true };
}

/**
 * A receção clicou no botão do WhatsApp: fica o registo de quem abriu a
 * conversa com a mensagem pronta. O sistema não consegue saber se a
 * mensagem foi mesmo enviada — isso acontece no WhatsApp.
 */
export async function logWhatsAppMessageAction(
  input: Input,
): Promise<{ success: true } | { error: string }> {
  let staff;
  let ctx;
  try {
    staff = await requireStaff();
    ctx = await prepare(input);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const number = toWhatsAppNumber(ctx.patient.phone as string | null);
  if (!number) return { error: 'O paciente não tem um telemóvel válido.' };

  await Notification.create({
    type: NOTIFICATION_TYPE[input.kind],
    channel: 'whatsapp',
    patientId: input.patientId,
    recipient: `+${number}`,
    appointmentId: ctx.appointmentId,
    status: 'sent',
    sentAt: new Date(),
    sentByUserId: staff.id,
  });
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Patient',
    entityId: input.patientId,
    patientId: input.patientId,
    summary:
      input.kind === 'birthday'
        ? 'Mensagem de parabéns aberta no WhatsApp'
        : 'Mensagem de falta aberta no WhatsApp',
    changedFields: [],
  });
  revalidatePath('/admin/dashboard');
  return { success: true };
}
