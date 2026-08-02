// 📄 src/components/agenda/NewAppointmentModal.tsx
// =============================================================================
// CDC Manager — Agenda: modal de nova marcação (balcão)
// -----------------------------------------------------------------------------
// Fluxo da receção: pesquisar paciente (nome/telefone/nº processo, top 8)
// → ato → médico (opcional) → horário:
//   - COM médico: dropdown alimentado por getFreeSlotsAction — a receção só
//     vê horários realmente livres (camada 1 da defesa anti-dupla-marcação)
//   - SEM médico (fila de atribuição): hora livre em input time; a action
//     valida a capacidade da clínica na transação (camada 2)
// =============================================================================

'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import {
  createAppointmentAction,
  findPatientsAction,
  type AppointmentFormState,
} from '@/actions/appointments';
import { getFreeSlotsAction } from '@/actions/agenda';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export function NewAppointmentModal({
  open,
  onClose,
  clinicId,
  date,
  doctors,
  treatments,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  date: string; // 'YYYY-MM-DD'
  doctors: { id: string; name: string }[];
  treatments: { id: string; name: string }[];
}) {
  const router = useRouter();

  // --- Pesquisa de paciente --------------------------------------------------
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

  // --- Ato / médico / slots --------------------------------------------------
  const [treatmentId, setTreatmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [slots, setSlots] = useState<{ start: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [start, setStart] = useState('');

  useEffect(() => {
    setStart('');
    if (!doctorId || !treatmentId) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    getFreeSlotsAction({
      clinicId,
      doctorId,
      treatmentTypeId: treatmentId,
      date,
    })
      .then(s => {
        if (!cancelled) setSlots(s);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, treatmentId, clinicId, date]);

  // --- Submit ----------------------------------------------------------------
  const [state, formAction, pending] = useActionState<
    AppointmentFormState,
    FormData
  >(createAppointmentAction, undefined);
  const handled = useRef<AppointmentFormState>(undefined);

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) return;
    toast.success('Marcação criada.');
    router.refresh();
    onClose();
    // Reset para a próxima abertura
    setPatient(null);
    setPatientQuery('');
    setTreatmentId('');
    setDoctorId('');
    setStart('');
  }, [state, router, onClose]);

  return (
    <Modal open={open} onClose={onClose} title='Nova marcação' maxWidth={560}>
      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <input type='hidden' name='clinicId' value={clinicId} />
        <input type='hidden' name='date' value={date} />
        <input type='hidden' name='patientId' value={patient?.id ?? ''} />

        {/* Paciente */}
        <div style={{ position: 'relative' }}>
          <Input
            id='ap-patient'
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

        {/* Ato + médico */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
          }}
        >
          <Select
            id='ap-treatment'
            name='treatmentTypeId'
            label='Ato *'
            value={treatmentId}
            onChange={e => setTreatmentId(e.target.value)}
            required
          >
            <option value=''>— Selecionar —</option>
            {treatments.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            id='ap-doctor'
            name='doctorId'
            label='Médico'
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
          >
            <option value=''>— Atribuir depois —</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Horário */}
        {doctorId ? (
          <Select
            id='ap-start'
            name='start'
            label={`Horário livre * ${slotsLoading ? '(a carregar…)' : ''}`}
            value={start}
            onChange={e => setStart(e.target.value)}
            required
            disabled={!treatmentId || slotsLoading}
            help={
              treatmentId && !slotsLoading && slots.length === 0
                ? 'Sem horários livres para este médico/ato neste dia.'
                : undefined
            }
          >
            <option value=''>— Selecionar —</option>
            {slots.map(s => (
              <option key={s.start} value={s.start}>
                {s.start}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id='ap-start-free'
            name='start'
            type='time'
            label='Hora *'
            required
            help='Sem médico atribuído — a capacidade da clínica é verificada ao guardar.'
          />
        )}

        <Textarea
          id='ap-note'
          name='note'
          label='Nota (opcional)'
          maxLength={500}
          rows={2}
          placeholder='Ex.: paciente pede RX recente'
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
            Criar marcação
          </Button>
        </div>
      </form>
    </Modal>
  );
}
