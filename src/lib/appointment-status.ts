// 📄 src/lib/appointment-status.ts
// =============================================================================
// CDC Manager — Estados da marcação: rótulo e cor, num só sítio
// -----------------------------------------------------------------------------
// Fonte única para as pastilhas de estado nas várias vistas (ficha do
// paciente, agenda, portal). A agenda ainda tem a sua cópia local
// (STATUS_META) — migrar para aqui na próxima passagem pela agenda.
// =============================================================================

import type { AppointmentStatus } from '@/models/Appointment';

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; bg: string; fg: string }
> = {
  pending: { label: 'Pendente', bg: '#FFF4E0', fg: '#9A6700' },
  confirmed: { label: 'Confirmada', bg: '#E7F6EC', fg: '#1B7A3D' },
  'checked-in': { label: 'Check-in', bg: '#E8EEFF', fg: '#2743A6' },
  'in-progress': { label: 'Em consulta', bg: '#E8EEFF', fg: '#1B2A6B' },
  completed: { label: 'Concluída', bg: '#EEF0F4', fg: '#3A3F4A' },
  cancelled: { label: 'Cancelada', bg: '#FDEDED', fg: '#B3261E' },
  'no-show': { label: 'Falta', bg: '#FDEDED', fg: '#8C1D18' },
};
