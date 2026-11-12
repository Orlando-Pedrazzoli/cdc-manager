// 📄 src/actions/odontogram-finder.ts
// =============================================================================
// CDC Manager — Server Action: procurar paciente para abrir o odontograma
// -----------------------------------------------------------------------------
// 5.ª ronda/02+12 (Victor, nov. 2026): "Médicos, assistentes e rececionistas
// trabalham todos os dias com a informação do odontograma" → consulta (só
// leitura) para todos os utilizadores internos, com um atalho no menu.
//
// Ao contrário de findPatientsAction (só receção/admin), esta pesquisa serve
// também o MÉDICO, para qualquer paciente da clínica — por isso devolve o
// mínimo para o identificar: nº de processo, nome e data de nascimento. Sem
// telefone, NIF, nº de utente nem fotografia.
// =============================================================================

'use server';

import Patient from '@/models/Patient';
import { getVerifiedSession } from '@/lib/get-verified-session';
import { patientSearchOr } from '@/lib/patient-search';

export interface OdontogramFinderHit {
  id: string;
  processNumber: number | null;
  name: string;
  /** dd/mm/aaaa ou null */
  birth: string | null;
}

const birthFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

export async function findPatientsForOdontogramAction(
  q: string,
): Promise<OdontogramFinderHit[]> {
  // getVerifiedSession liga à BD e revalida conta, perfil e rede
  const session = await getVerifiedSession(['admin', 'receptionist', 'doctor']);
  if (!session) return [];
  const or = patientSearchOr(typeof q === 'string' ? q : '');
  if (or.length === 0) return [];

  const patients = await Patient.find({ status: 'active', $or: or })
    .sort({ processNumber: -1 })
    .limit(10)
    .select('processNumber name birthDate')
    .lean();

  return patients.map(p => ({
    id: String(p._id),
    processNumber: p.processNumber ?? null,
    name: p.name,
    birth: p.birthDate ? birthFmt.format(p.birthDate) : null,
  }));
}
