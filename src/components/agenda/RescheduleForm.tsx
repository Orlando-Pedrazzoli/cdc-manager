// 📄 src/components/agenda/RescheduleForm.tsx
// =============================================================================
// CDC Manager — Agenda: remarcar (Fase 4B, P3)
// -----------------------------------------------------------------------------
// "Remarcar para outro médico no mesmo dia, ou em outro dia." Vive dentro
// do painel da marcação (AgendaGrid): data, hora, médico da clínica (ou
// manter), clínica, e a opção "Encaixar fora do horário" (force). A action
// já existente cancela a original e cria a nova ligadas (rescheduledFrom/To);
// o Histórico mostra a ligação.
// =============================================================================

'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  rescheduleAppointmentAction,
  type AppointmentFormState,
} from '@/actions/appointments';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Input';

export interface RescheduleClinic {
  id: string;
  name: string;
  doctors: { id: string; name: string }[];
}

export function RescheduleForm({
  appointmentId,
  currentClinicId,
  currentDoctorId,
  currentDate,
  currentStart,
  clinics,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  currentClinicId: string;
  currentDoctorId: string | null;
  currentDate: string; // YYYY-MM-DD
  currentStart: string; // HH:mm
  clinics: RescheduleClinic[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(currentClinicId);
  const [doctorId, setDoctorId] = useState(currentDoctorId ?? '');
  const [date, setDate] = useState(currentDate);
  const [start, setStart] = useState(currentStart);
  const [force, setForce] = useState(false);

  const action = rescheduleAppointmentAction.bind(null, appointmentId);
  const [state, formAction, pending] = useActionState<
    AppointmentFormState,
    FormData
  >(action, undefined);
  const handled = useRef<AppointmentFormState>(undefined);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) {
      toast.error(state.error);
      return;
    }
    toast.success('Marcação remarcada. A original fica no histórico.');
    router.refresh();
    onDone();
  }, [state, router, onDone]);

  const clinic = clinics.find(c => c.id === clinicId) ?? clinics[0];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('clinicId', clinicId);
        fd.set('doctorId', doctorId);
        fd.set('date', date);
        fd.set('start', start);
        if (force) fd.set('force', 'on');
        startTransition(() => formAction(fd));
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Input
          type='date'
          label='Nova data *'
          value={date}
          min={todayStr}
          onChange={e => setDate(e.target.value)}
          required
        />
        <Input
          type='time'
          label='Hora *'
          value={start}
          step={300}
          onChange={e => setStart(e.target.value)}
          required
        />
        {clinics.length > 1 && (
          <Select
            label='Clínica'
            value={clinicId}
            onChange={e => {
              setClinicId(e.target.value);
              setDoctorId('');
            }}
          >
            {clinics.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label='Médico'
          value={doctorId}
          onChange={e => setDoctorId(e.target.value)}
          help='Mesmo médico ou outro, no mesmo dia ou noutro'
        >
          <option value=''>— Sem médico —</option>
          {(clinic?.doctors ?? []).map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <Checkbox
        id='resched-force'
        label='Encaixar fora do horário do médico'
        checked={force}
        onChange={e => setForce(e.target.checked)}
        help='Continua a impedir sobreposição com outra marcação'
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type='submit' size='sm' loading={pending}>
          Confirmar remarcação
        </Button>
        <Button type='button' size='sm' variant='secondary' onClick={onCancel}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
