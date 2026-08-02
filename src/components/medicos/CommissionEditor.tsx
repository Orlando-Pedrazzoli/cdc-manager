// 📄 src/components/medicos/CommissionEditor.tsx
// =============================================================================
// CDC Manager — Médicos: comissões por ato (overrides)
// -----------------------------------------------------------------------------
// Tabela com os atos do catálogo; percentagem vazia = SEM override (usa a
// cadeia base do médico → default da clínica). Só as linhas preenchidas são
// serializadas para o hidden 'overrides' (JSON) — o formato da action.
//
// Nota exibida na UI: alterar comissões só afeta atos FUTUROS — os já
// executados têm o valor congelado no snapshot (Procedure).
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

export function CommissionEditor({
  doctorId,
  basePercentLabel,
  treatments,
  initialOverrides,
}: {
  doctorId: string;
  /** Ex.: "45%" (taxa base do médico) ou "default da clínica (40%)" */
  basePercentLabel: string;
  treatments: { id: string; name: string }[];
  initialOverrides: { treatmentTypeId: string; ratePercent: number }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const o of initialOverrides) {
      v[o.treatmentTypeId] = String(o.ratePercent);
    }
    return v;
  });

  const overridesJson = useMemo(
    () =>
      JSON.stringify(
        Object.entries(values)
          .filter(([, p]) => p.trim() !== '')
          .map(([treatmentTypeId, p]) => ({
            treatmentTypeId,
            ratePercent: Number(p),
          })),
      ),
    [values],
  );
  const overrideCount = Object.values(values).filter(
    v => v.trim() !== '',
  ).length;

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
    toast.success('Comissões guardadas.');
    router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
        Percentagem que o <strong>médico</strong> recebe em cada ato. Vazio =
        sem override (aplica {basePercentLabel}). Alterações só afetam atos
        futuros — os executados mantêm o valor congelado na execução.
      </p>

      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <Table>
          <THead>
            <TR>
              <TH>Ato</TH>
              <TH width={140} align='right'>
                Comissão (%)
              </TH>
            </TR>
          </THead>
          <TBody>
            {treatments.map(t => (
              <TR key={t.id}>
                <TD>{t.name}</TD>
                <TD align='right'>
                  <input
                    type='number'
                    min={0}
                    max={100}
                    step={1}
                    value={values[t.id] ?? ''}
                    placeholder='—'
                    onChange={e =>
                      setValues(v => ({ ...v, [t.id]: e.target.value }))
                    }
                    style={{
                      width: 84,
                      border: '1px solid #D8DEEF',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      fontSize: '13px',
                      color: '#1B2A6B',
                      textAlign: 'right',
                    }}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button type='submit' loading={pending}>
          Guardar comissões
        </Button>
        <span style={{ fontSize: '13px', color: '#6A7186' }}>
          {overrideCount} override(s) definidos
        </span>
      </div>
    </form>
  );
}
