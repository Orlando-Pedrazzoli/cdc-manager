// 📄 src/models/LabCase.ts
// =============================================================================
// CDC Manager — Casos de laboratório (próteses enviadas a empresa externa)
// -----------------------------------------------------------------------------
// Checkpoints (visão da CLÍNICA, não do laboratório):
//   sent → received → delivered      (+ cancelled, nunca apagar)
// "Atrasada" NÃO é estado — é derivado: status='sent' e dueDate já passou.
// Assim o alerta desliga-se sozinho quando a receção marca a chegada.
//
// Datas sentAt/dueDate guardadas ao MEIO-DIA de Lisboa (semântica de
// data-sem-hora sem deriva de fuso — padrão das exceções dos médicos).
// remakeOfId/remakeReason preparados para a v2 (tracking de remakes com
// motivo, ligados ao caso original — best practice dos sistemas de lab).
// =============================================================================

import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { LAB_WORK_TYPES, LAB_CASE_STATUSES } from '@/lib/domain';

const LabCaseSchema = new Schema(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    // Apontamento 05 (2.ª reunião): "atribuir o laboratório na marcação,
    // ligando trabalho, laboratório e paciente". Marcação de retorno /
    // colocação a que este trabalho se destina (opcional — o pedido pode
    // ser registado antes de haver marcação). A agenda sinaliza LAB nessa
    // marcação independentemente da data prevista de chegada.
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true,
    },

    // --- O trabalho ---------------------------------------------------------
    // E3: laboratório = Fornecedor com pisco "laboratório" (Supplier.isLab).
    // `labName` mantém-se como SNAPSHOT do nome (casos anteriores à Fase 2
    // não têm supplierId; relatórios e listagens continuam a ler labName).
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
      index: true,
    },
    labName: { type: String, required: true, trim: true, maxlength: 120 },
    workType: { type: String, enum: LAB_WORK_TYPES, required: true },
    // Dentes/zona em texto livre ("14–16 ponte", "arcada sup.") — as
    // próteses abrangem grupos e arcadas, FDI estrito seria camisa de força
    toothNotes: { type: String, trim: true, maxlength: 60, default: null },
    shade: { type: String, trim: true, maxlength: 20, default: null }, // cor (ex.: A2)
    notes: { type: String, trim: true, maxlength: 300, default: null },
    // Custo de laboratório (cêntimos inteiros — convenção do projeto)
    costCents: { type: Number, min: 0, default: null },

    // --- Checkpoints --------------------------------------------------------
    status: {
      type: String,
      enum: LAB_CASE_STATUSES,
      required: true,
      default: 'sent',
    },
    sentAt: { type: Date, required: true },
    dueDate: { type: Date, required: true }, // data prevista de chegada
    receivedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },

    // --- Remake (v2 — ligação ao caso original com motivo) ------------------
    remakeOfId: {
      type: Schema.Types.ObjectId,
      ref: 'LabCase',
      default: null,
    },
    remakeReason: { type: String, trim: true, maxlength: 200, default: null },

    // --- Never-delete -------------------------------------------------------
    cancelledAt: { type: Date, default: null },
    cancelledByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelReason: { type: String, trim: true, maxlength: 200, default: null },

    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

// Fila operacional: em curso por data prevista (atrasadas primeiro)
LabCaseSchema.index({ status: 1, dueDate: 1 });
LabCaseSchema.index({ clinicId: 1, status: 1, dueDate: 1 });
LabCaseSchema.index({ patientId: 1, createdAt: -1 });

export type LabCaseDoc = InferSchemaType<typeof LabCaseSchema>;

const LabCase =
  (mongoose.models.LabCase as mongoose.Model<LabCaseDoc>) ||
  mongoose.model<LabCaseDoc>('LabCase', LabCaseSchema);

export default LabCase;
