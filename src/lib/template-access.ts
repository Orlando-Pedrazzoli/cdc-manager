// 📄 src/lib/template-access.ts
// =============================================================================
// CDC Manager — Quem pode emitir um modelo de documento
// -----------------------------------------------------------------------------
// Regra de sempre: o médico emite qualquer modelo; a gestão e a receção só
// os modelos marcados "a receção também pode emitir" (allowStaff).
//
// 9.ª ronda (c), Victor 27/11/2026 — contratos de aparelho e de alinhadores:
// "o acesso a estes contratos fique apenas para a gestão, a receção e as
// médicas Dra. Christina, Dra. Camila e Dra. Ana Paula. Gostaria de poder
// ser eu a habilitar ou retirar o acesso a cada pessoa."
// → cada modelo pode ser RESTRITO a uma lista de médicos, que a gestão
//   edita em Modelos de documentos. Num modelo restrito, o médico que não
//   está na lista não o vê na lista de modelos nem o consegue emitir.
//   Lista vazia = nenhum médico.
//
// O mesmo vale para os contratos JÁ EMITIDOS (categoria "contract" na ficha
// do paciente): o médico só os vê se estiver autorizado em pelo menos um
// modelo de contrato ativo, ou se foi ele que carregou o ficheiro.
//
// Funções puras (sem base de dados) — testadas em
// scripts/tests/ronda-9c.test.ts. As consultas à BD ficam em quem chama.
// =============================================================================

export type IssuerRole = 'admin' | 'receptionist' | 'doctor';

export interface TemplateAccessFields {
  allowStaff?: boolean | null;
  restrictedToDoctors?: boolean | null;
  allowedDoctorIds?: readonly unknown[] | null;
}

/** O médico está na lista do modelo? (lista vazia = ninguém) */
export function doctorIsAllowed(
  t: TemplateAccessFields,
  doctorId: string | null | undefined,
): boolean {
  if (!t.restrictedToDoctors) return true;
  if (!doctorId) return false;
  return (t.allowedDoctorIds ?? []).some(id => String(id) === doctorId);
}

/**
 * Motivo por que este utilizador NÃO pode emitir o modelo; null se pode.
 * Para o médico sem acesso a mensagem é a de modelo inexistente: não se
 * confirma a quem não tem acesso que o modelo existe.
 */
export function templateIssueBlock(
  t: TemplateAccessFields,
  who: { role: string; doctorId?: string | null },
): string | null {
  if (who.role === 'doctor') {
    return doctorIsAllowed(t, who.doctorId) ? null : 'Modelo indisponível.';
  }
  if (who.role === 'admin' || who.role === 'receptionist') {
    return t.allowStaff ? null : 'Este modelo só pode ser emitido pelo médico.';
  }
  return 'Sem permissões.';
}

/** Filtro Mongo dos modelos que este utilizador pode ver ao emitir */
export function templateListFilter(who: {
  role: IssuerRole;
  doctorId?: string | null;
}): Record<string, unknown> {
  if (who.role !== 'doctor') return { active: true, allowStaff: true };
  const open = { restrictedToDoctors: { $ne: true } };
  return who.doctorId
    ? { active: true, $or: [open, { allowedDoctorIds: who.doctorId }] }
    : { active: true, ...open };
}

// --- Contratos já emitidos (documentos da ficha) -------------------------------
export const CONTRACT_DOCUMENT_CATEGORY = 'contract';

/** Filtro Mongo: o médico tem acesso a algum modelo de contrato ativo? */
export function contractAccessQuery(doctorId: string): Record<string, unknown> {
  return {
    kind: 'contrato',
    active: true,
    $or: [
      { restrictedToDoctors: { $ne: true } },
      { allowedDoctorIds: doctorId },
    ],
  };
}

/** Normaliza a lista vinda do formulário: ids válidos, sem repetidos */
export function cleanDoctorIds(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of raw) {
    const id = typeof v === 'string' ? v.trim() : '';
    if (/^[0-9a-fA-F]{24}$/.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

// --- Médico que aparece no TEXTO do documento ------------------------------------
/**
 * 28/11/2026: o médico que emite é o que aparece no texto ({{medico.nome}},
 * {{medico.cedula}}). Quando emite a gestão ou a receção (sem perfil médico),
 * usa-se o médico da consulta escolhida; sem consulta, fica em branco para
 * preencher à mão. Não muda quem assina.
 */
export function documentTextDoctorId(
  issuerDoctorId: string | null | undefined,
  appointmentDoctorId: string | null | undefined,
): string | null {
  const ok = (v: string | null | undefined) =>
    typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) ? v : null;
  return ok(issuerDoctorId) ?? ok(appointmentDoctorId);
}
