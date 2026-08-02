// 📄 src/components/agenda/AgendaToolbar.tsx
// =============================================================================
// CDC Manager — Agenda: botão "Nova marcação" + modal
// Client Component fino: o único trabalho é o estado open/close do
// NewAppointmentModal (a página é server e não pode ter handlers).
// =============================================================================

'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { NewAppointmentModal } from '@/components/agenda/NewAppointmentModal';

export function AgendaToolbar({
  clinicId,
  date,
  doctors,
  treatments,
  buttonLabel,
}: {
  clinicId: string;
  date: string;
  doctors: { id: string; name: string }[];
  treatments: { id: string; name: string }[];
  buttonLabel: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{buttonLabel}</Button>
      <NewAppointmentModal
        open={open}
        onClose={() => setOpen(false)}
        clinicId={clinicId}
        date={date}
        doctors={doctors}
        treatments={treatments}
      />
    </>
  );
}
