// 📄 src/actions/procedures.ts
// =============================================================================
// CDC Manager — Actions: fluxo da consulta (área do médico)
// -----------------------------------------------------------------------------
// TODAS as actions deste ficheiro são do MÉDICO e vivem sob RBAC duplo:
//   1. rota /doutor (proxy) — só role doctor entra
//   2. DADOS — cada action verifica que a marcação pertence ao doctorId da
//      SESSÃO (o médico só mexe nas suas consultas; requisito firme)
//
// Fluxo: iniciar consulta → registar atos + notas → concluir.
//
// PRINCÍPIOS:
// · Máquina de estados respeitada: iniciar percorre as ARESTAS válidas
//   (pending→confirmed→checked-in→in-progress), gravando cada timestamp —
//   o médico pode iniciar mesmo que a receção não tenha feito check-in
// · Ato registado = Procedure 'completed' com SNAPSHOT (nome, preço,
//   comissão resolvida override>médico>clínica) congelado na execução
// · Never delete: ato errado ANULA-SE (void + autor + motivo)
// · Nota clínica é APPEND-ONLY no ClinicalRecord (1:1 lazy com o paciente)
// · logAudit com clinicId em todos os eventos operacionais
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { resolveCommissionRate, commissionCentsOf } from '@/lib/commissions';
import {
  spawnRecallForProcedure,
  cancelRecallForProcedure,
} from '@/lib/recalls';
import {
  addProcedureSchema,
  voidProcedureSchema,
  addClinicalNoteSchema,
  completeConsultationSchema,
  updateAnamnesisSchema,
  saveOdontogramSchema,
} from '@/lib/validations/procedure';
import Appointment, { type AppointmentStatus } from '@/models/Appointment';
import Procedure from '@/models/Procedure';
import ClinicalRecord from '@/models/ClinicalRecord';
import Odontogram from '@/models/Odontogram';
import Doctor from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';
import { getClinicById } from '@/models/Clinic';

// -----------------------------------------------------------------------------
// Tipos de estado (padrão useActionState do projeto)
// -----------------------------------------------------------------------------
export type ConsultationActionState =
  | { error: string }
  | { success: true; warning?: string }
  | undefined;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// -----------------------------------------------------------------------------
// RBAC de dados: a marcação tem de pertencer ao médico da sessão
// -----------------------------------------------------------------------------
async function requireOwnAppointment(appointmentId: string) {
  const session = await auth();
  if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
    throw new Error('Sem permissões.');
  }
  if (!OBJECT_ID.test(appointmentId)) {
    throw new Error('Marcação inválida.');
  }
  await dbConnect();
  const appt = await Appointment.findById(appointmentId);
  if (!appt) throw new Error('Marcação não encontrada.');
  if (String(appt.doctorId) !== session.user.doctorId) {
    throw new Error('Esta consulta não lhe pertence.');
  }
  return { appt, userId: session.user.id, doctorId: session.user.doctorId };
}

function fail(e: unknown): { error: string } {
  return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
}

// -----------------------------------------------------------------------------
// INICIAR CONSULTA — percorre as arestas válidas até in-progress
// -----------------------------------------------------------------------------
const START_PATH: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  pending: 'confirmed',
  confirmed: 'checked-in',
  'checked-in': 'in-progress',
};

const STATUS_TIMESTAMP: Partial<Record<AppointmentStatus, string>> = {
  confirmed: 'confirmedAt',
  'checked-in': 'checkedInAt',
  'in-progress': 'startedAt',
};

