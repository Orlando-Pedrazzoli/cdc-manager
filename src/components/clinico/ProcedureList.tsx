// 📄 src/components/clinico/ProcedureList.tsx
// =============================================================================
// CDC Manager — Clínico: atos + notas da consulta (Client Component)
// -----------------------------------------------------------------------------
// Duas responsabilidades da consulta em curso:
//   1. ATOS — lista dos Procedures desta consulta + form de registo
//      (escolher ato preenche o preço de tabela, editável para desconto/
//      cortesia; dentes FDI em CSV; anulação com motivo — never delete)
//   2. NOTAS CLÍNICAS — notas desta consulta (append-only na ficha)
//
// Só apresenta forms quando canEdit (consulta in-progress); nos outros
// estados é leitura. Padrão do projeto: useActionState + handled useRef
// (evita toast duplo), cores/padding/radius INLINE.
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Ban } from 'lucide-react';
import {
  addProcedureAction,
  voidProcedureAction,
  addClinicalNoteAction,
  type ConsultationActionState,
} from '@/actions/procedures';
import { formatCents } from '@/lib/commissions';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

// --- Tipos serializados (vêm do Server Component) ----------------------------
export interface ProcedureItem {
  id: string;
  name: string;
  priceCents: number;
  toothNumbers: string[];
  notes: string | null;
  status: 'completed' | 'void' | 'planned' | 'invoiced';
  voidReason: string | null;
}

export interface TreatmentOption {
  id: string;
  name: string;
  priceCents: number;
  /** Paridade Dentoral «Controla Dente»: o ato exige nº de dente (FDI) */
  controlsTooth: boolean;
}

export interface NoteItem {
  id: string;
  text: string;
  createdAt: string; // "HH:mm"
}

// =============================================================================
// ATOS DA CONSULTA
// =============================================================================
export function ProcedureList({
  appointmentId,
  procedures,
  treatments,
  canEdit,
}: {
  appointmentId: string;
  procedures: ProcedureItem[];
  treatments: TreatmentOption[];
  canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<
    ConsultationActionState,
    FormData
  >(addProcedureAction, undefined);
  const addHandled = useRef<ConsultationActionState>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!addState || addHandled.current === addState) return;
    addHandled.current = addState;
    if ('error' in addState) toast.error(addState.error);
    if ('success' in addState) {
      toast.success('Ato registado');
      formRef.current?.reset();
      setPrice('');
    }
  }, [addState]);

  // Escolher o ato preenche o preço de tabela (editável)
  const [selected, setSelected] = useState<TreatmentOption | null>(null);

  const onTreatmentChange = (id: string) => {
    const t = treatments.find(x => x.id === id) ?? null;
    setSelected(t);
    setPrice(t ? (t.priceCents / 100).toFixed(2).replace('.', ',') : '');
  };

  const active = procedures.filter(p => p.status !== 'void');
  const voided = procedures.filter(p => p.status === 'void');
  const totalCents = active.reduce((s, p) => s + p.priceCents, 0);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #EEF1F8',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
          Atos executados
        </span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
          Total: {formatCents(totalCents)}
        </span>
      </div>

      {/* Lista */}
      {active.length === 0 && voided.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '20px',
            fontSize: '14px',
            color: '#6A7186',
          }}
        >
          Ainda sem atos registados nesta consulta.
        </p>
      ) : (
        <div>
          {active.map(p => (
            <ProcedureRow key={p.id} p={p} canEdit={canEdit} />
          ))}
          {voided.map(p => (
            <ProcedureRow key={p.id} p={p} canEdit={false} />
          ))}
        </div>
      )}

      {/* Form de registo — só em consulta em curso */}
      {canEdit && (
        <form
          ref={formRef}
          action={addAction}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: '10px',
            padding: '16px 20px',
            borderTop: '1px solid #EEF1F8',
            backgroundColor: '#F9FAFD',
            alignItems: 'end',
          }}
        >
          <input type='hidden' name='appointmentId' value={appointmentId} />
          <Select
            name='treatmentTypeId'
            label='Ato *'
            required
            defaultValue=''
            onChange={e => onTreatmentChange(e.target.value)}
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
            name='priceEuros'
            label='Preço (€) *'
            required
            inputMode='decimal'
            value={price}
            onChange={e => setPrice(e.target.value)}
            help='Tabela; editável (desconto)'
          />
          <Input
            name='toothNumbers'
            label={selected?.controlsTooth ? 'Dentes (FDI) *' : 'Dentes (FDI)'}
            placeholder='ex.: 11, 26'
            required={selected?.controlsTooth ?? false}
            help={
              selected?.controlsTooth
                ? 'Este ato controla dente — obrigatório'
                : undefined
            }
          />
          <div style={{ gridColumn: '1 / span 2' }}>
            <Input name='notes' label='Observações' placeholder='Opcional' />
          </div>
          <Button type='submit' disabled={adding}>
            <Plus size={15} style={{ marginRight: 6 }} />
            {adding ? 'A registar…' : 'Registar ato'}
          </Button>
        </form>
      )}
    </div>
  );
}

