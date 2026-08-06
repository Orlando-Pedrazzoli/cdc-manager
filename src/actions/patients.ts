// 📄 src/actions/patients.ts
// =============================================================================
// CDC Manager — Server Actions: Pacientes
// -----------------------------------------------------------------------------
// CRUD administrativo de pacientes + convite de ativação do portal.
// Pacientes são GLOBAIS (a ficha serve as duas clínicas) → o RBAC exige
// staff (admin/receptionist) mas não restringe por clínica.
//
// NÚMERO DE PROCESSO — geração sequencial à prova de concorrência:
//   Estratégia otimista com retry: lê max(processNumber)+1 e tenta inserir;
//   o índice UNIQUE é o árbitro — se duas receções criarem ao mesmo tempo,
//   uma leva E11000 e repete com o número seguinte (até 3 tentativas).
//   Sem coleção de contadores para dessincronizar, e após a migração dos
//   ~86.000 do Dentoral a sequência continua naturalmente acima do maior
//   número importado.
//
// DEDUPLICAÇÃO — NIF é a chave forte (uma pessoa, um NIF): criar paciente
// com NIF já existente é bloqueado com indicação do processo existente.
// Telefone repetido é apenas AVISO no retorno (famílias partilham número —
// caso comuníssimo: pais + filhos com o telemóvel da mãe).
//
// CONVITE DE ATIVAÇÃO — cria User 'invited' (role patient) + código
// CDC-XXXX-XXXX enviado por email. Se o envio falhar, a criação NÃO é
// revertida: devolvemos o código ao staff (manualCode) para envio manual
// por WhatsApp — o convite nunca se perde por causa de um soluço do SMTP.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Recall from '@/models/Recall';
import {
  signDocumentUpload,
  fetchDocumentAssetInfo,
  destroyDocumentAsset,
  type CloudinaryUploadTicket,
} from '@/lib/cloudinary';
import User from '@/models/User';
import { createActivationCode } from '@/lib/activation';
import { sendActivationEmail } from '@/lib/resend';
import { logAudit } from '@/lib/audit';
import {
  createPatientSchema,
  updatePatientSchema,
  type CreatePatientInput,
} from '@/lib/validations/patient';

// -----------------------------------------------------------------------------
// Tipos de estado dos formulários
// -----------------------------------------------------------------------------
export type PatientFormState =
  | { error: string }
  | {
      success: true;
      patientId: string;
      processNumber: number;
      /** Aviso não-bloqueante (ex.: telefone já existe noutra ficha) */
      warning?: string;
      /** Código de ativação para envio manual quando o email falhou */
      manualCode?: string;
    }
  | undefined;

export type InviteFormState =
  | { error: string }
  | { success: true; warning?: string; manualCode?: string }
  | undefined;

// -----------------------------------------------------------------------------
// RBAC — só staff gere pacientes
// -----------------------------------------------------------------------------
async function requireStaff() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== 'admin' && role !== 'receptionist')) {
    throw new Error('Sem permissões para gerir pacientes.');
  }
  return session.user;
}