export async function startConsultationAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const appointmentId = String(formData.get('appointmentId') ?? '');
    const { appt, userId } = await requireOwnAppointment(appointmentId);

    if (appt.status === 'in-progress') return { success: true }; // idempotente
    if (!(appt.status in START_PATH)) {
      return { error: `Não é possível iniciar uma consulta "${appt.status}".` };
    }

    const now = new Date();
    let cursor = appt.status as AppointmentStatus;
    while (cursor !== 'in-progress') {
      const next = START_PATH[cursor];
      if (!next) break;
      const tsField = STATUS_TIMESTAMP[next];
      appt.set('status', next);
      if (tsField) appt.set(tsField, now);
      cursor = next;
    }
    await appt.save();

    await logAudit({
      userId,
      action: 'update',
      entityType: 'Appointment',
      entityId: String(appt._id),
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: 'Consulta iniciada pelo médico',
    });

    revalidatePath(`/doutor/consulta/${appointmentId}`);
    revalidatePath('/doutor/dashboard');
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// REGISTAR ATO — snapshot de preço + comissão, status 'completed'
// -----------------------------------------------------------------------------
export async function addProcedureAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const parsed = addProcedureSchema.safeParse({
      appointmentId: formData.get('appointmentId'),
      treatmentTypeId: formData.get('treatmentTypeId'),
      priceEuros: formData.get('priceEuros'),
      toothNumbers: formData.get('toothNumbers'),
      notes: formData.get('notes'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const { appt, userId, doctorId } = await requireOwnAppointment(
      data.appointmentId,
    );
    if (appt.status !== 'in-progress') {
      return { error: 'Só é possível registar atos com a consulta em curso.' };
    }

    const [treatment, doctor, clinic] = await Promise.all([
      TreatmentType.findById(data.treatmentTypeId).lean(),
      Doctor.findById(doctorId)
        .select('commissionRate commissionOverrides')
        .lean(),
      getClinicById(String(appt.clinicId)),
    ]);
    if (!treatment) return { error: 'Ato não encontrado no catálogo.' };
    if (!doctor || !clinic)
      return { error: 'Dados de comissão indisponíveis.' };

    // Paridade Dentoral «Controla Dente»: este ato não faz sentido clínico
    // sem dente (extração, endodontia, restauração…) — exige ≥1 dente FDI.
    // A flag vive no catálogo (Configurações) e é o Victor quem a define.
    if (treatment.controlsTooth && data.toothNumbers.length === 0) {
      return {
        error: `«${treatment.name}» exige indicar o(s) dente(s) — preencha o campo Dentes (notação FDI).`,
      };
    }

    // Cadeia: override (médico×ato) > taxa base do médico > default da clínica
    const rate = resolveCommissionRate({
      overrides: doctor.commissionOverrides,
      doctorRate: doctor.commissionRate,
      clinicDefault: clinic.defaultDoctorCommission,
      treatmentTypeId: data.treatmentTypeId,
    });

    const now = new Date();
    const proc = await Procedure.create({
      clinicId: appt.clinicId, // a clínica do ato é a da consulta REAL
      patientId: appt.patientId,
      doctorId,
      treatmentTypeId: data.treatmentTypeId,
      appointmentId: appt._id,
      status: 'completed',
      nameSnapshot: treatment.name,
      priceCents: data.priceEuros, // já em cêntimos (ver validations)
      commissionRate: rate,
      commissionCents: commissionCentsOf(data.priceEuros, rate),
      toothNumbers: data.toothNumbers,
      notes: data.notes,
      executedAt: now,
    });

    await logAudit({
      userId,
      action: 'create',
      entityType: 'Procedure',
      entityId: String(proc._id),
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: `Ato registado: ${treatment.name} (${(data.priceEuros / 100).toFixed(2)} €)`,
    });

    // Recall automático se o ato tem recallIntervalMonths (best-effort:
    // nunca reverte o registo do ato; clinicId = clínica do ato)
    await spawnRecallForProcedure({
      procedureId: String(proc._id),
      clinicId: String(appt.clinicId),
      patientId: String(appt.patientId),
      doctorId,
      treatmentTypeId: data.treatmentTypeId,
      executedAt: now,
    });

    revalidatePath(`/doutor/consulta/${data.appointmentId}`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// ANULAR ATO — never delete; só atos ainda não faturados
// -----------------------------------------------------------------------------
export async function voidProcedureAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const parsed = voidProcedureSchema.safeParse({
      procedureId: formData.get('procedureId'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    const session = await auth();
    if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
      return { error: 'Sem permissões.' };
    }
    await dbConnect();

    const proc = await Procedure.findById(parsed.data.procedureId);
    if (!proc) return { error: 'Ato não encontrado.' };
    if (String(proc.doctorId) !== session.user.doctorId) {
      return { error: 'Este ato não lhe pertence.' };
    }
    if (proc.status === 'void') return { success: true }; // idempotente
    if (proc.status === 'invoiced' || proc.invoiceId) {
      return {
        error:
          'Ato já faturado — a anulação faz-se pela fatura (nota de crédito).',
      };
    }

    proc.set('status', 'void');
    proc.set('voidedAt', new Date());
    proc.set('voidedByUserId', session.user.id);
    proc.set('voidReason', parsed.data.reason);
    await proc.save();

    await logAudit({
      userId: session.user.id,
      action: 'update',
      entityType: 'Procedure',
      entityId: String(proc._id),
      patientId: String(proc.patientId),
      clinicId: String(proc.clinicId),
      summary: `Ato anulado: ${proc.nameSnapshot} — ${parsed.data.reason}`,
    });

    // Ato anulado não deve convidar ninguém: fecha o ciclo de recall que
    // este ato originou (best-effort)
    await cancelRecallForProcedure(String(proc._id));

    if (proc.appointmentId) {
      revalidatePath(`/doutor/consulta/${String(proc.appointmentId)}`);
    }
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// NOTA CLÍNICA — append-only na ficha (ClinicalRecord lazy 1:1)
// -----------------------------------------------------------------------------
export async function addClinicalNoteAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const parsed = addClinicalNoteSchema.safeParse({
      appointmentId: formData.get('appointmentId'),
      text: formData.get('text'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    const { appt, userId, doctorId } = await requireOwnAppointment(
      parsed.data.appointmentId,
    );

    // Ficha clínica criada lazy no primeiro toque clínico do paciente
    await ClinicalRecord.updateOne(
      { patientId: appt.patientId },
      {
        $setOnInsert: { patientId: appt.patientId },
        $push: {
          notes: {
            doctorId,
            appointmentId: appt._id,
            text: parsed.data.text,
            createdAt: new Date(),
          },
        },
      },
      { upsert: true },
    );

    await logAudit({
      userId,
      action: 'create',
      entityType: 'ClinicalRecord',
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: 'Nota clínica registada em consulta',
    });

    revalidatePath(`/doutor/consulta/${parsed.data.appointmentId}`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// CONCLUIR CONSULTA — in-progress → completed (+ nota final opcional)
// -----------------------------------------------------------------------------
export async function completeConsultationAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const parsed = completeConsultationSchema.safeParse({
      appointmentId: formData.get('appointmentId'),
      finalNote: formData.get('finalNote'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    const { appt, userId, doctorId } = await requireOwnAppointment(
      parsed.data.appointmentId,
    );
    if (appt.status === 'completed') return { success: true }; // idempotente
    if (appt.status !== 'in-progress') {
      return { error: 'Só é possível concluir uma consulta em curso.' };
    }

    appt.set('status', 'completed');
    appt.set('completedAt', new Date());
    await appt.save();

    if (parsed.data.finalNote) {
      await ClinicalRecord.updateOne(
        { patientId: appt.patientId },
        {
          $setOnInsert: { patientId: appt.patientId },
          $push: {
            notes: {
              doctorId,
              appointmentId: appt._id,
              text: parsed.data.finalNote,
              createdAt: new Date(),
            },
          },
        },
        { upsert: true },
      );
    }

    const actsCount = await Procedure.countDocuments({
      appointmentId: appt._id,
      status: 'completed',
    });

    await logAudit({
      userId,
      action: 'update',
      entityType: 'Appointment',
      entityId: String(appt._id),
      patientId: String(appt.patientId),
      clinicId: String(appt.clinicId),
      summary: `Consulta concluída (${actsCount} ato${actsCount === 1 ? '' : 's'})`,
    });

    revalidatePath(`/doutor/consulta/${parsed.data.appointmentId}`);
    revalidatePath('/doutor/dashboard');
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// RBAC de dados (ficha): o médico só acede a pacientes COM QUEM TEM CONSULTAS
// -----------------------------------------------------------------------------
export async function requireDoctorWithPatient(patientId: string) {
  const session = await auth();
  if (session?.user?.role !== 'doctor' || !session.user.doctorId) {
    throw new Error('Sem permissões.');
  }
  if (!OBJECT_ID.test(patientId)) throw new Error('Paciente inválido.');
  await dbConnect();

  const hasRelation = await Appointment.exists({
    doctorId: session.user.doctorId,
    patientId,
  });
  if (!hasRelation) throw new Error('Paciente não encontrado.'); // não vazar

  return { userId: session.user.id, doctorId: session.user.doctorId };
}

// -----------------------------------------------------------------------------
// ATUALIZAR ANAMNESE — secção estruturada da ficha (substituição integral)
// -----------------------------------------------------------------------------
export async function updateAnamnesisAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const parsed = updateAnamnesisSchema.safeParse({
      patientId: formData.get('patientId'),
      allergies: formData.get('allergies'),
      currentMedications: formData.get('currentMedications'),
      systemicConditions: formData.get('systemicConditions'),
      smoker: formData.get('smoker'),
      anamnesisNotes: formData.get('anamnesisNotes'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const { userId, doctorId } = await requireDoctorWithPatient(data.patientId);

    await ClinicalRecord.updateOne(
      { patientId: data.patientId },
      {
        $setOnInsert: { patientId: data.patientId },
        $set: {
          allergies: data.allergies,
          currentMedications: data.currentMedications,
          systemicConditions: data.systemicConditions,
          smoker: data.smoker,
          anamnesisNotes: data.anamnesisNotes,
          anamnesisUpdatedAt: new Date(),
          anamnesisUpdatedBy: doctorId,
        },
      },
      { upsert: true },
    );

    await logAudit({
      userId,
      action: 'update',
      entityType: 'ClinicalRecord',
      patientId: data.patientId,
      summary: `Anamnese atualizada (${data.allergies.length} alergia${data.allergies.length === 1 ? '' : 's'}, ${data.systemicConditions.length} condição${data.systemicConditions.length === 1 ? '' : 'ões'})`,
    });

    revalidatePath(`/doutor/pacientes/${data.patientId}`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// GRAVAR ODONTOGRAMA — nova VERSÃO (snapshot completo; versões antigas
// nunca se alteram — histórico "como estava em janeiro")
// -----------------------------------------------------------------------------
export async function saveOdontogramAction(
  _prev: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  try {
    const parsed = saveOdontogramSchema.safeParse({
      patientId: formData.get('patientId'),
      teeth: formData.get('teeth'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const data = parsed.data;

    const { userId, doctorId } = await requireDoctorWithPatient(data.patientId);

    // Versão sequencial otimista com retry E11000 (índice único
    // {patientId, version}) — mesmo padrão do processNumber dos pacientes
    let saved = false;
    let version = 0;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      const latest = await Odontogram.findOne({ patientId: data.patientId })
        .sort({ version: -1 })
        .select('version')
        .lean();
      version = (latest?.version ?? 0) + 1;
      try {
        await Odontogram.create({
          patientId: data.patientId,
          version,
          teeth: data.teeth,
          updatedBy: doctorId,
          appointmentId: null,
        });
        saved = true;
      } catch (err) {
        const isDup =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code?: number }).code === 11000;
        if (!isDup) throw err;
        // colisão de versão (gravação concorrente) → reler e tentar de novo
      }
    }
    if (!saved) return { error: 'Conflito ao gravar — tente novamente.' };

    await logAudit({
      userId,
      action: 'update',
      entityType: 'Odontogram',
      patientId: data.patientId,
      summary: `Odontograma v${version} gravado (${data.teeth.length} dente${data.teeth.length === 1 ? '' : 's'} assinalado${data.teeth.length === 1 ? '' : 's'})`,
    });

    revalidatePath(`/doutor/pacientes/${data.patientId}/odontograma`);
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
