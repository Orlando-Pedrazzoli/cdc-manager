// 📄 src/lib/odontogram-history.ts
// =============================================================================
// CDC Manager — Odontograma: histórico de tratamentos do paciente (server)
// -----------------------------------------------------------------------------
// 4.ª ronda (Victor, nov. 2026), ponto 07: "mostrar no odontograma o
// histórico do paciente: atos por dente e por data, com o médico responsável
// e as observações de cada ato" — o médico tem tudo no mesmo ecrã, sem mudar
// de separador.
//
// Um só carregamento serve as duas vistas do ecrã:
//   · `history`           — tudo por data (inclui atos sem dente, ex.:
//                           destartarização) para a tabela por baixo do mapa;
//   · `proceduresByTooth` — os mesmos atos indexados por dente, para o painel
//                           do dente (antes vivia duplicado nas duas páginas).
// As notas clínicas (ClinicalRecord.notes — as "Observações" do Dentoral) só
// entram quando `includeClinicalNotes` (área do médico); a área
// administrativa vê as observações dos atos, que já são visíveis à receção.
// =============================================================================

import Procedure from '@/models/Procedure';
import Doctor from '@/models/Doctor';
import ClinicalRecord from '@/models/ClinicalRecord';
import type { ToothProcedure } from '@/components/clinico/ToothDetail';

export type OdontogramHistoryEntry = {
  id: string;
  kind: 'act' | 'note';
  /** ISO — para ordenar; null = ato planeado ainda sem data */
  dateIso: string | null;
  dateLabel: string | null;
  teeth: string[];
  faces: string[];
  /** nome do ato, ou "Nota clínica" */
  name: string;
  status: ToothProcedure['status'] | null;
  doctorName: string | null;
  /** observações do ato / texto da nota clínica */
  notes: string | null;
};

const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Lisbon' });

export async function loadOdontogramHistory(
  patientId: string,
  opts: { includeClinicalNotes: boolean },
): Promise<{ history: OdontogramHistoryEntry[]; proceduresByTooth: Record<string, ToothProcedure[]> }> {
  const [procs, record] = await Promise.all([
    Procedure.find({ patientId, status: { $in: ['planned', 'completed', 'invoiced', 'void'] } })
      .select('nameSnapshot status toothNumbers faces executedAt createdAt priceCents doctorId notes')
      .sort({ executedAt: -1, createdAt: -1 })
      .lean(),
    opts.includeClinicalNotes ? ClinicalRecord.findOne({ patientId }).select('notes').lean() : null,
  ]);
  const notes = ((record as { notes?: { _id: unknown; doctorId: unknown; text: string; createdAt: Date }[] } | null)?.notes ?? []);

  const doctorIds = [...new Set([...procs.map(p => String(p.doctorId)), ...notes.map(n => String(n.doctorId))].filter(id => /^[0-9a-fA-F]{24}$/.test(id)))];
  const doctors = doctorIds.length ? await Doctor.find({ _id: { $in: doctorIds } }).select('name').lean() : [];
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));

  const history: OdontogramHistoryEntry[] = [];
  const proceduresByTooth: Record<string, ToothProcedure[]> = {};
  for (const p of procs) {
    const status = p.status as ToothProcedure['status'];
    const teeth = (p.toothNumbers ?? []) as string[];
    const faces = ((p.faces ?? []) as string[]).filter(Boolean);
    const dateLabel = p.executedAt ? dateFmt.format(p.executedAt as Date) : null;
    const doctor = doctorName.get(String(p.doctorId)) ?? null;
    const note = (p.notes as string | null) ?? null;
    history.push({
      id: String(p._id),
      kind: 'act',
      dateIso: p.executedAt ? (p.executedAt as Date).toISOString() : null,
      dateLabel,
      teeth,
      faces,
      name: p.nameSnapshot,
      status,
      doctorName: doctor,
      notes: note,
    });
    for (const tooth of teeth) {
      (proceduresByTooth[tooth] ??= []).push({
        id: String(p._id),
        name: p.nameSnapshot,
        status,
        dateLabel,
        priceCents: p.priceCents,
        doctorName: doctor,
        notes: note,
        faces,
      });
    }
  }
  for (const n of notes) {
    if (!n.text?.trim()) continue;
    history.push({
      id: `note-${String(n._id)}`,
      kind: 'note',
      dateIso: n.createdAt ? new Date(n.createdAt).toISOString() : null,
      dateLabel: n.createdAt ? dateFmt.format(new Date(n.createdAt)) : null,
      teeth: [],
      faces: [],
      name: 'Nota clínica',
      status: null,
      doctorName: doctorName.get(String(n.doctorId)) ?? null,
      notes: n.text,
    });
  }
  // mais recente primeiro; planeados (sem data) no topo
  history.sort((a, b) => (a.dateIso === null ? 1 : 0) === (b.dateIso === null ? 1 : 0) ? (b.dateIso ?? '').localeCompare(a.dateIso ?? '') : a.dateIso === null ? -1 : 1);
  return { history, proceduresByTooth };
}
