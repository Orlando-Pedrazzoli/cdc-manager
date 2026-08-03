// 📄 src/components/clinico/PlanEditor.tsx
// =============================================================================
// CDC Manager — Clínico: planos de tratamento (Client Components)
// -----------------------------------------------------------------------------
//   PlanEditor  — compor um plano novo: título, clínica, linhas de atos
//                 (ato → preço de tabela editável, dentes FDI, fase) e
//                 desconto; itens viajam em hidden JSON
//   PlanActions — botões do ciclo de vida conforme o estado + execução
//                 faseada por item (fase a fase, como no consultório)
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Trash2, Send, Check, X, Play } from 'lucide-react';
import {
  createPlanAction,
  proposePlanAction,
  approvePlanAction,
  declinePlanAction,
  executePlanItemAction,
  type PlanActionState,
} from '@/actions/plans';
import { formatCents } from '@/lib/commissions';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';

export interface TreatmentOption {
  id: string;
  name: string;
  priceCents: number;
}

export interface ClinicOption {
  id: string;
  name: string;
}

// -----------------------------------------------------------------------------
// EDITOR (criar rascunho)
// -----------------------------------------------------------------------------
interface ItemRow {
  key: number;
  treatmentTypeId: string;
  priceEuros: string;
  toothNumbers: string;
  phase: string;
}

export function PlanEditor({
  patientId,
  treatments,
  clinics,
}: {
  patientId: string;
  treatments: TreatmentOption[];
  clinics: ClinicOption[];
}) {
  const router = useRouter();
  const nextKey = useRef(1);
  const [rows, setRows] = useState<ItemRow[]>([
    {
      key: 0,
      treatmentTypeId: '',
      priceEuros: '',
      toothNumbers: '',
      phase: '1',
    },
  ]);
  const [discount, setDiscount] = useState('');

  const [state, action, pending] = useActionState<PlanActionState, FormData>(
    createPlanAction,
    undefined,
  );
  const handled = useRef<PlanActionState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) {
      toast.success('Plano criado (rascunho)');
      // Form de página inteira → fechar e voltar à lista de planos
      router.push(`/doutor/pacientes/${patientId}/plano`);
      router.refresh();
    }
  }, [state, router, patientId]);

  const setRow = (key: number, patch: Partial<ItemRow>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const onTreatmentChange = (key: number, id: string) => {
    const t = treatments.find(x => x.id === id);
    setRow(key, {
      treatmentTypeId: id,
      priceEuros: t ? (t.priceCents / 100).toFixed(2).replace('.', ',') : '',
    });
  };

  const parseEuros = (s: string): number => {
    const n = Number(s.trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
  };
  const totalCents = useMemo(
    () => rows.reduce((s, r) => s + parseEuros(r.priceEuros), 0),
    [rows],
  );
  const discountCents = parseEuros(discount);

  const itemsJson = JSON.stringify(
    rows
      .filter(r => r.treatmentTypeId)
      .map(r => ({
        treatmentTypeId: r.treatmentTypeId,
        priceEuros: r.priceEuros,
        toothNumbers: r.toothNumbers,
        phase: r.phase || '1',
      })),
  );

  const box: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '18px 20px',
  };

  return (
    <form
      action={action}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      <input type='hidden' name='patientId' value={patientId} />
      <input type='hidden' name='items' value={itemsJson} />

      <div
        style={{
          ...box,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '12px',
        }}
      >
        <Input
          name='title'
          label='Título do plano *'
          required
          placeholder='ex.: Reabilitação do 1º quadrante'
        />
        <Select
          name='clinicId'
          label='Clínica *'
          required
          defaultValue={clinics[0]?.id ?? ''}
        >
          {clinics.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Linhas de atos */}
      <div
        style={{
          ...box,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Atos propostos
        </p>
        {rows.map(r => (
          <div
            key={r.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '3fr 1fr 1fr 70px 34px',
              gap: '8px',
              alignItems: 'end',
            }}
          >
            <Select
              value={r.treatmentTypeId}
              required
              onChange={e => onTreatmentChange(r.key, e.target.value)}
            >
              <option value='' disabled>
                — Selecionar ato —
              </option>
              {treatments.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} · {formatCents(t.priceCents)}
                </option>
              ))}
            </Select>
            <Input
              value={r.priceEuros}
              inputMode='decimal'
              required
              placeholder='Preço €'
              onChange={e => setRow(r.key, { priceEuros: e.target.value })}
            />
            <Input
              value={r.toothNumbers}
              placeholder='Dentes (FDI)'
              onChange={e => setRow(r.key, { toothNumbers: e.target.value })}
            />
            <Input
              value={r.phase}
              inputMode='numeric'
              placeholder='Fase'
              onChange={e => setRow(r.key, { phase: e.target.value })}
            />
            <button
              type='button'
              aria-label='Remover linha'
              disabled={rows.length === 1}
              onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))}
              style={{
                border: 'none',
                background: 'transparent',
                color: rows.length === 1 ? '#C7CEE0' : '#B3261E',
                cursor: rows.length === 1 ? 'default' : 'pointer',
                paddingBottom: '10px',
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div>
          <Button
            type='button'
            variant='secondary'
            onClick={() =>
              setRows(prev => [
                ...prev,
                {
                  key: nextKey.current++,
                  treatmentTypeId: '',
                  priceEuros: '',
                  toothNumbers: '',
                  phase: '1',
                },
              ])
            }
          >
            <Plus size={14} style={{ marginRight: 5 }} />
            Adicionar ato
          </Button>
        </div>
      </div>

      {/* Desconto + notas + total */}
      <div
        style={{
          ...box,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 3fr',
            gap: '12px',
          }}
        >
          <Input
            name='discountEuros'
            label='Desconto global (€)'
            inputMode='decimal'
            value={discount}
            onChange={e => setDiscount(e.target.value)}
            placeholder='0,00'
          />
          <Textarea name='notes' label='Notas do plano' rows={2} />
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: '#1B2A6B',
            textAlign: 'right',
          }}
        >
          Total: {formatCents(totalCents)}
          {discountCents > 0 && (
            <span style={{ marginLeft: 10, color: '#0F7B4D' }}>
              − {formatCents(discountCents)} ={' '}
              {formatCents(Math.max(totalCents - discountCents, 0))}
            </span>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <Button
          type='button'
          variant='secondary'
          onClick={() => router.push(`/doutor/pacientes/${patientId}/plano`)}
        >
          Cancelar
        </Button>
        <Button type='submit' disabled={pending}>
          {pending ? 'A criar…' : 'Criar plano (rascunho)'}
        </Button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// AÇÕES DE CICLO DE VIDA + EXECUÇÃO POR ITEM
// -----------------------------------------------------------------------------
function LifecycleButton({
  action: serverAction,
  hidden,
  label,
  pendingLabel,
  icon,
  variant = 'primary',
  successMessage,
}: {
  action: (prev: PlanActionState, fd: FormData) => Promise<PlanActionState>;
  hidden: Record<string, string>;
  label: string;
  pendingLabel: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  successMessage: string;
}) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(
    serverAction,
    undefined,
  );
  const handled = useRef<PlanActionState>(undefined);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) toast.success(successMessage);
  }, [state, successMessage]);

  return (
    <form action={action} style={{ display: 'inline-block' }}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type='hidden' name={k} value={v} />
      ))}
      <Button type='submit' variant={variant} disabled={pending}>
        {icon}
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}

