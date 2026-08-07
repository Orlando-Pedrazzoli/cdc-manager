// 📄 src/components/configuracoes/CatalogTable.tsx
// =============================================================================
// CDC Manager — Configurações: Catálogo de Atos
// -----------------------------------------------------------------------------
// A tabela onde a clínica gere o catálogo SEM deploys: preço, duração, buffer,
// marcável online, recall e ativo/inativo. Quando a matriz real de preços do
// Victor chegar, é AQUI que ele a carrega sozinho.
//
// UX (regra do projeto): criar/editar acontece em MODAL e ao gravar fecha e
// a lista atualiza (fluxo incremental — ficamos na página). O toggle
// ativo/inativo é imediato na linha.
//
// Snapshots imutáveis: mudar preços aqui NUNCA afeta atos já registados —
// cada Procedure congela preço+comissão no momento do registo.
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import {
  createTreatmentTypeAction,
  updateTreatmentTypeAction,
  toggleTreatmentActiveAction,
  type SettingsActionState,
} from '@/actions/settings';
import {
  SPECIALTIES,
  SLOT_GRANULARITY_MIN,
  TREATMENT_CATEGORIES,
  type Specialty,
} from '@/lib/domain';
import { SPECIALTY_LABEL } from '@/lib/labels';
import { formatCents } from '@/lib/commissions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/Input';

// Forma serializada vinda do server (page.tsx faz o mapeamento)
/** Produto disponível para o editor de BOM (materiais consumidos) */
export interface CatalogProduct {
  id: string;
  name: string;
  unit: string;
}

export interface CatalogTreatment {
  id: string;
  slug: string;
  name: string;
  specialty: Specialty;
  /** Tipo de tratamento Dentoral (texto verbatim, ex.: 'CIRURGIA ORAL') */
  category: string | null;
  /** Código de nomenclatura/entidade (ex.: 'A1.01.01.01') — não único */
  entityCode: string | null;
  /** Código interno do Dentoral (001-748) — só nos importados, imutável */
  dentoralCode: string | null;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  costCents: number;
  bookableOnline: boolean;
  requiresEvaluation: boolean;
  controlsTooth: boolean;
  requiresRxConsent: boolean;
  recallIntervalMonths: number | null;
  notes: string | null;
  /** Materiais consumidos por execução (baixa automática ao concluir consulta) */
  bom: { productId: string; quantity: number }[];
  source: 'benchmark' | 'clinic-confirmed' | 'imported';
  active: boolean;
}

// Cêntimos → valor editável no input ("45,50"); vírgula à PT
function centsToEditableEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// =============================================================================
// Toggle ativo/inativo (linha) — action própria, imediato
// =============================================================================
function ActiveToggle({ treatment }: { treatment: CatalogTreatment }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    SettingsActionState,
    FormData
  >(toggleTreatmentActiveAction, undefined);
  const handled = useRef<SettingsActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) router.refresh();
  }, [state, router]);

  return (
    <form action={action} style={{ display: 'inline-flex' }}>
      <input type='hidden' name='id' value={treatment.id} />
      <input
        type='hidden'
        name='active'
        value={treatment.active ? 'false' : 'true'}
      />
      <button
        type='submit'
        disabled={pending}
        title={treatment.active ? 'Desativar ato' : 'Reativar ato'}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.5 : 1,
        }}
      >
        <Badge variant={treatment.active ? 'success' : 'neutral'}>
          {treatment.active ? 'Ativo' : 'Inativo'}
        </Badge>
      </button>
    </form>
  );
}

