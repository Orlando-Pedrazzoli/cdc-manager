// 📄 src/components/faturacao/PartialCreditNoteModal.tsx
// =============================================================================
// CDC Manager — Faturação: nota de crédito PARCIAL (25/11, pedido da Isabel)
// -----------------------------------------------------------------------------
// Duas formas:
//   · Linhas — credita só algumas linhas da fatura. Para esses atos repete a
//     pergunta da anulação ("linha de balanço?"): Sim = atos anulados (com
//     estorno de comissão se o mês fechou); Não = voltam à fila de cobrança.
//   · Valor — credita só um valor (ex.: um desconto esquecido). Os atos não
//     mudam.
// A fatura continua válida; o crédito abate à dívida e fica na ficha do
// paciente. Só a administração (RBAC também no servidor).
// =============================================================================

'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ReceiptText } from 'lucide-react';
import {
  partialCreditNoteAction,
  type PartialCreditNoteState,
} from '@/actions/billing';
import { formatCents } from '@/lib/commissions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export interface CreditLineOption {
  index: number;
  description: string;
  priceCents: number;
  /** já creditada numa nota anterior */
  credited: boolean;
}

export function PartialCreditNoteModal({
  invoiceId,
  docLabel,
  lines,
  creditableCents,
}: {
  invoiceId: string;
  docLabel: string;
  lines: CreditLineOption[];
  /** o que ainda se pode creditar */
  creditableCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'lines' | 'value'>('lines');
  const [selected, setSelected] = useState<number[]>([]);
  const [voidProcedures, setVoidProcedures] = useState<'true' | 'false'>('true');

  const [, action, pending] = useActionState<PartialCreditNoteState, FormData>(
    async (prev, formData) => {
      const result = await partialCreditNoteAction(prev, formData);
      if (result && 'error' in result) toast.error(result.error);
      if (result && 'success' in result) {
        toast.success(
          `Nota de crédito de ${formatCents(result.totalCents)} registada${result.moloniNumber ? ` (Moloni ${result.moloniNumber})` : ''}`,
        );
        if (result.moloniError)
          toast.error(`Moloni: ${result.moloniError} — fica por emitir.`);
        setOpen(false);
        setSelected([]);
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  const selectedCents = lines
    .filter(l => selected.includes(l.index))
    .reduce((a, l) => a + l.priceCents, 0);

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    border: `1.5px solid ${active ? '#2743A6' : '#D8DEEF'}`,
    backgroundColor: active ? '#EEF2FF' : '#FFFFFF',
    borderRadius: '10px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#1C2233',
  });

  return (
    <>
      <Button type='button' variant='outline' onClick={() => setOpen(true)}>
        <ReceiptText size={15} style={{ marginRight: 6 }} />
        Nota de crédito parcial
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Nota de crédito parcial — ${docLabel}`}
        maxWidth={600}
      >
        <form
          action={action}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <input type='hidden' name='invoiceId' value={invoiceId} />
          <input type='hidden' name='kind' value={kind} />
          <input type='hidden' name='lineIndexes' value={selected.join(',')} />
          <input type='hidden' name='voidProcedures' value={voidProcedures} />

          <p style={{ margin: 0, fontSize: '13px', color: '#3D4257' }}>
            A fatura continua válida. O valor creditado abate à dívida e fica
            registado na ficha do paciente. Pode ainda creditar até{' '}
            <strong>{formatCents(creditableCents)}</strong>.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ ...optionStyle(kind === 'lines'), flex: 1 }}>
              <input
                type='radio'
                checked={kind === 'lines'}
                onChange={() => setKind('lines')}
                style={{ accentColor: '#2743A6' }}
              />
              <span>
                <strong>Só algumas linhas</strong>
              </span>
            </label>
            <label style={{ ...optionStyle(kind === 'value'), flex: 1 }}>
              <input
                type='radio'
                checked={kind === 'value'}
                onChange={() => setKind('value')}
                style={{ accentColor: '#2743A6' }}
              />
              <span>
                <strong>Só um valor</strong> (ex.: desconto esquecido)
              </span>
            </label>
          </div>

          {kind === 'lines' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lines.map(l => (
                  <label
                    key={l.index}
                    style={{
                      ...optionStyle(selected.includes(l.index)),
                      opacity: l.credited ? 0.5 : 1,
                      cursor: l.credited ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type='checkbox'
                      disabled={l.credited}
                      checked={selected.includes(l.index)}
                      onChange={e =>
                        setSelected(s =>
                          e.target.checked
                            ? [...s, l.index]
                            : s.filter(x => x !== l.index),
                        )
                      }
                      style={{ marginTop: 2, accentColor: '#2743A6' }}
                    />
                    <span style={{ flex: 1 }}>
                      {l.description}
                      {l.credited ? ' — já creditada' : ''}
                    </span>
                    <strong style={{ whiteSpace: 'nowrap' }}>
                      {formatCents(l.priceCents)}
                    </strong>
                  </label>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#3D4257' }}>
                A creditar: <strong>{formatCents(selectedCents)}</strong>. Quer
                criar uma <strong>linha de balanço</strong> para estes
                tratamentos?
              </p>
              <label style={optionStyle(voidProcedures === 'true')}>
                <input
                  type='radio'
                  checked={voidProcedures === 'true'}
                  onChange={() => setVoidProcedures('true')}
                  style={{ marginTop: 3, accentColor: '#2743A6' }}
                />
                <span>
                  <strong>Sim</strong> — o erro está nos tratamentos: ficam
                  anulados e, se o mês já fechou, a comissão é estornada.
                </span>
              </label>
              <label style={optionStyle(voidProcedures === 'false')}>
                <input
                  type='radio'
                  checked={voidProcedures === 'false'}
                  onChange={() => setVoidProcedures('false')}
                  style={{ marginTop: 3, accentColor: '#2743A6' }}
                />
                <span>
                  <strong>Não</strong> — os tratamentos estão certos e voltam à
                  fila de cobrança.
                </span>
              </label>
            </>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 2fr',
                gap: 8,
              }}
            >
              <Input
                name='valueEuros'
                label='Valor (€) *'
                inputMode='decimal'
                placeholder='ex.: 15,00'
              />
              <Input
                name='description'
                label='Descrição na nota de crédito'
                maxLength={120}
                placeholder='ex.: Desconto acordado'
              />
            </div>
          )}

          <Input
            name='reason'
            label='Motivo *'
            required
            minLength={3}
            placeholder='ex.: desconto de 10% não aplicado na cobrança'
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
            <Button type='submit' loading={pending}>
              Emitir nota de crédito
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