export function PlanLifecycleButtons({
  planId,
  status,
}: {
  planId: string;
  status: string;
}) {
  if (status === 'draft') {
    return (
      <LifecycleButton
        action={proposePlanAction}
        hidden={{ planId }}
        label='Propor ao paciente'
        pendingLabel='A propor…'
        icon={<Send size={14} style={{ marginRight: 5 }} />}
        successMessage='Plano proposto (validade 60 dias)'
      />
    );
  }
  if (status === 'proposed') {
    return (
      <span style={{ display: 'inline-flex', gap: '8px' }}>
        <LifecycleButton
          action={approvePlanAction}
          hidden={{ planId }}
          label='Aprovado (presencial)'
          pendingLabel='A aprovar…'
          icon={<Check size={14} style={{ marginRight: 5 }} />}
          successMessage='Plano aprovado — atos planeados criados'
        />
        <LifecycleButton
          action={declinePlanAction}
          hidden={{ planId }}
          label='Recusado'
          pendingLabel='A registar…'
          icon={<X size={14} style={{ marginRight: 5 }} />}
          variant='danger'
          successMessage='Plano recusado'
        />
      </span>
    );
  }
  return null;
}

export function ExecuteItemButton({ procedureId }: { procedureId: string }) {
  return (
    <LifecycleButton
      action={executePlanItemAction}
      hidden={{ procedureId }}
      label='Executar'
      pendingLabel='A executar…'
      icon={<Play size={13} style={{ marginRight: 4 }} />}
      variant='secondary'
      successMessage='Ato executado — disponível para cobrança'
    />
  );
}
