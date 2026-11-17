// 📄 src/actions/knowledge.ts
'use server';
// =============================================================================
// CDC Manager — Protocolos internos e Treinamento: gravar (8.ª ronda/07, 08)
// Só a gestão escreve, publica e arquiva. Ver src/lib/knowledge.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import { logAudit } from '@/lib/audit';
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_SECTIONS } from '@/lib/knowledge';
import { TRAINING_STARTER } from '@/lib/data/training-starter';
import KnowledgeArticle from '@/models/KnowledgeArticle';
import User from '@/models/User';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export type KnowledgeActionState =
  | { success: true; message: string }
  | { error: string }
  | undefined;

const emptyToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const schema = z.object({
  id: z.preprocess(emptyToNull, z.string().regex(OBJECT_ID).nullable().default(null)),
  section: z.enum(KNOWLEDGE_SECTIONS),
  audience: z.enum(KNOWLEDGE_AUDIENCES).default('reception'),
  title: z.string().trim().min(3, 'Indique o título').max(160),
  keywords: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().default(null)),
  body: z.string().trim().min(10, 'Escreva o texto').max(20000),
  published: z.preprocess(v => v === 'on' || v === 'true', z.boolean()),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Só a gestão pode alterar este conteúdo.');
  }
  await dbConnect();
  const user = await User.findById(session.user.id).select('role status').lean();
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    throw new Error('Conta inativa ou permissões alteradas.');
  }
  return session.user;
}

function revalidate() {
  revalidatePath('/admin/protocolos');
  revalidatePath('/admin/treinamento');
  revalidatePath('/doutor/treinamento');
}

export async function saveKnowledgeArticleAction(
  _prev: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  try {
    const user = await requireAdmin();
    const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const d = parsed.data;
    const fields = {
      section: d.section,
      audience: d.section === 'protocol' ? ('reception' as const) : d.audience,
      title: d.title,
      keywords: d.keywords,
      body: d.body,
      published: d.published,
      updatedByUserId: user.id,
    };
    let entityId: string;
    if (d.id) {
      const res = await KnowledgeArticle.updateOne({ _id: d.id }, { $set: fields });
      if (res.matchedCount === 0) return { error: 'Artigo não encontrado.' };
      entityId = d.id;
    } else {
      const created = await KnowledgeArticle.create({
        ...fields,
        createdByUserId: user.id,
      });
      entityId = String(created._id);
    }
    await logAudit({
      userId: user.id,
      action: d.id ? 'update' : 'create',
      entityType: 'KnowledgeArticle',
      entityId,
      summary: `${d.section === 'protocol' ? 'Protocolo' : 'Treinamento'} ${d.id ? 'atualizado' : 'criado'}: ${d.title}${d.published ? '' : ' (rascunho)'}`,
    });
    revalidate();
    return {
      success: true,
      message: d.published ? 'Gravado e publicado.' : 'Gravado como rascunho.',
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

/** Publicar / voltar a rascunho, ou arquivar. Nada é apagado. */
export async function setKnowledgeArticleStateAction(
  id: string,
  change: { published?: boolean; active?: boolean },
): Promise<KnowledgeActionState> {
  try {
    const user = await requireAdmin();
    if (!OBJECT_ID.test(id)) return { error: 'Artigo inválido.' };
    const $set: Record<string, unknown> = { updatedByUserId: user.id };
    if (typeof change.published === 'boolean') $set.published = change.published;
    if (typeof change.active === 'boolean') $set.active = change.active;
    const art = await KnowledgeArticle.findByIdAndUpdate(id, { $set }, { new: true })
      .select('title')
      .lean();
    if (!art) return { error: 'Artigo não encontrado.' };
    await logAudit({
      userId: user.id,
      action: 'update',
      entityType: 'KnowledgeArticle',
      entityId: id,
      summary: `Artigo "${art.title}": ${
        change.active === false
          ? 'arquivado'
          : change.published
            ? 'publicado'
            : 'voltou a rascunho'
      }`,
    });
    revalidate();
    return { success: true, message: 'Atualizado.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}

/**
 * Carrega o conteúdo inicial do treinamento como RASCUNHOS, para a gestão
 * rever e publicar. Não toca nos artigos que já existam (mesmo slug).
 */
export async function loadTrainingStarterAction(): Promise<KnowledgeActionState> {
  try {
    const user = await requireAdmin();
    const existing = await KnowledgeArticle.find({
      section: 'training',
      slug: { $in: TRAINING_STARTER.map(t => t.slug) },
    })
      .select('slug')
      .lean();
    const have = new Set(existing.map(e => e.slug));
    const missing = TRAINING_STARTER.filter(t => !have.has(t.slug));
    if (missing.length === 0) {
      return { success: true, message: 'O conteúdo inicial já estava carregado.' };
    }
    await KnowledgeArticle.insertMany(
      missing.map(t => ({
        section: 'training',
        audience: t.audience,
        slug: t.slug,
        title: t.title,
        keywords: t.keywords,
        body: t.body,
        order: TRAINING_STARTER.indexOf(t) * 10,
        published: false,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      })),
    );
    await logAudit({
      userId: user.id,
      action: 'create',
      entityType: 'KnowledgeArticle',
      summary: `Treinamento: ${missing.length} artigos iniciais carregados como rascunho`,
    });
    revalidate();
    return {
      success: true,
      message: `${missing.length} artigos carregados como rascunho. Reveja e publique cada um.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
