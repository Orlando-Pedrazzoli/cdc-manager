// 📄 src/components/agenda/AgendaToolbar.tsx
// =============================================================================
// CDC Manager — Agenda: botão "Nova marcação" + modal
// Client Component fino: o único trabalho é o estado open/close do
// NewAppointmentModal (a página é server e não pode ter handlers).
// 3.ª reunião/04: recebe nome curto + cor da clínica e passa-os ao modal.
// =============================================================================

'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { NewAppointmentModal } from '@/components/agenda/NewAppointmentModal';

export function AgendaToolbar({
  clinicId,
  clinic,
  date,
  doctors,
  treatments,
  rooms = [],
  buttonLabel,
}: {
  clinicId: string;
  /** Nome curto + cor da clínica ativa (destaque no modal) */
  clinic?: { label: string; color: string };
  date: string;
  rooms?: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
  treatments: { id: string; name: string; category?: string | null }[];
  buttonLabel: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        style={
          clinic
            ? {
                backgroundColor: clinic.color,
                border: `1px solid ${clinic.color}`,
              }
            : undefined
        }
      >
        {buttonLabel}
      </Button>
      <NewAppointmentModal
        open={open}
        onClose={() => setOpen(false)}
        clinicId={clinicId}
        clinic={clinic}
        initialDate={date}
        doctors={doctors}
        treatments={treatments}
        rooms={rooms}
      />
    </>
  );
}
