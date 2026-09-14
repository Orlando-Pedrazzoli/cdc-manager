// 📄 src/components/fornecedores/SupplierModal.tsx
// =============================================================================
// CDC Manager — Fornecedores: criar / editar (modal) + botão toolbar (E3)
// -----------------------------------------------------------------------------
// Um único formulário para criar e editar. O pisco "É laboratório" é o que
// faz o fornecedor aparecer no seletor dos pedidos de trabalhos externos.
// Submissão manual preventDefault + startTransition (padrão anti-reset).
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
import { FlaskConical, Pencil, Plus } from 'lucide-react';
import {
  createSupplierAction,
  updateSupplierAction,
  type SupplierFormState,
} from '@/actions/suppliers';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export interface SupplierInitial {
  id: string;
  name: string;
  isLab: boolean;
  nif: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  defaultLeadDays: number | null;
  notes: string | null;
}

export function SupplierModal({
  open,
  onClose,
  initial,
  defaultIsLab = false,
}: {
  open: boolean;
  onClose: () => void;
  initial?: SupplierInitial;
  defaultIsLab?: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const action = isEdit
    ? updateSupplierAction.bind(null, initial.id)
    : createSupplierAction;
  const [state, formAction, pending] = useActionState<
    SupplierFormState,
    FormData
  >(action, undefined);
  const handled = useRef<SupplierFormState>(undefined);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;
    toast.success(isEdit ? 'Fornecedor atualizado.' : 'Fornecedor criado.');
    router.refresh();
    onClose();
  }, [state, router, onClose, isEdit]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar fornecedor' : 'Novo fornecedor'}
      maxWidth={600}
    >
      <form
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <Input
          name='name'
          label='Nome *'
          required
          defaultValue={initial?.name ?? ''}
          placeholder='ex.: Laboratório Dentário Lisboa'
        />

        <div
          style={{
            border: '1.5px solid #D8DEEF',
            borderRadius: '10px',
            padding: '10px 12px',
            backgroundColor: '#F8F9FD',
          }}
        >
          <Checkbox
            id='sup-islab'
            name='isLab'
            label='É laboratório / entidade externa de trabalhos clínicos'
            defaultChecked={initial?.isLab ?? defaultIsLab}
            help='Protésico, alinhadores ortodônticos, biópsias, exames… Aparece no seletor dos pedidos de laboratório na ficha do paciente.'
          />
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <Input name='nif' label='NIF' defaultValue={initial?.nif ?? ''} />
          <Input
            name='defaultLeadDays'
            label='Prazo habitual (dias)'
            type='number'
            min={0}
            max={120}
            defaultValue={initial?.defaultLeadDays ?? ''}
            help='Pré-preenche a data prevista de retorno'
          />
          <Input
            name='contactName'
            label='Pessoa de contacto'
            defaultValue={initial?.contactName ?? ''}
          />
          <Input
            name='phone'
            label='Telefone'
            defaultValue={initial?.phone ?? ''}
          />
          <div style={{ gridColumn: '1 / span 2' }}>
            <Input
              name='email'
              label='Email'
              type='email'
              defaultValue={initial?.email ?? ''}
            />
          </div>
          <div style={{ gridColumn: '1 / span 2' }}>
            <Input
              name='address'
              label='Morada'
              defaultValue={initial?.address ?? ''}
            />
          </div>
        </div>

        <Textarea
          name='notes'
          label='Notas'
          rows={2}
          maxLength={500}
          defaultValue={initial?.notes ?? ''}
        />

        {state && 'error' in state && (
          <p
            style={{
              margin: 0,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '14px',
              backgroundColor: '#FDEDED',
              color: '#B3261E',
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
            {isEdit ? 'Guardar' : 'Criar fornecedor'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function NewSupplierButton({
  defaultIsLab = false,
}: {
  defaultIsLab?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {defaultIsLab ? (
          <FlaskConical size={16} style={{ marginRight: 6 }} />
        ) : (
          <Plus size={16} style={{ marginRight: 6 }} />
        )}
        {defaultIsLab ? 'Novo laboratório' : 'Novo fornecedor'}
      </Button>
      <SupplierModal
        open={open}
        onClose={() => setOpen(false)}
        defaultIsLab={defaultIsLab}
      />
    </>
  );
}

export function EditSupplierButton({ initial }: { initial: SupplierInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        <Pencil size={13} style={{ marginRight: 4 }} />
        Editar
      </Button>
      <SupplierModal
        open={open}
        onClose={() => setOpen(false)}
        initial={initial}
      />
    </>
  );
}