// -----------------------------------------------------------------------------
// Nº de processo sequencial (ver estratégia no cabeçalho)
// -----------------------------------------------------------------------------
async function nextProcessNumber(): Promise<number> {
  const last = await Patient.findOne()
    .sort({ processNumber: -1 })
    .select('processNumber');
  return (last?.processNumber ?? 0) + 1;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

// -----------------------------------------------------------------------------
// Helper interno: convite de ativação (partilhado por create + action isolada)
// -----------------------------------------------------------------------------
async function issueActivationInvite(params: {
  patientId: string;
  patientName: string;
  email: string;
  staffUserId: string;
}): Promise<
  { ok: true } | { ok: true; manualCode: string } | { error: string }
> {
  const email = params.email.toLowerCase().trim();

  // 1. User do paciente (cria 'invited' se não existir)
  let user = await User.findOne({ email });
  if (user) {
    if (user.patientId && user.patientId.toString() !== params.patientId) {
      return { error: 'Esse email já pertence à conta de outro paciente.' };
    }
    if (user.role !== 'patient') {
      return { error: 'Esse email pertence a uma conta de staff.' };
    }
    if (user.status === 'active') {
      return { error: 'Este paciente já tem a conta do portal ativa.' };
    }
    if (!user.patientId) {
      await User.updateOne(
        { _id: user._id },
        { $set: { patientId: params.patientId } },
      );
    }
  } else {
    // Sem password: fica 'invited' até ativar com o código
    user = await User.create({
      name: params.patientName,
      email,
      role: 'patient',
      status: 'invited',
      patientId: params.patientId,
    });
  }

  // 2. Código de ativação (invalida anteriores não usados — lib/activation)
  const { plainCode, expiresAt } = await createActivationCode({
    userId: user._id.toString(),
    purpose: 'account-activation',
    createdBy: params.staffUserId,
    sentVia: 'email',
  });

  // 3. Envio — falha NÃO reverte nada: staff recebe o código para envio manual
  const sent = await sendActivationEmail({
    to: email,
    name: params.patientName,
    plainCode,
    expiresAt,
  });

  await logAudit({
    userId: params.staffUserId,
    action: 'create',
    entityType: 'ActivationCode',
    patientId: params.patientId,
    summary: sent.ok
      ? 'Convite de ativação enviado por email'
      : `Convite criado; FALHA no envio de email (${sent.error}) — código entregue ao staff`,
  });

  return sent.ok ? { ok: true } : { ok: true, manualCode: plainCode };
}

// -----------------------------------------------------------------------------
// CRIAR PACIENTE
// -----------------------------------------------------------------------------
export async function createPatientAction(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = createPatientSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data: CreatePatientInput = parsed.data;

  if (data.sendActivationInvite && !data.email) {
    return {
      error: 'Para enviar o convite do portal é necessário indicar o email.',
    };
  }

  await dbConnect();

  // Deduplicação forte por NIF
  if (data.nif) {
    const dupNif = await Patient.findOne({
      nif: data.nif,
      status: { $ne: 'anonymized' },
    }).select('processNumber name');
    if (dupNif) {
      return {
        error: `Já existe um paciente com este NIF: ${dupNif.name} (processo nº ${dupNif.processNumber}).`,
      };
    }
  }
  // Aviso fraco por telefone (famílias partilham número)
  let warning: string | undefined;
  if (data.phone) {
    const dupPhone = await Patient.findOne({
      phone: data.phone,
      status: { $ne: 'anonymized' },
    }).select('processNumber name');
    if (dupPhone) {
      warning = `Atenção: o telefone já existe na ficha de ${dupPhone.name} (processo nº ${dupPhone.processNumber}).`;
    }
  }

  const now = new Date();
  const baseDoc = {
    name: data.name,
    birthDate: data.birthDate,
    nif: data.nif,
    phone: data.phone,
    email: data.email,
    address: {
      street: data.street,
      postalCode: data.postalCode,
      city: data.city,
    },
    profession: data.profession,
    maritalStatus: data.maritalStatus,
    nationality: data.nationality,
    referredBy: data.referredBy,
    preferredChannel: data.preferredChannel,
    preferredDoctorId: data.preferredDoctorId,
    notes: data.notes,
    consents: {
      dataProcessingAt: data.consentDataProcessing ? now : null,
      remindersAt: data.consentReminders ? now : null,
      marketingAt: data.consentMarketing ? now : null,
    },
    status: 'active' as const,
  };

  // Inserção com retry no nº de processo (concorrência — ver cabeçalho)
  let patient = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      patient = await Patient.create({
        ...baseDoc,
        processNumber: await nextProcessNumber(),
      });
      break;
    } catch (err) {
      if (isDuplicateKeyError(err) && attempt < 2) continue;
      console.error('[patients] criação falhou:', err);
      return { error: 'Não foi possível criar o paciente. Tente novamente.' };
    }
  }
  if (!patient) {
    return { error: 'Não foi possível criar o paciente. Tente novamente.' };
  }

  await logAudit({
    userId: staff.id,
    action: 'create',
    entityType: 'Patient',
    entityId: patient._id.toString(),
    patientId: patient._id.toString(),
    summary: `Paciente criado (processo nº ${patient.processNumber})`,
  });

  // Convite do portal, se pedido
  let manualCode: string | undefined;
  if (data.sendActivationInvite && data.email) {
    const invite = await issueActivationInvite({
      patientId: patient._id.toString(),
      patientName: data.name,
      email: data.email,
      staffUserId: staff.id,
    });
    if ('error' in invite) {
      warning = warning ? `${warning} ${invite.error}` : invite.error;
    } else if ('manualCode' in invite) {
      manualCode = invite.manualCode;
      const msg =
        'O email do convite falhou — envie o código manualmente (WhatsApp).';
      warning = warning ? `${warning} ${msg}` : msg;
    }
  }

  revalidatePath('/admin/pacientes');
  return {
    success: true,
    patientId: patient._id.toString(),
    processNumber: patient.processNumber,
    warning,
    manualCode,
  };
}