// --- Linha de ato + anulação -------------------------------------------------
function ProcedureRow({ p, canEdit }: { p: ProcedureItem; canEdit: boolean }) {
  const isVoid = p.status === 'void';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voidState, voidAction, voiding] = useActionState<
    ConsultationActionState,
    FormData
  >(voidProcedureAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);

  useEffect(() => {
    if (!voidState || handled.current === voidState) return;
    handled.current = voidState;
    if ('error' in voidState) toast.error(voidState.error);
    if ('success' in voidState) {
      toast.success('Ato anulado');
      setConfirmOpen(false);
    }
  }, [voidState]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '11px 20px',
        borderBottom: '1px solid #F4F6FB',
        opacity: isVoid ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: '#1B2A6B',
            textDecoration: isVoid ? 'line-through' : 'none',
          }}
        >
          {p.name}
          {p.toothNumbers.length > 0 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: '12px',
                fontWeight: 500,
                color: '#6A7186',
              }}
            >
              Dentes {p.toothNumbers.join(', ')}
            </span>
          )}
        </p>
        {(p.notes || (isVoid && p.voidReason)) && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '12px',
              color: isVoid ? '#B3261E' : '#6A7186',
            }}
          >
            {isVoid ? `Anulado: ${p.voidReason}` : p.notes}
          </p>
        )}
      </div>
      <span
        style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#1B2A6B',
          fontVariantNumeric: 'tabular-nums',
          textDecoration: isVoid ? 'line-through' : 'none',
        }}
      >
        {formatCents(p.priceCents)}
      </span>
      {canEdit && !isVoid && (
        <>
          <button
            type='button'
            onClick={() => setConfirmOpen(true)}
            title='Anular ato'
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: 'none',
              background: 'transparent',
              color: '#B3261E',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <Ban size={15} />
          </button>
          <Modal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title='Anular ato'
          >
            <form
              action={voidAction}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <input type='hidden' name='procedureId' value={p.id} />
              <p style={{ margin: 0, fontSize: '14px', color: '#3D4257' }}>
                O ato <strong>{p.name}</strong> fica anulado (nunca é apagado) e
                sai da cobrança e das comissões.
              </p>
              <Input
                name='reason'
                label='Motivo da anulação *'
                required
                minLength={3}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => setConfirmOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type='submit' variant='danger' disabled={voiding}>
                  {voiding ? 'A anular…' : 'Anular ato'}
                </Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}

// =============================================================================
// NOTAS CLÍNICAS DA CONSULTA
// =============================================================================
export function ClinicalNotes({
  appointmentId,
  notes,
  canEdit,
}: {
  appointmentId: string;
  notes: NoteItem[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<
    ConsultationActionState,
    FormData
  >(addClinicalNoteAction, undefined);
  const handled = useRef<ConsultationActionState>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if ('error' in state) toast.error(state.error);
    if ('success' in state) {
      toast.success('Nota registada na ficha');
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid #EEF1F8',
          fontSize: '14px',
          fontWeight: 700,
          color: '#1B2A6B',
        }}
      >
        Notas clínicas desta consulta
      </div>

      {notes.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '16px 20px',
            fontSize: '13px',
            color: '#6A7186',
          }}
        >
          Sem notas nesta consulta.
        </p>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {notes.map(n => (
            <div
              key={n.id}
              style={{ padding: '8px 20px', display: 'flex', gap: '12px' }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#6A7186',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {n.createdAt}
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#3D4257',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {n.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form
          ref={formRef}
          action={action}
          style={{
            display: 'flex',
            gap: '10px',
            padding: '14px 20px',
            borderTop: '1px solid #EEF1F8',
            backgroundColor: '#F9FAFD',
            alignItems: 'flex-end',
          }}
        >
          <input type='hidden' name='appointmentId' value={appointmentId} />
          <div style={{ flex: 1 }}>
            <Textarea
              name='text'
              label='Nova nota (fica permanente na ficha do paciente)'
              rows={2}
              required
            />
          </div>
          <Button type='submit' disabled={pending}>
            {pending ? 'A gravar…' : 'Gravar nota'}
          </Button>
        </form>
      )}
    </div>
  );
}
