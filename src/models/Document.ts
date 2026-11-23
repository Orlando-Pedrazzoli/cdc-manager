// 📄 src/models/Document.ts
// =============================================================================
// CDC Manager — Model: Document
// -----------------------------------------------------------------------------
// Ficheiro clínico/administrativo do paciente no Cloudflare R2: radiografias,
// TAC, fotografias clínicas, consentimentos assinados, relatórios externos.
// Guardamos METADADOS + publicId (a chave do ficheiro); o binário vive num
// bucket R2 PRIVADO, jurisdição UE (nunca URLs públicas — dados de saúde).
// As URLs de visualização/download são pré-assinadas, com validade curta,
// e geradas on-demand em lib/storage.ts.
//
// Convenções:
// · _id do Document É o sufixo da chave ({root}/pacientes/{_id}) — IDs
//   opacos, nunca nome do paciente nem nº de processo no caminho.
//   O nome "publicId" vem da Cloudinary (até 11/2026); as chaves no R2
//   são as mesmas, por isso o campo manteve o nome.
// · NEVER DELETE: anular = voidedAt + autor + motivo (padrão Procedure).
//   O ficheiro fica no R2; remoção física só em apagamento RGPD
//   deliberado (deleteObjectAndDerivatives em lib/storage.ts).
// · DOCUMENT_CATEGORIES vive em lib/domain.ts (o client usa no select de
//   upload); aqui importa-se e RE-EXPORTA — código server importa do model.
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/domain';

export { DOCUMENT_CATEGORIES };
export type { DocumentCategory };

const DocumentSchema = new Schema(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    // Armazenamento (R2) — chave do ficheiro
    publicId: { type: String, required: true, unique: true },
    resourceType: {
      type: String,
      enum: ['image', 'raw'], // raw = DICOM e outros não-imagem (PDF entra como image)
      required: true,
    },
    format: { type: String, trim: true, default: null }, // jpg, png, pdf, dcm
    bytes: { type: Number, min: 0, default: 0 },
    // Visível ao paciente no portal? (RX sim; notas internas não)
    visibleToPatient: {
      type: Boolean,
      default: false,
      index: true,
    },
    uploadedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    note: { type: String, trim: true, maxlength: 300, default: null },
    // --- Anulação (never delete) --------------------------------------------
    voidedAt: { type: Date, default: null },
    voidedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    voidReason: { type: String, trim: true, maxlength: 300, default: null },
    // --- Migração Dentoral ---------------------------------------------------
    // legacyId: chave idempotente do import (scripts/migracao). legacyData:
    // campos originais sem lugar no modelo, guardados para consulta/auditoria.
    legacyId: {
      type: String,
      default: null,
      index: true,
    },
    legacyData: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

DocumentSchema.index({ patientId: 1, category: 1, createdAt: -1 });

export type DocumentDoc = InferSchemaType<typeof DocumentSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ClinicalDocument: Model<DocumentDoc> =
  (mongoose.models.Document as Model<DocumentDoc>) ??
  mongoose.model<DocumentDoc>('Document', DocumentSchema);

export default ClinicalDocument;