// -----------------------------------------------------------------------------
// ATUALIZAR PACIENTE
// -----------------------------------------------------------------------------
export async function updatePatientAction(
  patientId: string,
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!/^[0-9a-fA-F]{24}$/.test(patientId)) {
    return { error: 'Paciente inválido.' };
  }

  const parsed = updatePatientSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  await dbConnect();
  const patient = await Patient.findById(patientId);
  if (!patient || patient.status === 'anonymized') {
    return { error: 'Paciente não encontrado.' };
  }

  // NIF alterado → re-verificar duplicado
  if (data.nif && data.nif !== patient.nif) {
    const dupNif = await Patient.findOne({
      nif: data.nif,
      _id: { $ne: patient._id },
      status: { $ne: 'anonymized' },
    }).select('processNumber name');
    if (dupNif) {
      return {
        error: `Já existe um paciente com este NIF: ${dupNif.name} (processo nº ${dupNif.processNumber}).`,
      };
    }
  }

  const now = new Date();
  const $set: Record<string, unknown> = {};
  const changed: string[] = [];

  const map: Record<string, unknown> = {
    name: data.name,
    birthDate: data.birthDate,
    nif: data.nif,
    phone: data.phone,
    email: data.email,
    'address.street': data.street,
    'address.postalCode': data.postalCode,
    'address.city': data.city,
    profession: data.profession,
    maritalStatus: data.maritalStatus,
    nationality: data.nationality,
    referredBy: data.referredBy,
    preferredChannel: data.preferredChannel,
    preferredDoctorId: data.preferredDoctorId,
    notes: data.notes,
  };
  for (const [path, value] of Object.entries(map)) {
    if (value !== undefined) {
      $set[path] = value;
      changed.push(path);
    }
  }
  // Consents: checkbox marcada preenche a data SE ainda não havia; desmarcada
  // NÃO apaga (a revogação RGPD é um fluxo próprio, com registo explícito)
  if (data.consentDataProcessing && !patient.consents?.dataProcessingAt) {
    $set['consents.dataProcessingAt'] = now;
    changed.push('consents.dataProcessingAt');
  }
  if (data.consentReminders && !patient.consents?.remindersAt) {
    $set['consents.remindersAt'] = now;
    changed.push('consents.remindersAt');
  }
  if (data.consentMarketing && !patient.consents?.marketingAt) {
    $set['consents.marketingAt'] = now;
    changed.push('consents.marketingAt');
  }

  // Falecido: marcar regista a data e DISPENSA os recalls abertos (ninguém
  // convida a família para uma destartarização); desmarcar corrige engano.
  if (data.deceased && !patient.deceasedAt) {
    $set['deceasedAt'] = now;
    changed.push('deceasedAt');
    await Recall.updateMany(
      {
        patientId: patient._id,
        status: { $in: ['scheduled', 'due', 'contacted'] },
      },
      { status: 'dismissed' },
    );
  } else if (!data.deceased && patient.deceasedAt) {
    $set['deceasedAt'] = null;
    changed.push('deceasedAt');
  }

  if (changed.length === 0) {
    return {
      success: true,
      patientId,
      processNumber: patient.processNumber,
    };
  }

  await Patient.updateOne({ _id: patient._id }, { $set });
  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Patient',
    entityId: patientId,
    patientId,
    summary: 'Ficha de paciente atualizada',
    changedFields: changed,
  });

  revalidatePath('/admin/pacientes');
  revalidatePath(`/admin/pacientes/${patientId}`);
  return { success: true, patientId, processNumber: patient.processNumber };
}

// -----------------------------------------------------------------------------
// DESATIVAR / REATIVAR (never delete — convenção do projeto)
// -----------------------------------------------------------------------------
export async function setPatientStatusAction(
  patientId: string,
  status: 'active' | 'inactive',
): Promise<{ error?: string }> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!/^[0-9a-fA-F]{24}$/.test(patientId)) {
    return { error: 'Paciente inválido.' };
  }

  await dbConnect();
  const patient = await Patient.findById(patientId).select('status');
  if (!patient || patient.status === 'anonymized') {
    return { error: 'Paciente não encontrado.' };
  }

  await Patient.updateOne({ _id: patientId }, { $set: { status } });
  await logAudit({
    userId: staff.id,
    action: status === 'inactive' ? 'delete' : 'update',
    entityType: 'Patient',
    entityId: patientId,
    patientId,
    summary:
      status === 'inactive' ? 'Paciente desativado' : 'Paciente reativado',
    changedFields: ['status'],
  });

  revalidatePath('/admin/pacientes');
  revalidatePath(`/admin/pacientes/${patientId}`);
  return {};
}

