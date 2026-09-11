// 📄 src/components/medicos/CommissionEditor.tsx
// =============================================================================
// CDC Manager — Médicos: remuneração por categoria e por ato (Fase 1, E9)
// -----------------------------------------------------------------------------
// Duas tabelas, ambas com a mesma célula de regra: modo (% / € fixo) +
// valor. Linha vazia = SEM override (segue a cadeia). Só as linhas
// preenchidas são serializadas para os hidden 'overrides' e
// 'categoryOverrides' (JSON) — formato da action.
//
// Cadeia mostrada ao admin: ato > categoria > base do médico > taxa do
// ato > default da clínica. Alterações só afetam atos FUTUROS (snapshot).
// Estilos inline (convenção do projeto).
// =============================================================================

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  setCommissionOverridesAction,
  type DoctorFormState,
} from '@/actions/doctors';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

type Mode = 'percent' | 'fixed';
interface RuleValue {
  mode: Mode;
  value: string; // % ou € conforme o modo; '' = sem override
}

export interface InitialRule {
  mode: Mode;
  /** % (0..100) quando percent; € quando fixed */
  value: number;
}

export function CommissionEditor({
  doctorId,
  basePercentLabel,
  treatments,
  categories,
  initialOverrides,
  initialCategoryOverrides,
}: {
  doctorId: string;
  basePercentLabel: string;
  treatments: { id: string; name: string; category: string | null }[];
  categories: string[];
  initialOverrides: ({ treatmentTypeId: string } & InitialRule)[];
  initialCategoryOverrides: ({ category: string } & InitialRule)[];
}) {
  const router = useRouter();

  const [byTreatment, setByTreatment] = useState<Record<string, RuleValue>>(
    () => {
      const v: Record<string, RuleValue> = {};
      for (const o of initialOverrides) {
        v[o.treatmentTypeId] = { mode: o.mode, value: String(o.value) };
      }
      return v;
    },
  );
  const [byCategory, setByCategory] = useState<Record<string, RuleValue>>(
    () => {
      const v: Record<string, RuleValue> = {};
      for (const o of initialCategoryOverrides) {
        v[o.category] = { mode: o.mode, value: String(o.value) };
      }
      return v;
    },
  );
  const [filter, setFilter] = useState('');

  const serialize = (
    entries: [string, RuleValue][],
    keyName: 'treatmentTypeId' | 'category',
  ) =>
    JSON.stringify(
      entries
        .filter(([, r]) => r.value.trim() !== '')
        .map(([key, r]) => {
          const n = Number(r.value.replace(',', '.'));
          return r.mode === 'fixed'
            ? { [keyName]: key, mode: 'fixed', fixedEuros: n }
            : { [keyName]: key, mode: 'percent', ratePercent: n };
        }),
    );

  const overridesJson = useMemo(
    () => serialize(Object.entries(byTreatment), 'treatmentTypeId'),
    [byTreatment],
  );
  const categoryJson = useMemo(
    () => serialize(Object.entries(byCategory), 'category'),
    [byCategory],
  );
  const countT = Object.values(byTreatment).filter(r => r.value.trim()).length;
  const countC = Object.values(byCategory).filter(r => r.value.trim()).length;

  const action = setCommissionOverridesAction.bind(null, doctorId);
  const [state, formAction, pending] = useActionState<
    DoctorFormState,
    FormData
  >(action, undefined);
  const handled = useRef<DoctorFormState>(undefined);

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;
    toast.success('Remuneração guardada.');
    router.refresh();
  }, [state, router]);

  const visibleTreatments = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return treatments;
    return treatments.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q),
    );
  }, [treatments, filter]);

  return (
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
    >
      <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
        O que o <strong>profissional</strong> recebe por ato, em percentagem da
        base (valor cobrado − custo direto) ou em valor fixo por ato. Ordem de
        prioridade: <strong>ato</strong> › <strong>categoria</strong> ›{' '}
        {basePercentLabel}. Vazio = sem override. Alterações só afetam atos
        futuros — os executados mantêm o valor congelado.
      </p>

      {/* --- Por categoria --- */}
      <Section title='Por categoria' count={countC}>
        <Table>
          <THead>
            <TR>
              <TH>Categoria</TH>
              <TH width={260} align='right'>
                Remuneração
              </TH>
            </TR>
          </THead>
          <TBody>
            {categories.map(c => (
              <TR key={c}>
                <TD>{c}</TD>
                <TD align='right'>
                  <RuleCell
                    rule={byCategory[c] ?? { mode: 'percent', value: '' }}
                    onChange={r => setByCategory(v => ({ ...v, [c]: r }))}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      {/* --- Por ato --- */}
      <Section
        title='Por ato'
        count={countT}
        right={
          <input
            type='search'
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder='Filtrar ato ou categoria…'
            style={{
              border: '1px solid #D8DEEF',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '13px',
              width: 240,
            }}
          />
        }
      >
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Ato</TH>
                <TH width={200}>Categoria</TH>
                <TH width={260} align='right'>
                  Remuneração
                </TH>
              </TR>
            </THead>
            <TBody>
              {visibleTreatments.map(t => (
                <TR key={t.id}>
                  <TD>{t.name}</TD>
                  <TD>
                    <span style={{ fontSize: '12px', color: '#6A7186' }}>
                      {t.category ?? '—'}
                    </span>
                  </TD>
                  <TD align='right'>
                    <RuleCell
                      rule={byTreatment[t.id] ?? { mode: 'percent', value: '' }}
                      onChange={r => setByTreatment(v => ({ ...v, [t.id]: r }))}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Section>

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

      <input type='hidden' name='overrides' value={overridesJson} />
      <input type='hidden' name='categoryOverrides' value={categoryJson} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button type='submit' loading={pending}>
          Guardar remuneração
        </Button>
        <span style={{ fontSize: '13px', color: '#6A7186' }}>
          {countC} por categoria · {countT} por ato
        </span>
      </div>
    </form>
  );
}

// --- Célula de regra: modo + valor ------------------------------------------
function RuleCell({
  rule,
  onChange,
}: {
  rule: RuleValue;
  onChange: (r: RuleValue) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        justifyContent: 'flex-end',
      }}
    >
      <select
        value={rule.mode}
        onChange={e =>
          onChange({ mode: e.target.value as Mode, value: rule.value })
        }
        style={{
          border: '1px solid #D8DEEF',
          borderRadius: '8px',
          padding: '6px 8px',
          fontSize: '12px',
          color: '#1B2A6B',
          backgroundColor: '#FFFFFF',
        }}
      >
        <option value='percent'>%</option>
        <option value='fixed'>€ fixo</option>
      </select>
      <input
        type='number'
        min={0}
        max={rule.mode === 'percent' ? 100 : 100000}
        step={rule.mode === 'percent' ? 1 : 0.01}
        value={rule.value}
        placeholder='—'
        onChange={e => onChange({ mode: rule.mode, value: e.target.value })}
        style={{
          width: 96,
          border: '1px solid #D8DEEF',
          borderRadius: '8px',
          padding: '6px 8px',
          fontSize: '13px',
          color: '#1B2A6B',
          textAlign: 'right',
        }}
      />
      {rule.value.trim() !== '' && (
        <button
          type='button'
          onClick={() => onChange({ mode: rule.mode, value: '' })}
          title='Remover override'
          style={{
            border: 'none',
            background: 'transparent',
            color: '#9AA1B4',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 2px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  right,
  children,
}: {
  title: string;
  count: number;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid #EEF1F8',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '10px 14px',
          backgroundColor: '#F8F9FD',
          borderBottom: '1px solid #EEF1F8',
          fontSize: '13px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        <span>
          {title}
          <span
            style={{
              marginLeft: 8,
              fontSize: '11px',
              fontWeight: 600,
              color: count > 0 ? '#2743A6' : '#9AA1B4',
            }}
          >
            {count} definido{count === 1 ? '' : 's'}
          </span>
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}
