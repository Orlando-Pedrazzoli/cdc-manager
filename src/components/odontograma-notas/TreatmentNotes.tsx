// 📄 src/components/odontograma-notas/TreatmentNotes.tsx
// =============================================================================
// CDC Manager — Notas do tratamento, na aba do odontograma (ponto 32)
// Server Component: carrega as notas do paciente. O formulário e os botões
// estão em TreatmentNotesClient. Quem chama já validou o acesso ao paciente.
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import { noteAuthorLabel } from '@/lib/treatment-notes';
import TreatmentNote from '@/models/TreatmentNote';
import {
  TreatmentNotesClient,
  type TreatmentNoteItem,
} from '@/components/odontograma-notas/TreatmentNotesClient';

const fmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Lisbon',
});

export async function TreatmentNotes({ patientId }: { patientId: string }) {
  await dbConnect();
  const notes = await TreatmentNote.find({ patientId })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const toItem = (n: (typeof notes)[number]): TreatmentNoteItem => ({
    id: String(n._id),
    text: n.text,
    author: noteAuthorLabel(n.authorName, n.authorRole),
    when: fmt.format(n.createdAt as Date).replace(',', ''),
    archived: n.archivedAt
      ? `Arquivada a ${fmt.format(n.archivedAt as Date).replace(',', '')}${n.archivedByName ? ` por ${n.archivedByName}` : ''}`
      : null,
  });
  return (
    <TreatmentNotesClient
      patientId={patientId}
      active={notes.filter(n => !n.archivedAt).map(toItem)}
      archived={notes.filter(n => n.archivedAt).map(toItem)}
    />
  );
}
