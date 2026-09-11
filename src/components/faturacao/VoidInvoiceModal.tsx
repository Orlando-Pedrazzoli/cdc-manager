// 📄 src/components/faturacao/VoidInvoiceModal.tsx
// =============================================================================
// CDC Manager — Faturação: anular documento (Fase 1, E2)
// -----------------------------------------------------------------------------
// Reproduz a interação pedida pela Isabel: ao anular uma fatura (nota de
// crédito), o sistema pergunta "Quer criar uma linha de balanço?"
//   · SIM → o erro está nos tratamentos: atos anulados a negativo (estorno
//     de comissão se o mês já fechou)
//   · NÃO → o erro está no documento: os atos voltam à fila de cobrança
// Só a administração vê este botão (RBAC no servidor também).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Ban } from 'lucide-react';
import { voidInvoiceAction, type VoidInvoiceState } from '@/actions/billing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export function VoidInvoiceModal({
  invoiceId,
  docLabel,
  lineCount,
}: {
  invoiceId: string;
  docLabel: string;
  lineCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [voidProcedures, setVoidProcedures] = useState<'true' | 'false'>(
    'true',
  );
  const [state, action, pending] = useActionState<VoidInvoiceState, FormData>(
    voidInvoiceAction,
    undefined,
  );
  const handled = useRef<VoidInvoiceState>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) {
      toast.success(
        state.voidedProcedures > 0
          ? `Documento anulado — ${state.voidedProcedures} ato(s) anulado(s)${state.adjustments > 0 ? `, ${state.adjustments} estorno(s) de comissão` : ''}`
          : 'Documento anulado — atos devolvidos à cobrança',
      );
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    border: `1.5px solid ${active ? '#2743A6' : '#D8DEEF'}`,
    backgroundColor: active ? '#EEF2FF' : '#FFFFFF',
    borderRadius: '10px',
    padding: '10px 12px',
    cursor: 'pointer',
  });

  return (
    <>
      <Button type='button' variant='danger' onClick={() => setOpen(true)}>
        <Ban size={15} style={{ marginRight: 6 }} />
        Anular documento
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Anular ${docLabel}`}
        maxWidth={560}
      >
        <form
          action={action}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <input type='hidden' name='invoiceId' value={invoiceId} />
          <input type='hidden' name='voidProcedures' value={voidProcedures} />

          <p style={{ margin: 0, fontSize: '14px', color: '#3D4257' }}>
            O documento fica anulado (nunca é apagado). Quer criar uma{' '}
            <strong>linha de balanço</strong> para os {lineCount} tratamento
            {lineCount === 1 ? '' : 's'} desta fatura?
          </p>

          <label style={optionStyle(voidProcedures === 'true')}>
            <input
              type='radio'
              name='_choice'
              checked={voidProcedures === 'true'}
              onChange={() => setVoidProcedures('true')}
              style={{ marginTop: 3, accentColor: '#2743A6' }}
            />
            <span style={{ fontSize: '13px', color: '#1C2233' }}>
              <strong>Sim</strong> — o erro está nos tratamentos. Cada linha é
              contabilizada a negativo: os atos ficam anulados e, se o mês já
              estiver fechado, a comissão do médico é estornada no mês corrente.
            </span>
          </label>

          <label style={optionStyle(voidProcedures === 'false')}>
            <input
              type='radio'
              name='_choice'
              checked={voidProcedures === 'false'}
              onChange={() => setVoidProcedures('false')}
              style={{ marginTop: 3, accentColor: '#2743A6' }}
            />
            <span style={{ fontSize: '13px', color: '#1C2233' }}>
              <strong>Não</strong> — o erro está só no documento (NIF, meio de
              pagamento…). Os tratamentos mantêm-se válidos e voltam à fila de
              cobrança para nova fatura.
            </span>
          </label>

          <Input
            name='reason'
            label='Motivo da anulação *'
            required
            minLength={3}
            placeholder='ex.: valor errado na coroa do dente 26'
          />

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            <Button
              type='button'
              variant='secondary'
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type='submit' variant='danger' loading={pending}>
              Anular documento
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
