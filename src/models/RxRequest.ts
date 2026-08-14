// 📄 src/models/RxRequest.ts
// =============================================================================
// CDC Manager — Model: RxRequest (pedido de Raio-X)
// -----------------------------------------------------------------------------
// O fluxo diário real das clínicas: o médico faz a triagem no gabinete e em
// ~99% dos casos envia o paciente à sala de RX. Este model é o PEDIDO que
// viaja do gabinete para a sala: o operador vê a fila em /admin/rx, inicia
// e conclui; o médico acompanha o estado na consulta.
//
// INTEGRAÇÃO DE IMAGENS (fase 2 — aguarda sessão técnica com parceiros
// Dentoral/MyRay, cf. email PCM 05/08/2026): o campo imageRefs é o ponto de
// ancoragem. Quando a ponte ficar definida (leitura das pastas
// \\192.30.20.1\NNT / NNTBuraca / IRYS_DB_COLOMBO ou export DICOM/TWAIN),
// o agente de sincronização preenche imageRefs e as imagens aparecem na
// consulta SEM mudar nada neste fluxo.
//
// Convenções firmes: never delete (cancelamento com autor+motivo), estados
// via máquina validada em domain.ts, clinicId em tudo (fila é POR CLÍNICA —
// cada unidade tem a sua sala de RX), RBAC estrito (médico pede e cancela o
// SEU; staff opera a fila).
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import {
  RX_MODALITIES,
  RX_STATUS,
  type RxModality,
  type RxStatus,
} from '@/lib/domain';

// Reexport para quem importa via model (padrão do projeto)
export { RX_MODALITIES, RX_STATUS };
export type { RxModality, RxStatus };

// FDI: definitivos 11–48, decíduos 51–85 (mesma regex do Procedure)
const FDI_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

// Referência de imagem — preenchida pela ponte na fase 2 (ou upload manual)
const ImageRefSchema = new Schema(
  {
    // Origem: sistema de aquisição (alinha com o parque real) ou manual
    source: {
      type: String,
      enum: ['irys', 'csimaging', 'manual'],
      required: true,
    },
    // Identificador no sistema de origem (caminho na pasta partilhada,
    // ID DICOM, public_id Cloudinary…) — string opaca, a ponte define
    externalRef: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    // URL de visualização quando disponível (Cloudinary assinado, etc.)
    url: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const RxRequestSchema = new Schema(
  {
    // Clínica do pedido — a fila da sala de RX é por clínica
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    // Médico que pediu (RBAC: só ele cancela; só ele pede nas suas consultas)
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    // Consulta de origem — o pedido nasce SEMPRE numa consulta em curso
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    modality: {
      type: String,
      enum: RX_MODALITIES,
      required: true,
    },
    // Dentes-alvo (periapical/bitewing); panorâmica não usa
    toothNumbers: {
      type: [
        {
          type: String,
          match: [FDI_REGEX, 'Dente inválido (notação FDI)'],
        },
      ],
      default: [],
    },
    // Instrução ao operador ("apical do 36, suspeita de fratura")
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    status: {
      type: String,
      enum: RX_STATUS,
      default: 'requested',
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Operador que concluiu (User admin/receção)
    completedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Never delete: cancelamento com autor e motivo
    cancelledByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    // Fase 2 — imagens associadas pela ponte iRYS/CS Imaging
    imageRefs: {
      type: [ImageRefSchema],
      default: [],
    },
    // Hook para o B.6: consentimento RX assinado associado ao pedido
    consentDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'PatientDocument',
      default: null,
    },
  },
  { timestamps: true },
);

// Fila da sala de RX: pendentes por clínica, mais antigos primeiro
RxRequestSchema.index({ clinicId: 1, status: 1, requestedAt: 1 });
// Painel da consulta e histórico da ficha
RxRequestSchema.index({ appointmentId: 1, requestedAt: 1 });
RxRequestSchema.index({ patientId: 1, requestedAt: -1 });

export type RxRequestDoc = InferSchemaType<typeof RxRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

const RxRequest: Model<RxRequestDoc> =
  (mongoose.models.RxRequest as Model<RxRequestDoc>) ??
  mongoose.model<RxRequestDoc>('RxRequest', RxRequestSchema);

export default RxRequest;
