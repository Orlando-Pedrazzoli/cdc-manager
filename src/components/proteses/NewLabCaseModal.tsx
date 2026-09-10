// 📄 src/components/proteses/NewLabCaseModal.tsx
// =============================================================================
// CDC Manager — Próteses: registar envio ao laboratório (modal + toolbar)
// -----------------------------------------------------------------------------
// Pesquisa de paciente igual ao modal de marcações (findPatientsAction),
// datalist de laboratórios já usados (aprender com o histórico), datas de
// envio (default hoje) e prevista. Submissão MANUAL preventDefault +
// startTransition — o padrão anti-reset (React 19 limparia o formulário
// em erro de validação se usássemos action={}).
// =============================================================================

'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PackagePlus, Search } from 'lucide-react';
import {
  createLabCaseAction,
  type LabCaseActionState,
} from '@/actions/lab-cases';
import { findPatientsAction } from '@/actions/appointments';
import { LAB_WORK_TYPES, LAB_WORK_TYPE_LABEL } from '@/lib/domain';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

function NewLabCaseModal({
  open,
  onClose,
  clinics,
  doctors,
  knownLabs,
}: {
  open: boolean;
  onClose: () => void;
  clinics: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
  knownLabs: string[];
}) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pesquisa de paciente (mesmo padrão do modal de marcações)
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<
    { id: string; label: string }[]
  >([]);
  const [patient, setPatient] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [, startSearch] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (patient || patientQuery.trim().length < 2) {
      setPatientResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startSearch(async () => {
        setPatientResults(await findPatientsAction(patientQuery));
      });
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [patientQuery, patient]);

  const [state, formAction, pending] = useActionState<
    LabCaseActionState,
    FormData
  >(createLabCaseAction, undefined);
  const handled = useRef<LabCaseActionState>(undefined);

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;
    toast.success('Envio ao laboratório registado.');
    router.refresh();
    onClose();
    setPatient(null);
    setPatientQuery('');
  }, [state, router, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title='Registar envio ao laboratório'
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
            onChange={e => {
              setPatient(null);
              setPatientQuery(e.target.value);
            }}
            placeholder='Nome, telefone ou nº de processo…'
            autoComplete='off'
          />
          {patientResults.length > 0 && !patient && (
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
                    setPatient(r);
                    setPatientResults([]);
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
          <Select id='lc-doctor' name='doctorId' label='Médico (opcional)'>
            <option value=''>—</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Laboratório + tipo de trabalho */}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <div>
            <Input
              id='lc-lab'
              name='labName'
              label='Laboratório *'
              required
              list='lc-known-labs'
              placeholder='Nome da empresa'
              autoComplete='off'
            />
            <datalist id='lc-known-labs'>
              {knownLabs.map(l => (
                <option key={l} value={l} />
              ))}
            </datalist>
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
            defaultValue={todayStr}
            required
          />
          <Input
            id='lc-due'
            name='dueDate'
            type='date'
            label='Chegada prevista *'
            min={todayStr}
            required
            help='O alerta de atraso dispara a partir desta data'
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
          <Button type='submit' loading={pending} disabled={!patient}>
            Registar envio
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
  knownLabs,
}: {
  clinics: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
  knownLabs: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PackagePlus size={16} style={{ marginRight: 6 }} />
        Registar envio
      </Button>
      <NewLabCaseModal
        open={open}
        onClose={() => setOpen(false)}
        clinics={clinics}
        doctors={doctors}
        knownLabs={knownLabs}
      />
    </>
  );
}