// -----------------------------------------------------------------------------
// CONVITE DE ATIVAÇÃO isolado (botão na ficha de um paciente existente)
// -----------------------------------------------------------------------------
export async function sendPatientInviteAction(
  patientId: string,
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!/^[0-9a-fA-F]{24}$/.test(patientId)) {
    return { error: 'Paciente inválido.' };
  }

  await dbConnect();
  const patient = await Patient.findById(patientId).select('name email status');
  if (!patient || patient.status !== 'active') {
    return { error: 'Paciente não encontrado ou inativo.' };
  }

  // Email pode vir do formulário (e é gravado na ficha) ou já existir nela
  const emailFromForm = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const email = emailFromForm || patient.email;
  if (!email) {
    return { error: 'Indique o email do paciente para enviar o convite.' };
  }
  if (emailFromForm && emailFromForm !== patient.email) {
    await Patient.updateOne(
      { _id: patient._id },
      { $set: { email: emailFromForm } },
    );
  }

  const invite = await issueActivationInvite({
    patientId,
    patientName: patient.name,
    email,
    staffUserId: staff.id,
  });
  if ('error' in invite) return { error: invite.error };

  revalidatePath(`/admin/pacientes/${patientId}`);
  if ('manualCode' in invite) {
    return {
      success: true,
      warning:
        'O email falhou — envie o código manualmente ao paciente (WhatsApp).',
      manualCode: invite.manualCode,
    };
  }
  return { success: true };
}

// -----------------------------------------------------------------------------
// FOTO DO PACIENTE (paridade Dentoral) — mesmo fluxo em 3 passos dos
// documentos (lib/cloudinary.ts). Foto de identificação, não clínica:
// leva incoming transformation (o Cloudinary guarda já reduzida) e a
// remoção apaga o asset. Public ID opaco: {root}/pacientes-foto/{id}.
// -----------------------------------------------------------------------------

function patientPhotoPublicId(patientId: string): string {
  const root = process.env.CLOUDINARY_FOLDER || 'cdc-manager';
  return `${root}/pacientes-foto/${patientId}`;
}

export async function createPatientPhotoTicketAction(input: {
  patientId: string;
}): Promise<
  { ok: true; ticket: CloudinaryUploadTicket } | { ok: false; error: string }
> {
  const staff = await requireStaff();
  if (!staff) return { ok: false, error: 'Sem permissões.' };

  if (!/^[0-9a-fA-F]{24}$/.test(input.patientId)) {
    return { ok: false, error: 'Paciente inválido.' };
  }
  await dbConnect();
  const patient = await Patient.findById(input.patientId).select('_id').lean();
  if (!patient) return { ok: false, error: 'Paciente não encontrado.' };

  try {
    const ticket = signDocumentUpload(patientPhotoPublicId(input.patientId), {
      incomingTransformation: 'c_limit,w_800,q_auto',
    });
    return { ok: true, ticket };
  } catch (err) {
    console.error('[patients] assinatura de foto falhou:', err);
    return {
      ok: false,
      error: 'Cloudinary não configurado — verifique as variáveis de ambiente.',
    };
  }
}

export async function setPatientPhotoAction(input: {
  patientId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireStaff();
  if (!staff) return { ok: false, error: 'Sem permissões.' };

  if (!/^[0-9a-fA-F]{24}$/.test(input.patientId)) {
    return { ok: false, error: 'Paciente inválido.' };
  }
  await dbConnect();
  const patient = await Patient.findById(input.patientId);
  if (!patient) return { ok: false, error: 'Paciente não encontrado.' };

  const publicId = patientPhotoPublicId(input.patientId);
  const asset = await fetchDocumentAssetInfo(publicId);
  if (!asset) {
    return { ok: false, error: 'Upload não encontrado — tente novamente.' };
  }
  if (asset.resourceType !== 'image') {
    await destroyDocumentAsset(publicId, asset.resourceType);
    return { ok: false, error: 'A foto tem de ser uma imagem (JPEG/PNG).' };
  }

  patient.photoPublicId = publicId;
  await patient.save();

  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Patient',
    entityId: input.patientId,
    patientId: input.patientId,
    summary: 'Foto do paciente atualizada',
    changedFields: ['photoPublicId'],
  });

  revalidatePath(`/admin/pacientes/${input.patientId}`);
  return { ok: true };
}

export async function removePatientPhotoAction(input: {
  patientId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireStaff();
  if (!staff) return { ok: false, error: 'Sem permissões.' };

  if (!/^[0-9a-fA-F]{24}$/.test(input.patientId)) {
    return { ok: false, error: 'Paciente inválido.' };
  }
  await dbConnect();
  const patient = await Patient.findById(input.patientId);
  if (!patient || !patient.photoPublicId) {
    return { ok: false, error: 'Paciente sem foto.' };
  }

  await destroyDocumentAsset(patient.photoPublicId, 'image');
  patient.photoPublicId = null;
  await patient.save();

  await logAudit({
    userId: staff.id,
    action: 'update',
    entityType: 'Patient',
    entityId: input.patientId,
    patientId: input.patientId,
    summary: 'Foto do paciente removida',
    changedFields: ['photoPublicId'],
  });

  revalidatePath(`/admin/pacientes/${input.patientId}`);
  return { ok: true };
}
