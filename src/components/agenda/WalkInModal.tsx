// 📄 src/components/agenda/WalkInModal.tsx
// =============================================================================
// CDC Manager — Agenda: urgência / paciente sem marcação (Fase 2, P5)
// -----------------------------------------------------------------------------
// "Opção para atendimentos de urgência (pacientes que chegam na clínica sem
// marcação)". A receção pesquisa o paciente, escolhe o ato (picker com lupa)
// e, opcionalmente, o médico; a marcação nasce AGORA, já em 'checked-in',
// com badge URG na agenda e na sala de espera.
// Sem validação de slot — o encaixe é decisão da receção.
// =============================================================================

'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Siren } from 'lucide-react';
import {
  createWalkInAction,
  type AppointmentFormState,
} from '@/actions/appointments';
import { usePatientSearch } from '@/components/agenda/usePatientSearch';
import { PatientSearchResult } from '@/components/pacientes/PatientSearchResult';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TreatmentPicker } from '@/components/clinico/TreatmentPicker';

interface Props {
  clinicId: string;
  doctors: { id: string; name: string }[];
  treatments: { id: string; name: string; category: string | null }[];
}

export function WalkInButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant='danger' onClick={() => setOpen(true)}>
        <Siren size={16} style={{ marginRight: 6 }} />
        Urgência
      </Button>
      <WalkInModal {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function WalkInModal({
  open,
  onClose,
  clinicId,
  doctors,
  treatments,
}: Props & { open: boolean; onClose: () => void }) {
  const router = useRouter();

  // --- pesquisa de paciente (hook partilhado com NewAppointmentModal) ---
  const {
    patientQuery,
    setPatientQuery,
    patient,
    setPatient,
    patientResults,
    reset: resetPatient,
  } = usePatientSearch();

  const [treatmentId, setTreatmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');

  // Efeitos do resultado (toast, fechar, refresh, reset) corridos no
  // próprio callback da action — sem useEffect a observar `state`
  const [, formAction, pending] = useActionState<
    AppointmentFormState,
    FormData
  >(async (prev, formData) => {
    const result = await createWalkInAction(prev, formData);
    if (result && 'error' in result) {
      toast.error(result.error);
      return result;
    }
    toast.success('Urgência registada — paciente em sala de espera.');
    router.refresh();
    onClose();
    resetPatient();
    setTreatmentId('');
    setDoctorId('');
    return result;
  }, undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title='Urgência — paciente sem marcação'
      maxWidth={560}
    >
      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <input type='hidden' name='clinicId' value={clinicId} />
        <input type='hidden' name='patientId' value={patient?.id ?? ''} />

        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          A marcação é criada <strong>agora</strong>, já com o paciente na sala
          de espera. Não valida disponibilidade — o encaixe é decisão da
          receção.
        </p>

        {/* Paciente */}
        <div style={{ position: 'relative' }}>
          <Input
            label='Paciente *'
            value={patient ? patient.label : patientQuery}
            onChange={e => {
              setPatient(null);
              setPatientQuery(e.target.value);
            }}
            placeholder='Nome, telemóvel, NIF, utente, nascimento ou nº de processo…'
            autoComplete='off'
          />
          {!patient && patientResults.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                zIndex: 20,
                left: 0,
                right: 0,
                margin: '4px 0 0',
                padding: 0,
                listStyle: 'none',
                backgroundColor: '#FFFFFF',
                border: '1px solid #D8DEEF',
                borderRadius: '10px',
                boxShadow: '0 10px 30px rgba(27,42,107,0.12)',
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {patientResults.map((r, i) => (
                <li key={r.id}>
                  <PatientSearchResult
                    hit={r}
                    first={i === 0}
                    onSelect={() => setPatient(r)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ato (picker com lupa) */}
        <TreatmentPicker
          name='treatmentTypeId'
          label='Motivo / ato *'
          options={treatments}
          value={treatmentId}
          onChange={setTreatmentId}
          placeholder='Pesquisar ato… (ex.: consulta de urgência)'
        />

        {/* Médico (opcional) */}
        <Select
          name='doctorId'
          label='Médico'
          value={doctorId}
          onChange={e => setDoctorId(e.target.value)}
          help='Opcional — fica em "Sem médico" até ser atribuída'
        >
          <option value=''>— Sem médico atribuído —</option>
          {doctors.map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <Textarea
          name='note'
          label='Queixa / observações'
          rows={2}
          maxLength={500}
          placeholder='ex.: dor aguda no 36 desde ontem'
        />

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type='submit'
            variant='danger'
            loading={pending}
            disabled={!patient || !treatmentId}
          >
            <Siren size={15} style={{ marginRight: 6 }} />
            Registar urgência
          </Button>
        </div>
      </form>
    </Modal>
  );
}
