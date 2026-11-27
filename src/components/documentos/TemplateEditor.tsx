// 📄 src/components/documentos/TemplateEditor.tsx
// =============================================================================
// CDC Manager — Admin: editor de um modelo de documento (Fase 5A, P14)
// =============================================================================

'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import {
  saveTemplateAction,
  toggleTemplateAction,
  type TemplateFormState,
} from '@/actions/document-templates';
import {
  TEMPLATE_FOLDERS,
  TEMPLATE_FOLDER_LABEL,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABEL,
  PLACEHOLDERS,
} from '@/lib/data/document-templates';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export interface TemplateInitial {
  id: string;
  kind: string;
  /** 8.ª ronda/06: pasta (especialidade) */
  folder?: string;
  title: string;
  body: string;
  allowStaff: boolean;
  requiresSignature: boolean;
  /** 9.ª ronda (c): só os médicos da lista emitem este modelo */
  restrictedToDoctors?: boolean;
  allowedDoctorIds?: string[];
  active: boolean;
}

/** Médico para a lista de acesso de um modelo restrito */
export interface DoctorOption {
  id: string;
  name: string;
  active: boolean;
}

export function TemplateEditorButton({
  initial,
  doctors = [],
}: {
  initial?: TemplateInitial;
  doctors?: DoctorOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={initial ? 'sm' : 'md'}
        variant={initial ? 'outline' : 'primary'}
        onClick={() => setOpen(true)}
      >
        {initial ? (
          <Pencil size={13} style={{ marginRight: 4 }} />
        ) : (
          <Plus size={15} style={{ marginRight: 6 }} />
        )}
        {initial ? 'Editar' : 'Novo modelo'}
      </Button>
      {open && (
        <TemplateEditor
          initial={initial}
          doctors={doctors}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TemplateEditor({
  initial,
  doctors,
  onClose,
}: {
  initial?: TemplateInitial;
  doctors: DoctorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  // 9.ª ronda (c): acesso dos médicos (contratos)
  const [restricted, setRestricted] = useState(
    initial?.restrictedToDoctors ?? false,
  );
  const [allowed, setAllowed] = useState<string[]>(
    initial?.allowedDoctorIds ?? [],
  );
  const toggleDoctor = (id: string) =>
    setAllowed(cur =>
      cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id],
    );
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(
    saveTemplateAction,
    undefined,
  );
  const handled = useRef<TemplateFormState>(undefined);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;
    toast.success('Modelo guardado.');
    router.refresh();
    onClose();
  }, [state, router, onClose]);

  const insert = (key: string) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const tag = `{{${key}}}`;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + tag.length;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Editar modelo' : 'Novo modelo de documento'}
      maxWidth={860}
    >
      <form
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {initial && <input type='hidden' name='id' value={initial.id} />}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}
        >
          {/* 8.ª ronda/06: pasta onde o modelo aparece ao emitir */}
          <Select
            name='folder'
            label='Pasta'
            defaultValue={initial?.folder ?? 'geral'}
          >
            {TEMPLATE_FOLDERS.map(f => (
              <option key={f} value={f}>
                {TEMPLATE_FOLDER_LABEL[f]}
              </option>
            ))}
          </Select>
          <Select
            name='kind'
            label='Tipo'
            defaultValue={initial?.kind ?? 'outro'}
          >
            {TEMPLATE_KINDS.map(k => (
              <option key={k} value={k}>
                {TEMPLATE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Input
            name='title'
            label='Título'
            required
            defaultValue={initial?.title ?? ''}
            maxLength={120}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{ fontSize: '12px', color: '#6A7186', alignSelf: 'center' }}
          >
            Inserir campo:
          </span>
          {PLACEHOLDERS.map(p => (
            <button
              key={p.key}
              type='button'
              onClick={() => insert(p.key)}
              title={`{{${p.key}}}`}
              style={{
                border: '1px solid #D8DEEF',
                borderRadius: 999,
                padding: '3px 9px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#2743A6',
                background: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Textarea
          ref={bodyRef}
          name='body'
          label='Texto do documento'
          rows={18}
          required
          defaultValue={initial?.body ?? ''}
          style={{
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: '12.5px',
          }}
          help='Parágrafos separados por linha em branco; linhas começadas por "•" viram lista. Os {{campos}} são preenchidos ao emitir e o texto fica editável antes de gerar o PDF.'
        />
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Checkbox
            id='tpl-staff'
            name='allowStaff'
            label='A receção também pode emitir'
            defaultChecked={initial?.allowStaff ?? false}
          />
          <Checkbox
            id='tpl-sig'
            name='requiresSignature'
            label='Exige assinatura do paciente no ecrã'
            defaultChecked={initial?.requiresSignature ?? false}
          />
        </div>
        {/* 9.ª ronda (c), Victor 27/11: a gestão escolhe os médicos que
            podem emitir este modelo (contratos de aparelho/alinhadores) */}
        <div
          style={{
            border: '1px solid #D8DEEF',
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <Checkbox
            id='tpl-restricted'
            name='restrictedToDoctors'
            label='Só os médicos escolhidos podem emitir e ver este modelo'
            checked={restricted}
            onChange={e => setRestricted(e.currentTarget.checked)}
          />
          {restricted && (
            <>
              <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                Assinale quem tem acesso. Os restantes médicos não veem este
                modelo na lista. A gestão e a receção dependem só da opção
                «A receção também pode emitir». Sem ninguém assinalado, nenhum
                médico tem acesso.
              </p>
              {doctors.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12px', color: '#B3261E' }}>
                  Não há médicos ativos para escolher.
                </p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(230px, 1fr))',
                    gap: '4px 12px',
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}
                >
                  {doctors.map(d => (
                    <label
                      key={d.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '13px',
                        color: d.active ? '#1C2233' : '#9AA1B4',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type='checkbox'
                        name='allowedDoctorIds'
                        value={d.id}
                        checked={allowed.includes(d.id)}
                        onChange={() => toggleDoctor(d.id)}
                      />
                      {d.name}
                      {d.active ? '' : ' (inativo)'}
                    </label>
                  ))}
                </div>
              )}
              <span style={{ fontSize: '12px', color: '#6A7186' }}>
                {allowed.length} médico(s) com acesso
              </span>
            </>
          )}
        </div>
        {state && 'error' in state && (
          <p
            style={{
              margin: 0,
              borderRadius: 8,
              padding: '10px 14px',
              backgroundColor: '#FDEDED',
              color: '#B3261E',
              fontSize: '14px',
            }}
          >
            {state.error}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancelar
          </Button>
          <Button type='submit' loading={pending}>
            Guardar modelo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TemplateToggle({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size='sm'
      variant={active ? 'danger' : 'primary'}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await toggleTemplateAction(id);
        setBusy(false);
        if (r.error) toast.error(r.error);
        else router.refresh();
      }}
    >
      {active ? 'Desativar' : 'Ativar'}
    </Button>
  );
}