// =============================================================================
// Modal criar/editar
// =============================================================================
function TreatmentModal({
  editing,
  products,
  onClose,
}: {
  /** null = criar novo; objeto = editar */
  editing: CatalogTreatment | null;
  products: CatalogProduct[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = editing !== null;

  // --- Editor de BOM (materiais consumidos por execução) --------------------
  // Estado local; serializado como JSON num hidden input. A baixa acontece
  // automaticamente ao concluir a consulta, no armazém default da clínica.
  const [bom, setBom] = useState<{ productId: string; quantity: number }[]>(
    editing?.bom ?? [],
  );
  const productById = new Map(products.map(p => [p.id, p] as const));
  const addBomRow = () => {
    const firstFree = products.find(p => !bom.some(b => b.productId === p.id));
    if (!firstFree) return;
    setBom([...bom, { productId: firstFree.id, quantity: 1 }]);
  };

  // Duas actions distintas → dois hooks; só um form é submetido de cada vez
  const [createState, createAction, createPending] = useActionState<
    SettingsActionState,
    FormData
  >(createTreatmentTypeAction, undefined);
  const [updateState, updateAction, updatePending] = useActionState<
    SettingsActionState,
    FormData
  >(updateTreatmentTypeAction, undefined);

  const state = isEdit ? updateState : createState;
  const pending = isEdit ? updatePending : createPending;
  const handled = useRef<SettingsActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error, { duration: 7000 });
    if ('success' in state) {
      toast.success(isEdit ? 'Ato atualizado' : 'Ato criado', {
        duration: 5000,
      });
      onClose();
      router.refresh();
    }
  }, [state, isEdit, onClose, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar ato — ${editing.name}` : 'Novo ato'}
      maxWidth={620}
    >
      <form action={isEdit ? updateAction : createAction}>
        {isEdit && <input type='hidden' name='id' value={editing.id} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            id='ttype-name'
            name='name'
            label='Nome do ato'
            defaultValue={editing?.name ?? ''}
            placeholder='Ex.: Destartarização'
            required
            maxLength={160}
          />

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Select
                id='ttype-specialty'
                name='specialty'
                label='Especialidade'
                defaultValue={editing?.specialty ?? ''}
                required
              >
                <option value='' disabled>
                  Selecionar…
                </option>
                {SPECIALTIES.map(s => (
                  <option key={s} value={s}>
                    {SPECIALTY_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              {/* Texto livre com datalist (como as famílias do stock):
                  categorias Dentoral sugeridas, mas a clínica pode criar
                  novas sem deploy */}
              <Input
                id='ttype-category'
                name='category'
                label='Tipo de tratamento'
                defaultValue={editing?.category ?? ''}
                placeholder='Ex.: CIRURGIA ORAL'
                maxLength={60}
                list='ttype-category-options'
              />
              <datalist id='ttype-category-options'>
                {TREATMENT_CATEGORIES.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Input
                id='ttype-entity-code'
                name='entityCode'
                label='Cód. nomenclatura'
                defaultValue={editing?.entityCode ?? ''}
                placeholder='A1.01.01.01'
                maxLength={20}
                help='Código de entidade (informativo)'
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id='ttype-price'
                name='priceEuros'
                label='Preço (€)'
                defaultValue={
                  editing ? centsToEditableEuros(editing.priceCents) : ''
                }
                placeholder='45,00'
                inputMode='decimal'
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id='ttype-cost'
                name='costEuros'
                label='Custo (€)'
                defaultValue={
                  editing && editing.costCents > 0
                    ? centsToEditableEuros(editing.costCents)
                    : ''
                }
                placeholder='0,00'
                inputMode='decimal'
                help='Materiais/laboratório (margem)'
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Input
                id='ttype-duration'
                name='durationMin'
                label='Duração (min)'
                type='number'
                min={SLOT_GRANULARITY_MIN}
                max={480}
                step={SLOT_GRANULARITY_MIN}
                defaultValue={editing?.durationMin ?? 30}
                required
                help={`Múltipla de ${SLOT_GRANULARITY_MIN} min (grelha da agenda)`}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id='ttype-buffer'
                name='bufferMin'
                label='Buffer (min)'
                type='number'
                min={0}
                max={120}
                step={5}
                defaultValue={editing?.bufferMin ?? 10}
                required
                help='Preparação do gabinete após a consulta'
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id='ttype-recall'
                name='recallIntervalMonths'
                label='Recall (meses)'
                type='number'
                min={1}
                max={60}
                defaultValue={editing?.recallIntervalMonths ?? ''}
                placeholder='—'
                help='Vazio = sem recall automático'
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Checkbox
              id='ttype-online'
              name='bookableOnline'
              label='Marcável online (aparece no formulário público)'
              defaultChecked={editing?.bookableOnline ?? false}
            />
            <Checkbox
              id='ttype-eval'
              name='requiresEvaluation'
              label='Exige consulta de avaliação prévia'
              defaultChecked={editing?.requiresEvaluation ?? true}
            />
            <Checkbox
              id='ttype-tooth'
              name='controlsTooth'
              label='Controla dente (exige nº de dente ao registar o ato)'
              defaultChecked={editing?.controlsTooth ?? false}
            />
            <Checkbox
              id='ttype-rx'
              name='requiresRxConsent'
              label='Exige consentimento RX assinado'
              defaultChecked={editing?.requiresRxConsent ?? false}
            />
            <Checkbox
              id='ttype-confirmed'
              name='clinicConfirmed'
              label='Duração e preço confirmados pela clínica'
              defaultChecked={editing?.source === 'clinic-confirmed'}
              help='Desmarcado = valores de benchmark ainda por validar'
            />
          </div>

          <Textarea
            id='ttype-notes'
            name='notes'
            label='Notas internas'
            defaultValue={editing?.notes ?? ''}
            maxLength={500}
            rows={2}
          />

          {/* --- Materiais consumidos (BOM) --------------------------------- */}
          <div
            style={{
              border: '1px solid #E4E8F2',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#1C2233',
                  }}
                >
                  Materiais consumidos por execução
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: '#9AA1B4',
                  }}
                >
                  Baixa automática no stock ao concluir a consulta (armazém
                  principal da clínica)
                </p>
              </div>
              <Button
                type='button'
                variant='secondary'
                onClick={addBomRow}
                disabled={products.length === 0 || bom.length >= 40}
              >
                + Material
              </Button>
            </div>

            {products.length === 0 && (
              <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
                Sem produtos ativos no stock — crie-os primeiro em Stock.
              </p>
            )}

            {bom.map((row, idx) => {
              const unit = productById.get(row.productId)?.unit ?? '';
              return (
                <div
                  key={`${row.productId}-${idx}`}
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <select
                    aria-label='Produto'
                    value={row.productId}
                    onChange={e =>
                      setBom(
                        bom.map((b, i) =>
                          i === idx ? { ...b, productId: e.target.value } : b,
                        ),
                      )
                    }
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #E4E8F2',
                      fontSize: '13px',
                      color: '#1C2233',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {products.map(p => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={
                          p.id !== row.productId &&
                          bom.some(b => b.productId === p.id)
                        }
                      >
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label='Quantidade'
                    type='number'
                    min={0.001}
                    step='any'
                    value={row.quantity}
                    onChange={e =>
                      setBom(
                        bom.map((b, i) =>
                          i === idx
                            ? { ...b, quantity: Number(e.target.value) }
                            : b,
                        ),
                      )
                    }
                    style={{
                      width: 90,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #E4E8F2',
                      fontSize: '13px',
                      color: '#1C2233',
                    }}
                  />
                  <span
                    style={{ fontSize: '12px', color: '#9AA1B4', width: 40 }}
                  >
                    {unit}
                  </span>
                  <button
                    type='button'
                    aria-label='Remover material'
                    onClick={() => setBom(bom.filter((_, i) => i !== idx))}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#B4232A',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                  >
                    Remover
                  </button>
                </div>
              );
            })}

            {/* Serialização para a server action (validada por Zod) */}
            <input
              type='hidden'
              name='bom'
              value={JSON.stringify(
                bom.filter(b => b.productId && b.quantity > 0),
              )}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '4px',
            }}
          >
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit' variant='primary' disabled={pending}>
              {pending
                ? 'A gravar…'
                : isEdit
                  ? 'Gravar alterações'
                  : 'Criar ato'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Tabela principal
// =============================================================================
export function CatalogTable({
  treatments,
  products,
}: {
  treatments: CatalogTreatment[];
  products: CatalogProduct[];
}) {
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState<'' | Specialty>('');
  const [category, setCategory] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<
    { mode: 'create' } | { mode: 'edit'; treatment: CatalogTreatment } | null
  >(null);

  // Categorias realmente presentes nos dados (não a lista canónica) —
  // com 749 atos importados, filtrar por tipo é o gesto principal do Victor
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of treatments) if (t.category) set.add(t.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [treatments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return treatments.filter(t => {
      if (!showInactive && !t.active) return false;
      if (specialty && t.specialty !== specialty) return false;
      if (category && t.category !== category) return false;
      if (
        q &&
        !t.name.toLowerCase().includes(q) &&
        !(t.entityCode ?? '').toLowerCase().includes(q) &&
        !(t.dentoralCode ?? '').includes(q)
      )
        return false;
      return true;
    });
  }, [treatments, search, specialty, category, showInactive]);

  const unconfirmedCount = treatments.filter(
    t => t.active && t.source !== 'clinic-confirmed',
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Aviso: quantos atos ainda têm valores de benchmark por confirmar */}
      {unconfirmedCount > 0 && (
        <div
          style={{
            backgroundColor: '#FEF3E0',
            border: '1px solid #F2D9AE',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#B06000',
          }}
        >
          {unconfirmedCount === 1
            ? '1 ato ativo está por confirmar pela clínica'
            : `${unconfirmedCount} atos ativos estão por confirmar pela clínica`}{' '}
          — reveja duração, preço e flags e marque «confirmado pela clínica».
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ width: 260 }}>
          <Input
            id='catalog-search'
            label='Pesquisar'
            placeholder='Nome do ato…'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ width: 200 }}>
          <Select
            id='catalog-specialty'
            label='Especialidade'
            value={specialty}
            onChange={e => setSpecialty(e.target.value as '' | Specialty)}
          >
            <option value=''>Todas</option>
            {SPECIALTIES.map(s => (
              <option key={s} value={s}>
                {SPECIALTY_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        {categories.length > 0 && (
          <div style={{ width: 240 }}>
            <Select
              id='catalog-category'
              label='Tipo de tratamento'
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value=''>Todos</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div style={{ paddingBottom: '10px' }}>
          <Checkbox
            id='catalog-inactive'
            label='Mostrar inativos'
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            type='button'
            variant='primary'
            onClick={() => setModal({ mode: 'create' })}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            Novo ato
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8F9FD' }}>
              {[
                'Ato',
                'Especialidade',
                'Duração',
                'Preço',
                'Online',
                'Recall',
                'Fonte',
                'Estado',
                '',
              ].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color: '#6A7186',
                    borderBottom: '1px solid #EEF1F8',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    padding: '28px 14px',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#6A7186',
                  }}
                >
                  Nenhum ato corresponde aos filtros.
                </td>
              </tr>
            )}
            {filtered.map(t => (
              <tr
                key={t.id}
                style={{
                  borderBottom: '1px solid #F4F6FB',
                  opacity: t.active ? 1 : 0.55,
                }}
              >
                <td style={{ padding: '10px 14px' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1C2233',
                    }}
                  >
                    {t.name}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      color: '#9AA1B4',
                    }}
                  >
                    {/* Importados: código Dentoral + nomenclatura (a
                        linguagem do Victor); restantes: slug técnico */}
                    {t.dentoralCode
                      ? [t.dentoralCode, t.entityCode]
                          .filter(Boolean)
                          .join(' · ')
                      : t.slug}
                  </p>
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: '#454C63',
                  }}
                >
                  {SPECIALTY_LABEL[t.specialty]}
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: '#454C63',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.durationMin}
                  {t.bufferMin > 0 ? ` + ${t.bufferMin}` : ''} min
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1C2233',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCents(t.priceCents)}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {t.bookableOnline ? (
                    <Badge variant='info'>Online</Badge>
                  ) : (
                    <span style={{ fontSize: '13px', color: '#9AA1B4' }}>
                      —
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: '#454C63',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.recallIntervalMonths
                    ? `${t.recallIntervalMonths} meses`
                    : '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <Badge
                    variant={
                      t.source === 'clinic-confirmed' ? 'success' : 'warning'
                    }
                  >
                    {t.source === 'clinic-confirmed'
                      ? 'Confirmado'
                      : t.source === 'imported'
                        ? 'Importado'
                        : 'Benchmark'}
                  </Badge>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <ActiveToggle treatment={t} />
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => setModal({ mode: 'edit', treatment: t })}
                  >
                    <Pencil size={14} style={{ marginRight: 4 }} />
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* key força remount ao trocar de alvo — limpa defaultValue e handled */}
      {modal && (
        <TreatmentModal
          key={modal.mode === 'edit' ? modal.treatment.id : 'create'}
          editing={modal.mode === 'edit' ? modal.treatment : null}
          products={products}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
