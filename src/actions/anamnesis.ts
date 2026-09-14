// 📄 src/actions/anamnesis.ts
// =============================================================================
// CDC Manager — Server Actions: Ficha de anamnese completa (Fase 3B, E19)
// -----------------------------------------------------------------------------
// · saveQuestionnaireAction — staff (admin/receção) ou médico preenche/atualiza
//   na ficha; médico → fica logo validada (reviewedAt)
// · savePortalQuestionnaireAction — o PACIENTE preenche no portal (P10:
//   "anamnese na área dele para que ele preencha e o médico tenha acesso");
//   fica "por validar" até o médico rever
// · reviewQuestionnaireAction — médico marca como revista
// · saveDoctorPrivateNotesAction — observações só para médicos (P12)
// Cada gravação: snapshot completo (a anamnese é o retrato atual), data,
// quem, versão; alertas de segurança (alergias/condições/medicação) fazem
// UNIÃO com os do médico — nunca removem.
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import ClinicalRecord from '@/models/ClinicalRecord';
import Patient from '@/models/Patient';
import {
  parseQuestionnaireForm,
  deriveSafetyAlerts,
  QUESTIONNAIRE_VERSION,
} from '@/lib/anamnesis';

export type AnamnesisActionState =
  { success: true } | { error: string } | undefined;

const OID = /^[0-9a-fA-F]{24}$/;

function revalidate(patientId: string) {
  revalidatePath(`/admin/pacientes/${patientId}`);
  revalidatePath(`/doutor/pacientes/${patientId}`);
  revalidatePath('/doutor/dashboard');
  revalidatePath('/admin/dashboard');
  revalidatePath('/conta/anamnese');
}

async function persist(params: {
  patientId: string;
  formData: FormData;
  role: 'patient' | 'doctor' | 'receptionist' | 'admin';
  userId: string;
  doctorId: string | null;
}) {
  const data = parseQuestionnaireForm(params.formData);
  const alerts = deriveSafetyAlerts(data);
  const now = new Date();

  const existing = await ClinicalRecord.findOne({
    patientId: params.patientId,
  }).select('allergies currentMedications systemicConditions');

  // União (case-insensitive) com o que o médico já tinha
  const union = (cur: string[], add: string[]) => {
    const seen = new Set(cur.map(x => x.toLowerCase()));
    return [...cur, ...add.filter(x => !seen.has(x.toLowerCase()))];
  };
  const curCond = (existing?.systemicConditions ?? []).map(c => ({
    condition: c.condition,
    detail: c.detail ?? null,
  }));
  const seenCond = new Set(curCond.map(c => c.condition.toLowerCase()));
  const mergedCond = [
    ...curCond,
    ...alerts.conditions.filter(c => !seenCond.has(c.condition.toLowerCase())),
  ];

  const isDoctor = params.role === 'doctor';
  await ClinicalRecord.updateOne(
    { patientId: params.patientId },
    {
      $setOnInsert: { patientId: params.patientId },
      $set: {
        'questionnaire.data': data,
        'questionnaire.version': QUESTIONNAIRE_VERSION,
        'questionnaire.completedAt': now,
        'questionnaire.completedByRole': params.role,
        'questionnaire.completedByUserId': params.userId,
        'questionnaire.reviewedAt': isDoctor ? now : null,
        'questionnaire.reviewedByDoctorId': isDoctor ? params.doctorId : null,
        allergies: union(existing?.allergies ?? [], alerts.allergies),
        currentMedications: union(
          existing?.currentMedications ?? [],
          alerts.medications,
        ),
        systemicConditions: mergedCond,
      },
    },
    { upsert: true },
  );
  return { data, alerts };
}

// --- Staff / médico -----------------------------------------------------------
export async function saveQuestionnaireAction(
  _prev: AnamnesisActionState,
  formData: FormData,
): Promise<AnamnesisActionState> {
  try {
    const patientId = String(formData.get('patientId') ?? '');
    if (!OID.test(patientId)) return { error: 'Paciente inválido.' };
    const session = await auth();
    const role = session?.user?.role;
    if (
      !session?.user?.id ||
      (role !== 'admin' && role !== 'receptionist' && role !== 'doctor')
    ) {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();
    const patient = await Patient.findById(patientId).select('status name');
    if (!patient || patient.status === 'anonymized') {
      return { error: 'Paciente não encontrado.' };
    }
    const { alerts } = await persist({
      patientId,
      formData,
      role,
      userId: session.user.id,
      doctorId: role === 'doctor' ? (session.user.doctorId ?? null) : null,
    });
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'ClinicalRecord',
      patientId,
      summary: `Ficha de anamnese preenchida (${role}) — ${alerts.allergies.length} alergia(s), ${alerts.conditions.length} condição(ões)`,
    });
    revalidate(patientId);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Dados da anamnese inválidos.',
    };
  }
}

// --- Portal do paciente --------------------------------------------------------
export async function savePortalQuestionnaireAction(
  _prev: AnamnesisActionState,
  formData: FormData,
): Promise<AnamnesisActionState> {
  try {
    const session = await auth();
    const patientId = session?.user?.patientId;
    if (!session?.user?.id || session.user.role !== 'patient' || !patientId) {
      return { error: 'Sessão inválida.' };
    }
    await dbConnect();
    await persist({
      patientId: String(patientId),
      formData,
      role: 'patient',
      userId: session.user.id,
      doctorId: null,
    });
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'ClinicalRecord',
      patientId: String(patientId),
      summary: 'Ficha de anamnese preenchida pelo paciente no portal',
    });
    revalidate(String(patientId));
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Dados da anamnese inválidos.',
    };
  }
}

// --- Médico valida a anamnese preenchida pelo paciente -------------------------
export async function reviewQuestionnaireAction(
  patientId: string,
): Promise<{ error?: string }> {
  try {
    if (!OID.test(patientId)) return { error: 'Paciente inválido.' };
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'doctor') {
      return { error: 'Só o médico pode validar a anamnese.' };
    }
    await dbConnect();
    const res = await ClinicalRecord.updateOne(
      { patientId, 'questionnaire.completedAt': { $ne: null } },
      {
        $set: {
          'questionnaire.reviewedAt': new Date(),
          'questionnaire.reviewedByDoctorId': session.user.doctorId ?? null,
        },
      },
    );
    if (res.matchedCount !== 1)
      return { error: 'Anamnese ainda não preenchida.' };
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'ClinicalRecord',
      patientId,
      summary: 'Anamnese validada pelo médico',
    });
    revalidate(patientId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

// --- Observações só para médicos (P12) ------------------------------------------
export async function saveDoctorPrivateNotesAction(
  _prev: AnamnesisActionState,
  formData: FormData,
): Promise<AnamnesisActionState> {
  try {
    const patientId = String(formData.get('patientId') ?? '');
    const text = String(formData.get('doctorPrivateNotes') ?? '')
      .trim()
      .slice(0, 3000);
    if (!OID.test(patientId)) return { error: 'Paciente inválido.' };
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'doctor') {
      return { error: 'Só médicos podem editar estas observações.' };
    }
    await dbConnect();
    await ClinicalRecord.updateOne(
      { patientId },
      {
        $setOnInsert: { patientId },
        $set: { doctorPrivateNotes: text || null },
      },
      { upsert: true },
    );
    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'ClinicalRecord',
      patientId,
      summary: 'Observações privadas do médico atualizadas',
    });
    revalidatePath(`/doutor/pacientes/${patientId}`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}