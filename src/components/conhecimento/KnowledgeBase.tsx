// 📄 src/components/conhecimento/KnowledgeBase.tsx
'use client';
// =============================================================================
// CDC Manager — Protocolos internos e Treinamento: pesquisa, leitura e edição
// (8.ª ronda/07 e 08). A equipa pesquisa e lê; só a gestão escreve e publica.
// =============================================================================

import { useActionState, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import {
  loadTrainingStarterAction,
  saveKnowledgeArticleAction,
  setKnowledgeArticleStateAction,
  type KnowledgeActionState,
} from '@/actions/knowledge';
import {
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_AUDIENCE_LABEL,
  searchKnowledge,
  type KnowledgeAudience,
  type KnowledgeSection,
} from '@/lib/knowledge';

export interface KnowledgeRow {
  id: string;
  audience: KnowledgeAudience;
  title: string;
  keywords: string | null;
  body: string;
  published: boolean;
  updatedLabel: string;
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: '999px',
  border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
  backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
  color: active ? '#FFFFFF' : '#1B2A6B',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
});

export function KnowledgeBase({
  section,
  articles,
  canEdit,
  audiences,
}: {
  section: KnowledgeSection;
  articles: KnowledgeRow[];
  canEdit: boolean;
  /** Versões que este utilizador pode ler (só no treinamento) */
  audiences: KnowledgeAudience[];
}) {
  const router = useRouter();
  const isTraining = section === 'training';
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<KnowledgeAudience>(audiences[0] ?? 'reception');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeRow | 'new' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [state, formAction, saving] = useActionState<KnowledgeActionState, FormData>(
    async (prev, fd) => {
      const res = await saveKnowledgeArticleAction(prev, fd);
      if (res && 'success' in res) {
        setEditing(null);
        setNotice({ ok: true, text: res.message });
        router.refresh();
      }
      return res;
    },
    undefined,
  );

  const visible = useMemo(() => {
    const scoped = isTraining ? articles.filter(a => a.audience === audience) : articles;
    return searchKnowledge(scoped, query);
  }, [articles, audience, isTraining, query]);

  const run = (fn: () => Promise<KnowledgeActionState>) => {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res && 'error' in res) setNotice({ ok: false, text: res.error });
      else {
        if (res) setNotice({ ok: true, text: res.message });
        router.refresh();
      }
    });
  };

  const current = editing && editing !== 'new' ? editing : null;
  const noun = isTraining ? 'artigo' : 'protocolo';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A93A8' }}
          />
          <input
            type='search'
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              isTraining
                ? 'Pesquisar no treinamento… (ex.: remarcar, cobrança)'
                : 'Pesquisar protocolo… (ex.: reclamações, fornecedores)'
            }
            aria-label='Pesquisar'
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: '10px',
              border: '1px solid #B9C3E0',
              fontSize: '14px',
              color: '#1C2233',
              backgroundColor: '#FFFFFF',
            }}
          />
        </div>
        {canEdit && editing === null && (
          <Button onClick={() => setEditing('new')}>
            {isTraining ? 'Novo artigo' : 'Novo protocolo'}
          </Button>
        )}
        {canEdit && isTraining && editing === null && (
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => run(() => loadTrainingStarterAction())}
            title='Carrega os textos iniciais de cada área como rascunho, para rever e publicar'
          >
            Carregar conteúdo inicial
          </Button>
        )}
      </div>

      {isTraining && audiences.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {audiences.map(a => (
            <button key={a} type='button' aria-pressed={audience === a} onClick={() => setAudience(a)} style={pill(audience === a)}>
              {KNOWLEDGE_AUDIENCE_LABEL[a]} · {articles.filter(x => x.audience === a).length}
            </button>
          ))}
        </div>
      )}

      {notice && (
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: notice.ok ? '#125C32' : '#B3261E' }}>
          {notice.text}
        </p>
      )}

      {editing !== null && (
        <form
          key={current?.id ?? 'new'}
          action={formAction}
          style={{
            border: '1px solid #E3E7F2',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            backgroundColor: '#FAFBFE',
          }}
        >
          <input type='hidden' name='section' value={section} />
          <input type='hidden' name='id' value={current?.id ?? ''} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Input name='title' label='Título *' defaultValue={current?.title ?? ''} required maxLength={160} />
            {isTraining && (
              <Select name='audience' label='Versão' defaultValue={current?.audience ?? audience}>
                {KNOWLEDGE_AUDIENCES.map(a => (
                  <option key={a} value={a}>
                    {KNOWLEDGE_AUDIENCE_LABEL[a]}
                  </option>
                ))}
              </Select>
            )}
            <Input
              name='keywords'
              label='Palavras para a pesquisa'
              placeholder='Ex.: reclamação livro queixa'
              defaultValue={current?.keywords ?? ''}
              maxLength={300}
            />
          </div>
          <Textarea
            name='body'
            label='Texto *'
            rows={14}
            defaultValue={current?.body ?? ''}
            required
            maxLength={20000}
            style={{ fontSize: '13px', lineHeight: 1.5 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#1C2233' }}>
            <input type='checkbox' name='published' defaultChecked={current?.published ?? !isTraining} />
            Publicado (visível para a equipa). Sem esta opção fica como rascunho, só para a gestão.
          </label>
          {state && 'error' in state && (
            <p style={{ margin: 0, fontSize: '13px', color: '#B3261E' }}>{state.error}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type='submit' disabled={saving}>
              {saving ? 'A gravar…' : 'Gravar'}
            </Button>
            <Button variant='outline' onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          {query.trim()
            ? `Nenhum ${noun} com "${query.trim()}".`
            : isTraining
              ? canEdit
                ? 'Ainda não há artigos nesta versão. Use "Carregar conteúdo inicial" para começar com os textos de base e reveja cada um antes de publicar.'
                : 'Ainda não há artigos publicados.'
              : canEdit
                ? 'Ainda não há protocolos. Use "Novo protocolo" para escrever o primeiro.'
                : 'Ainda não há protocolos publicados.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(a => {
            const open = openId === a.id || (query.trim() !== '' && visible.length === 1);
            return (
              <li
                key={a.id}
                style={{
                  border: '1px solid #EEF1F8',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  overflow: 'hidden',
                }}
              >
                <button
                  type='button'
                  aria-expanded={open}
                  onClick={() => setOpenId(openId === a.id ? null : a.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
                    {a.title}
                    {!a.published && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '1px 8px',
                          borderRadius: '999px',
                          backgroundColor: '#FFF4D6',
                          color: '#6B5200',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        Rascunho
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '12px', color: '#8A93A8', whiteSpace: 'nowrap' }}>
                    {open ? 'Fechar' : 'Abrir'}
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '0 16px 14px' }}>
                    <div style={{ fontSize: '14px', lineHeight: 1.6, color: '#1C2233', whiteSpace: 'pre-wrap' }}>
                      {a.body}
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#8A93A8' }}>Atualizado a {a.updatedLabel}</span>
                      {canEdit && (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Button size='sm' variant='outline' onClick={() => setEditing(a)}>
                            Editar
                          </Button>
                          <Button
                            size='sm'
                            variant={a.published ? 'outline' : 'primary'}
                            disabled={pending}
                            onClick={() =>
                              run(() => setKnowledgeArticleStateAction(a.id, { published: !a.published }))
                            }
                          >
                            {a.published ? 'Voltar a rascunho' : 'Publicar'}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={pending}
                            onClick={() => run(() => setKnowledgeArticleStateAction(a.id, { active: false }))}
                          >
                            Arquivar
                          </Button>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
