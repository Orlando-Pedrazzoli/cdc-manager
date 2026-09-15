// 📄 src/components/agenda/ExtendDayModal.tsx
// =============================================================================
// CDC Manager — Agenda: estender horário de um médico neste dia (Fase 4B, P3)
// -----------------------------------------------------------------------------
// "Termos a opção de estender horários de marcações." Escolhe o médico e a
// hora até à qual passa a atender hoje; a coluna dele na agenda alarga e o
// site passa a oferecer esses slots. Grava como exceção 'custom' do dia.
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Clock3 } from 'lucide-react';
import { extendDoctorDayAction } from '@/actions/doctors';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export function ExtendDayButton({
  clinicId,
  date,
  dateLabel,
  doctors,
}: {
  clinicId: string;
  date: string;
  dateLabel: string;
  doctors: { id: string; name: string; until: string | null }[]; // until = fim atual
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '');
  const [until, setUntil] = useState('20:00');
  const [from, setFrom] = useState('09:00');
  const [busy, setBusy] = useState(false);
  const current = doctors.find(d => d.id === doctorId);

  return (
    <>
      <Button
        variant='secondary'
        onClick={() => setOpen(true)}
        title='Estender horário de um médico neste dia'
      >
        <Clock3 size={15} style={{ marginRight: 6 }} />
        Estender horário
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Estender horário — ${dateLabel}`}
        maxWidth={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select
            label='Médico'
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
          >
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.until ? ` (hoje até às ${d.until})` : ' (sem horário hoje)'}
              </option>
            ))}
          </Select>
          {current && !current.until && (
            <Input
              type='time'
              label='Começa às'
              value={from}
              onChange={e => setFrom(e.target.value)}
              step={300}
            />
          )}
          <Input
            type='time'
            label='Passa a atender até às'
            value={until}
            onChange={e => setUntil(e.target.value)}
            step={300}
            help='Só neste dia e nesta clínica. Fica registado como horário especial na ficha do médico.'
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant='secondary' onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={busy}
              disabled={!doctorId}
              onClick={async () => {
                setBusy(true);
                const r = await extendDoctorDayAction({
                  doctorId,
                  clinicId,
                  date,
                  until,
                  from,
                });
                setBusy(false);
                if (r.error) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`Horário estendido até às ${until}.`);
                setOpen(false);
                router.refresh();
              }}
            >
              Estender
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
