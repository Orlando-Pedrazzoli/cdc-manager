// 📄 src/models/KnowledgeArticle.ts
// =============================================================================
// CDC Manager — Artigo de Protocolos internos / Treinamento (8.ª ronda/07, 08)
// Ver src/lib/knowledge.ts. `published: false` = rascunho, só a gestão vê
// ("revisto por nós antes de publicar").
// =============================================================================

import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_SECTIONS } from '@/lib/knowledge';

const KnowledgeArticleSchema = new Schema(
  {
    section: { type: String, enum: KNOWLEDGE_SECTIONS, required: true, index: true },
    audience: { type: String, enum: KNOWLEDGE_AUDIENCES, default: 'reception' },
    /** Identificador estável do conteúdo inicial (para não o duplicar) */
    slug: { type: String, trim: true, maxlength: 80, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    /** Palavras por que a receção pode procurar ("reclamação", "acidente") */
    keywords: { type: String, trim: true, maxlength: 300, default: null },
    body: { type: String, required: true, maxlength: 20000 },
    order: { type: Number, default: 100 },
    published: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

KnowledgeArticleSchema.index({ section: 1, active: 1, order: 1, title: 1 });

export type KnowledgeArticleDoc = InferSchemaType<typeof KnowledgeArticleSchema> & {
  _id: mongoose.Types.ObjectId;
};

const KnowledgeArticle: Model<KnowledgeArticleDoc> =
  (mongoose.models.KnowledgeArticle as Model<KnowledgeArticleDoc>) ??
  mongoose.model<KnowledgeArticleDoc>('KnowledgeArticle', KnowledgeArticleSchema);

export default KnowledgeArticle;
