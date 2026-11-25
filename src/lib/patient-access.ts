// 📄 src/lib/patient-access.ts
// =============================================================================
// CDC Manager — Acesso do médico às fichas: regras puras
// -----------------------------------------------------------------------------
// 9.ª ronda (pontos 07 e 08, Victor, 17 e 18/11):
//   07 — o médico pode abrir a ficha clínica de qualquer paciente, mas não vê
//        contactos, morada, NIF, documento de identificação, faturação nem a
//        lista geral de pacientes.
//   08 — "o sistema guarda quem abriu cada ficha e quando. Um médico que
//        consulte dezenas de fichas fora da agenda dele gera um alerta para a
//        gestão."
// Sem BD nem React, para serem testadas (scripts/tests/ronda-9.test.ts).
// =============================================================================

import type { ManagementAlert } from '@/lib/management-alerts';

/** Fichas fora da agenda, NO MESMO MÊS, a partir das quais a gestão é
 *  avisada. Victor, 25/11 (A9): "quando acontecer 8 vezes no mesmo mês"
 *  (antes: 20 num dia). Conta fichas diferentes, por médico. */
export const PATIENT_ACCESS_ALERT_THRESHOLD = 8;
/** A mesma ficha reaberta dentro deste tempo conta como o mesmo acesso */
export const PATIENT_ACCESS_DEDUPE_MIN = 30;
/** Marca gravada no registo quando o médico não tem consultas com o paciente */
export const ACCESS_OUTSIDE_AGENDA = 'fora-da-agenda';
export const ACCESS_ENTITY = 'PatientAccess';

/** Mínimo de letras para o médico pesquisar fora dos seus pacientes */
export const DOCTOR_SEARCH_MIN_CHARS = 3;
export const DOCTOR_SEARCH_LIMIT = 15;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pesquisa do MÉDICO: só por nome ou n.º do paciente. Telemóvel, NIF e n.º
 * de utente ficam de fora — senão a pesquisa servia para confirmar dados
 * que o médico não pode ver. [] = termo curto demais.
 */
export function doctorPatientSearchOr(rawTerm: string): Record<string, unknown>[] {
  const term = rawTerm.trim();
  if (/^\d{1,6}$/.test(term)) return [{ processNumber: Number(term) }];
  const letters = (term.match(/\p{L}/gu) ?? []).length;
  if (letters < DOCTOR_SEARCH_MIN_CHARS) return [];
  const words = term
    .split(/\s+/)
    .filter(w => /\p{L}/u.test(w))
    .map(w => ({ name: { $regex: escapeRegex(w), $options: 'i' } }));
  return words.length === 1 ? [words[0]] : [{ $and: words }];
}

export interface OutsideAgendaAccess {
  doctorId: string | null;
  doctorName: string;
  /** Fichas diferentes abertas este mês sem consultas com o paciente */
  patients: number;
}

/** Avisos à gestão: médicos com muitas fichas abertas fora da agenda no mês */
export function patientAccessAlerts(
  rows: OutsideAgendaAccess[],
  todayIso: string,
  threshold: number = PATIENT_ACCESS_ALERT_THRESHOLD,
): ManagementAlert[] {
  return rows
    .filter(r => r.patients >= threshold)
    .map(r => ({
      kind: 'patient-access' as const,
      level: r.patients >= threshold * 2 ? ('urgent' as const) : ('warning' as const),
      subject: r.doctorName,
      text: `Abriu este mês ${r.patients} fichas de pacientes com quem não tem consultas.`,
      date: todayIso,
      days: 0,
      href: r.doctorId
        ? `/admin/relatorios/acessos?dias=30&fora=1&medico=${r.doctorId}`
        : '/admin/relatorios/acessos?dias=30&fora=1',
      doctorId: r.doctorId,
    }));
}

// -----------------------------------------------------------------------------
// Victor, 25/11 (B3): a categoria "Outro" dos documentos pode ter cópia do
// documento de identificação — fica escondida do médico. O que o próprio
// médico carregou como "Outro" continua visível para ele (senão o ficheiro
// desaparecia-lhe logo a seguir ao upload).
// -----------------------------------------------------------------------------
export const DOCTOR_HIDDEN_DOCUMENT_CATEGORY = 'other';

export function doctorCanSeeDocument(
  doc: { category?: string | null; uploadedByUserId?: unknown },
  userId: string,
): boolean {
  if (doc.category !== DOCTOR_HIDDEN_DOCUMENT_CATEGORY) return true;
  return doc.uploadedByUserId != null && String(doc.uploadedByUserId) === userId;
}

/** O mesmo critério, como filtro de consulta à BD */
export function doctorDocumentFilter(userId: string): Record<string, unknown> {
  return {
    $or: [
      { category: { $ne: DOCTOR_HIDDEN_DOCUMENT_CATEGORY } },
      { uploadedByUserId: userId },
    ],
  };
}
