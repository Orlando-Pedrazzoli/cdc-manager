// 📄 src/lib/patient-search.ts
// =============================================================================
// CDC Manager — Pesquisa de paciente: UM filtro e UM formato de resultado
// -----------------------------------------------------------------------------
// Apontamento 02 da 2.ª reunião: "muitos pacientes com o mesmo nome e data
// de nascimento — na marcação ou ao abrir a ficha é difícil confirmar se é
// a pessoa certa". Até aqui havia 4 cópias do filtro (header, agenda,
// listagem admin, listagem do médico) com 3 caminhos (processo, telefone,
// nome). Passa a haver um só, com 6 caminhos, e um resultado com o que
// identifica inequivocamente a pessoa: foto, NIF, nº de utente, telemóvel
// e data de nascimento.
//
// Caminhos do filtro (todos em $or — o termo bate em QUALQUER um):
//   · nº de processo   — termo só dígitos, 1–6
//   · telemóvel        — ≥6 dígitos → contido no número guardado (E.164)
//   · NIF              — exatamente 9 dígitos (igualdade)
//   · nº de utente SNS — exatamente 9 dígitos (igualdade)
//   · data nascimento  — dd/mm/aaaa, dd-mm-aaaa ou aaaa-mm-dd (dia exato;
//                        birthDate é guardado a 00:00Z — ver validations)
//   · nome             — todas as palavras têm de aparecer (ordem livre)
//
// Um termo de 9 dígitos tenta telefone + NIF + utente ao mesmo tempo: o
// utilizador não precisa de dizer o que está a colar.
//
// SERVER-ONLY (usa a assinatura Cloudinary). Os componentes de cliente
// importam apenas o TIPO PatientSearchHit (`import type` — apagado no build).
// =============================================================================

import { signedPreviewUrl } from '@/lib/cloudinary';

export interface PatientSearchHit {
  id: string;
  processNumber: number;
  name: string;
  phone: string | null;
  nif: string | null;
  snsNumber: string | null;
  /** dd/mm/aaaa (Lisboa) — já formatada */
  birth: string | null;
  /** Miniatura assinada (Cloudinary, 96px) ou null sem foto */
  photoUrl: string | null;
  /** Texto de uma linha para inputs que mostram o paciente escolhido */
  label: string;
}

/** Campos a pedir ao Mongo para construir um PatientSearchHit */
export const PATIENT_SEARCH_SELECT =
  'processNumber name phone nif snsNumber birthDate photoPublicId';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const birthFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

/** dd/mm/aaaa · dd-mm-aaaa · aaaa-mm-dd → intervalo [00:00Z, +24h) ou null */
function birthRangeFromTerm(term: string): { $gte: Date; $lt: Date } | null {
  let y: number, m: number, d: number;
  let match = term.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else {
    match = term.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const start = new Date(Date.UTC(y, m - 1, d));
  if (start.getUTCMonth() !== m - 1 || start.getUTCDate() !== d) return null;
  return { $gte: start, $lt: new Date(start.getTime() + 86_400_000) };
}

/**
 * Devolve as cláusulas $or para o termo, ou [] se o termo não dá para
 * pesquisar (menos de 2 caracteres úteis). O chamador junta o resto do
 * filtro (status, _id $in, …).
 */
export function patientSearchOr(rawTerm: string): Record<string, unknown>[] {
  const term = rawTerm.trim();
  if (term.length < 2) return [];

  const digits = term.replace(/\D/g, '');
  const or: Record<string, unknown>[] = [];

  // Uma data escrita (10/10/1980) tem 8 dígitos — não é um telemóvel
  const birth = birthRangeFromTerm(term);
  if (birth) {
    or.push({ birthDate: birth });
  }
  if (/^\d{1,6}$/.test(term)) {
    or.push({ processNumber: Number(term) });
  }
  if (!birth && digits.length >= 6) {
    or.push({ phone: { $regex: escapeRegex(digits) } });
  }
  const compact = term.replace(/\s/g, '');
  if (/^\d{9}$/.test(compact)) {
    or.push({ nif: compact });
    or.push({ snsNumber: compact });
  }
  // Nome: só quando o termo tem letras — um termo numérico puro não deve
  // fazer regex sobre todos os nomes da base
  if (/\p{L}/u.test(term)) {
    const words = term
      .split(/\s+/)
      .filter(Boolean)
      .map(w => ({ name: { $regex: escapeRegex(w), $options: 'i' } }));
    if (words.length > 0) {
      or.push(words.length === 1 ? words[0] : { $and: words });
    }
  }
  return or;
}

/** Documento lean do Patient (com PATIENT_SEARCH_SELECT) → hit */
export function toPatientSearchHit(p: {
  _id: unknown;
  processNumber?: number | null;
  name?: string | null;
  phone?: string | null;
  nif?: string | null;
  snsNumber?: string | null;
  birthDate?: Date | null;
  photoPublicId?: string | null;
}): PatientSearchHit {
  const name = p.name ?? '';
  const processNumber = p.processNumber ?? 0;
  const phone = p.phone ?? null;
  const birth = p.birthDate ? birthFmt.format(p.birthDate) : null;
  return {
    id: String(p._id),
    processNumber,
    name,
    phone,
    nif: p.nif ?? null,
    snsNumber: p.snsNumber ?? null,
    birth,
    photoUrl: p.photoPublicId
      ? signedPreviewUrl(p.photoPublicId, { width: 96 })
      : null,
    label: `${processNumber} · ${name}${birth ? ` · ${birth}` : ''}${phone ? ` · ${phone}` : ''}`,
  };
}
