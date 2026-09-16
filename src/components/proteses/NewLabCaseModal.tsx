// 📄 src/components/proteses/NewLabCaseModal.tsx
// =============================================================================
// CDC Manager — Próteses: registar envio ao laboratório (modal + toolbar)
// -----------------------------------------------------------------------------
// Pesquisa de paciente igual ao modal de marcações (findPatientsAction) —
// ou paciente FIXO quando aberto a partir da ficha (E3). Laboratório
// escolhido da lista de Fornecedores com pisco "laboratório"; o prazo
// habitual do laboratório pré-preenche a data prevista. Modo médico: sem
// seletor de médico (o pedido é seu). Datas de envio (default hoje) e
// prevista. Submissão MANUAL preventDefault +
// startTransition — o padrão anti-reset (React 19 limparia o formulário
// em erro de validação se usássemos action={}).
// =============================================================================

'use client';

import { startTransition, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PackagePlus, Search } from 'lucide-react';
import {
  createLabCaseAction,
  type LabCaseActionState,
} from '@/actions/lab-cases';
import { LAB_WORK_TYPES, LAB_WORK_TYPE_LABEL } from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { usePatientSearch } from '@/components/agenda/usePatientSearch';

export interface LabOption {
  id: string;
  name: string;
  defaultLeadDays: number | null;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  clinics: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
  labs: LabOption[];
  /** Ficha do paciente: paciente fixo (sem pesquisa) */
  lockedPatient?: { id: string; label: string };
  /** Área do médico: sem seletor de médico */
  doctorMode?: boolean;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function NewLabCaseModal({
  open,
  onClose,
  clinics,
  doctors,
  labs,
  lockedPatient,
  doctorMode = false,
}: ModalProps) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [sentDate, setSentDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [labId, setLabId] = useState('');
  const onLabChange = (id: string) => {
    setLabId(id);
    const lab = labs.find(l => l.id === id);
    if (lab?.defaultLeadDays != null && !dueDate) {
      setDueDate(addDays(sentDate || todayStr, lab.defaultLeadDays));
    }
  };

  // Pesquisa de paciente (hook partilhado com os modais da agenda)
  const {
    patientQuery,
    setPatientQuery,
    patient,
    setPatient,
    patientResults,
    reset: resetPatient,
  } = usePatientSearch(lockedPatient ?? null);

  // Efeitos do resultado (toast, fechar, refresh, reset) no próprio
  // callback da action — sem useEffect a observar `state`
  const [state, formAction, pending] = useActionState<
    LabCaseActionState,
    FormData
  >(async (prev, formData) => {
    const result = await createLabCaseAction(prev, formData);
    if (!result || 'error' in result) return result;
    toast.success('Pedido ao laboratório registado.');
    router.refresh();
    onClose();
    resetPatient(); // volta ao paciente bloqueado, se houver
    setLabId('');
    setDueDate('');
    return result;
  }, undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title='Pedido a laboratório / entidade externa'
      maxWidth={620}
    >
      <form
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => {
            formAction(fd);
          });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <input type='hidden' name='patientId' value={patient?.id ?? ''} />

        {/* Paciente */}
        <div style={{ position: 'relative' }}>
          <Input
            id='lc-patient'
            label='Paciente *'
            icon={<Search size={15} />}
            value={patient ? patient.label : patientQuery}
            readOnly={!!lockedPatient}
            onChange={e => {
              if (lockedPatient) return;
              setPatient(null);
              setPatientQuery(e.target.value);
            }}
            placeholder='Nome, telefone ou nº de processo…'
            autoComplete='off'
          />
          {!lockedPatient && patientResults.length > 0 && !patient && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 10,
                marginTop: 4,
                backgroundColor: '#FFFFFF',
                border: '1px solid #D8DEEF',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(27,42,107,0.12)',
                overflow: 'hidden',
              }}
            >
              {patientResults.map(r => (
                <button
                  key={r.id}
                  type='button'
                  onClick={() => {
                    setPatient(r); // a lista some sozinha (derivada)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 12px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '13px',
                    color: '#1B2A6B',
                    cursor: 'pointer',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clínica + médico */}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <Select id='lc-clinic' name='clinicId' label='Clínica *' required>
            {clinics.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {doctorMode ? (
            <input type='hidden' name='doctorId' value='' />
          ) : (
            <Select id='lc-doctor' name='doctorId' label='Médico (opcional)'>
              <option value=''>—</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Laboratório + tipo de trabalho */}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <div>
            <Select
              id='lc-lab'
              name='supplierId'
              label='Laboratório / entidade *'
              required
              value={labId}
              onChange={e => onLabChange(e.target.value)}
              help={
                labs.length === 0
                  ? 'Crie primeiro em Fornecedores com o pisco "laboratório"'
                  : undefined
              }
            >
              <option value=''>— Selecionar —</option>
              {labs.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.defaultLeadDays != null
                    ? ` (${l.defaultLeadDays} dias)`
                    : ''}
                </option>
              ))}
            </Select>
          </div>
          <Select id='lc-type' name='workType' label='Trabalho *' required>
            <option value=''>— Selecionar —</option>
            {LAB_WORK_TYPES.map(t => (
              <option key={t} value={t}>
                {LAB_WORK_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>

        {/* Dentes/zona + cor + custo */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: 12,
          }}
        >
          <Input
            id='lc-teeth'
            name='toothNotes'
            label='Dentes / zona'
            placeholder='Ex.: 14–16 ponte'
            maxLength={60}
          />
          <Input
            id='lc-shade'
            name='shade'
            label='Cor'
            placeholder='Ex.: A2'
            maxLength={20}
          />
          <Input
            id='lc-cost'
            name='costEuros'
            label='Custo lab. (€)'
            placeholder='0,00'
            inputMode='decimal'
          />
        </div>

        {/* Datas */}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <Input
            id='lc-sent'
            name='sentDate'
            type='date'
            label='Data de envio *'
            value={sentDate}
            onChange={e => setSentDate(e.target.value)}
            required
          />
          <Input
            id='lc-due'
            name='dueDate'
            type='date'
            label='Retorno previsto *'
            min={sentDate || todayStr}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            required
            help='Aparece na agenda desse dia e no dashboard; o alerta de atraso dispara a partir daqui'
          />
        </div>

        <Textarea
          id='lc-notes'
          name='notes'
          label='Notas (opcional)'
          rows={2}
          maxLength={300}
          placeholder='Ex.: guia enviada; ligar antes de faturar'
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button
            type='button'
            variant='outline'
            onClick={onClose}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type='submit' loading={pending} disabled={!patient || !labId}>
            Registar pedido
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Botão "Registar envio" + modal — para a página server /admin/proteses */
export function LabCaseToolbar({
  clinics,
  doctors,
  labs,
  lockedPatient,
  doctorMode,
  size,
}: Omit<ModalProps, 'open' | 'onClose'> & { size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <PackagePlus size={16} style={{ marginRight: 6 }} />
        {lockedPatient ? 'Novo pedido a laboratório' : 'Registar pedido'}
      </Button>
      <NewLabCaseModal
        open={open}
        onClose={() => setOpen(false)}
        clinics={clinics}
        doctors={doctors}
        labs={labs}
        lockedPatient={lockedPatient}
        doctorMode={doctorMode}
      />
    </>
  );
}
