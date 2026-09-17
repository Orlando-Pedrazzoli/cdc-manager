// 📄 src/components/colaboradores/EmployeeHistory.tsx
// CDC Manager — Ficha de colaborador: históricos append-only (aumentos,
// categorias, advertências) com formulário de nova entrada (Fase 6A, E16)
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
import { Plus } from 'lucide-react';
import {
  addRaiseAction,
  addCategoryChangeAction,
  addWarningAction,
  toggleEmployeeActiveAction,
  type HistoryState,
} from '@/actions/employees';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';

export interface HistoryEntry {
  id: string;
  at: string;
  by: string;
  note: string | null;
  value: string;
}

const sec: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  padding: '16px 18px',
};
const td: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  color: '#1B2A6B',
  borderBottom: '1px solid #F4F6FB',
  verticalAlign: 'top',
};

function useHistoryAction(
  action: (p: HistoryState, fd: FormData) => Promise<HistoryState>,
  onDone: () => void,
) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<HistoryState, FormData>(
    action,
    undefined,
  );
  const handled = useRef<HistoryState>(undefined);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) {
      toast.error(state.error);
      return;
    }
    toast.success('Registado.');
    router.refresh();
    onDone();
  }, [state, router, onDone]);
  return { formAction, pending };
}

function Section({
  title,
  entries,
  valueLabel,
  children,
  onToggle,
  open,
}: {
  title: string;
  entries: HistoryEntry[];
  valueLabel: string;
  children: React.ReactNode;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <div style={sec}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {title}{' '}
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#9AA1B4' }}>
            ({entries.length})
          </span>
        </h3>
        <Button size='sm' variant='outline' onClick={onToggle}>
          <Plus size={13} style={{ marginRight: 4 }} />
          {open ? 'Fechar' : 'Registar'}
        </Button>
      </div>
      {open && <div style={{ marginBottom: 10 }}>{children}</div>}
      <div className='cdc-table-scroll'>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td style={{ ...td, color: '#9AA1B4' }}>Sem registos.</td>
              </tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td style={{ ...td, whiteSpace: 'nowrap', color: '#6A7186' }}>
                  {e.at}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{e.value}</td>
                <td style={{ ...td, color: '#3D4257', whiteSpace: 'pre-wrap' }}>
                  {e.note ?? ''}
                </td>
                <td
                  style={{
                    ...td,
                    color: '#9AA1B4',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.by}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#9AA1B4' }}>
        {valueLabel}
      </p>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '150px 1fr 2fr auto',
  gap: 8,
  alignItems: 'end',
};

export function EmployeeHistories({
  employeeId,
  active,
  raises,
  categories,
  warnings,
}: {
  employeeId: string;
  active: boolean;
  raises: HistoryEntry[];
  categories: HistoryEntry[];
  warnings: HistoryEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'raise' | 'cat' | 'warn' | null>(null);
  const close = () => setOpen(null);
  const r = useHistoryAction(addRaiseAction, close);
  const c = useHistoryAction(addCategoryChangeAction, close);
  const w = useHistoryAction(addWarningAction, close);
  const submit =
    (fa: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      startTransition(() => fa(fd));
    };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        title='Aumentos'
        entries={raises}
        valueLabel='Cada aumento fixa o salário atual. Histórico só de acrescento — corrige-se com nova entrada.'
        open={open === 'raise'}
        onToggle={() => setOpen(o => (o === 'raise' ? null : 'raise'))}
      >
        <form onSubmit={submit(r.formAction)} style={row}>
          <input type='hidden' name='employeeId' value={employeeId} />
          <Input
            name='at'
            type='date'
            label='Data *'
            required
            defaultValue={today()}
          />
          <Input
            name='newSalaryEuros'
            label='Novo salário (€) *'
            inputMode='decimal'
            required
          />
          <Input name='note' label='Motivo' placeholder='ex.: revisão anual' />
          <Button type='submit' loading={r.pending}>
            Registar
          </Button>
        </form>
      </Section>
      <Section
        title='Mudanças de categoria profissional'
        entries={categories}
        valueLabel='Cada mudança fixa a categoria atual da ficha.'
        open={open === 'cat'}
        onToggle={() => setOpen(o => (o === 'cat' ? null : 'cat'))}
      >
        <form onSubmit={submit(c.formAction)} style={row}>
          <input type='hidden' name='employeeId' value={employeeId} />
          <Input
            name='at'
            type='date'
            label='Data *'
            required
            defaultValue={today()}
          />
          <Input name='category' label='Nova categoria *' required />
          <Input name='note' label='Nota' />
          <Button type='submit' loading={c.pending}>
            Registar
          </Button>
        </form>
      </Section>
      <Section
        title='Advertências'
        entries={warnings}
        valueLabel='Texto e data, como pedido. Registos permanentes e auditados.'
        open={open === 'warn'}
        onToggle={() => setOpen(o => (o === 'warn' ? null : 'warn'))}
      >
        <form
          onSubmit={submit(w.formAction)}
          style={{
            display: 'grid',
            gridTemplateColumns: '150px 1fr auto',
            gap: 8,
            alignItems: 'end',
          }}
        >
          <input type='hidden' name='employeeId' value={employeeId} />
          <Input
            name='at'
            type='date'
            label='Data *'
            required
            defaultValue={today()}
          />
          <Textarea
            name='text'
            label='Advertência (texto) *'
            rows={2}
            required
          />
          <Button type='submit' loading={w.pending} variant='danger'>
            Registar
          </Button>
        </form>
      </Section>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size='sm'
          variant={active ? 'danger' : 'primary'}
          onClick={async () => {
            if (
              active &&
              !confirm(
                'Desativar este colaborador? A ficha e o histórico mantêm-se.',
              )
            )
              return;
            const res = await toggleEmployeeActiveAction(employeeId);
            if (res.error) toast.error(res.error);
            else {
              toast.success(
                active ? 'Colaborador desativado.' : 'Colaborador reativado.',
              );
              router.refresh();
            }
          }}
        >
          {active ? 'Desativar colaborador' : 'Reativar colaborador'}
        </Button>
      </div>
    </div>
  );
}
