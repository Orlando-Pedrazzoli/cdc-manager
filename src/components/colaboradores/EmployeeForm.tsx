// 📄 src/components/colaboradores/EmployeeForm.tsx
// CDC Manager — Ficha de colaborador: criar/editar (Fase 6A, E16)
'use client';

import { startTransition, useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  createEmployeeAction,
  updateEmployeeAction,
  type EmployeeFormState,
} from '@/actions/employees';
import { EMPLOYEE_CONTRACT_TYPES, EMPLOYEE_CONTRACT_LABEL } from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';

export interface EmployeeInitial {
  id: string;
  name: string;
  category: string;
  contractType: string;
  startDate: string;
  endDate: string;
  nif: string;
  niss: string;
  phone: string;
  email: string;
  clinicIds: string[];
  initialSalaryEuros: string;
  socialSecurityRate: string;
  irsRate: string;
  schedule: string;
  benefits: string;
  notes: string;
}

export function EmployeeForm({
  initial,
  clinics,
}: {
  initial?: EmployeeInitial;
  clinics: { id: string; name: string }[];
}) {
  const router = useRouter();
  const action = initial
    ? updateEmployeeAction.bind(null, initial.id)
    : createEmployeeAction;
  const [state, formAction, pending] = useActionState<
    EmployeeFormState,
    FormData
  >(action, undefined);
  const handled = useRef<EmployeeFormState>(undefined);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) {
      toast.error(state.error);
      return;
    }
    toast.success(initial ? 'Ficha guardada.' : 'Colaborador criado.');
    router.push(`/admin/colaboradores/${state.employeeId}`);
    router.refresh();
  }, [state, router, initial]);

  const sec: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };
  const h: React.CSSProperties = {
    margin: 0,
    fontSize: '13px',
    fontWeight: 700,
    color: '#6A7186',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };
  const grid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <section style={sec}>
        <h3 style={h}>Identificação</h3>
        <div style={grid}>
          <Input
            name='name'
            label='Nome *'
            required
            defaultValue={initial?.name ?? ''}
          />
          <Input
            name='category'
            label='Categoria profissional *'
            required
            defaultValue={initial?.category ?? ''}
            placeholder='ex.: Assistente dentária, Rececionista'
            help={
              initial
                ? 'Mudanças de categoria registam-se no histórico, abaixo'
                : undefined
            }
          />
          <Select
            name='contractType'
            label='Vínculo'
            defaultValue={initial?.contractType ?? 'sem-termo'}
          >
            {EMPLOYEE_CONTRACT_TYPES.map(c => (
              <option key={c} value={c}>
                {EMPLOYEE_CONTRACT_LABEL[c]}
              </option>
            ))}
          </Select>
          <Input
            name='startDate'
            type='date'
            label='Data de admissão'
            defaultValue={initial?.startDate ?? ''}
          />
          <Input
            name='endDate'
            type='date'
            label='Data de saída'
            defaultValue={initial?.endDate ?? ''}
          />
          <Input
            name='nif'
            label='NIF'
            inputMode='numeric'
            maxLength={9}
            defaultValue={initial?.nif ?? ''}
          />
          <Input
            name='niss'
            label='NISS'
            inputMode='numeric'
            maxLength={20}
            defaultValue={initial?.niss ?? ''}
          />
          <Input
            name='phone'
            label='Telefone'
            inputMode='tel'
            defaultValue={initial?.phone ?? ''}
          />
          <Input
            name='email'
            label='Email'
            type='email'
            defaultValue={initial?.email ?? ''}
          />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {clinics.map(c => (
            <Checkbox
              key={c.id}
              id={`emp-clinic-${c.id}`}
              name='clinicIds'
              value={c.id}
              label={`Trabalha em ${c.name}`}
              defaultChecked={initial?.clinicIds.includes(c.id) ?? true}
            />
          ))}
        </div>
      </section>

      <section style={sec}>
        <h3 style={h}>Remuneração e condições</h3>
        <div style={grid}>
          <Input
            name='initialSalaryEuros'
            label='Salário inicial (€ bruto/mês)'
            inputMode='decimal'
            defaultValue={initial?.initialSalaryEuros ?? ''}
            help={
              initial
                ? 'Aumentos registam-se no histórico'
                : 'O salário atual começa igual'
            }
          />
          <Input
            name='socialSecurityRate'
            label='Taxa Seg. Social (%)'
            inputMode='decimal'
            defaultValue={initial?.socialSecurityRate ?? ''}
            placeholder='ex.: 11'
          />
          <Input
            name='irsRate'
            label='Taxa do escalão de IRS (%)'
            inputMode='decimal'
            defaultValue={initial?.irsRate ?? ''}
            placeholder='ex.: 14,5'
          />
          <Input
            name='schedule'
            label='Horário'
            defaultValue={initial?.schedule ?? ''}
            placeholder='ex.: 2.ª a 6.ª, 9h–18h, almoço 13h–14h'
          />
        </div>
        <Textarea
          name='benefits'
          label='Outras regalias'
          rows={2}
          defaultValue={initial?.benefits ?? ''}
          placeholder='ex.: subsídio de alimentação 9,60 €/dia, seguro de saúde, formação'
        />
        <Textarea
          name='notes'
          label='Notas internas'
          rows={2}
          defaultValue={initial?.notes ?? ''}
        />
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button type='button' variant='secondary' onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type='submit' loading={pending}>
          {initial ? 'Guardar ficha' : 'Criar colaborador'}
        </Button>
      </div>
    </form>
  );
}
