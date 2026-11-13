// 📄 src/lib/patient-messages.ts
// =============================================================================
// CDC Manager — Mensagens ao paciente a partir do dashboard (7.ª ronda/A1)
// -----------------------------------------------------------------------------
// Victor (12/11/2026): "No bloco 'Aniversários hoje', poder enviar uma
// mensagem de parabéns diretamente a partir do sistema. No bloco 'Faltas e
// cancelamentos hoje', o mesmo, com uma mensagem padrão para quem faltou. Os
// textos seriam predefinidos e editáveis apenas pela gestão."
//
// Dois canais (decisão do Orlando, 13/11/2026):
//   · WhatsApp — o botão abre o WhatsApp da receção com o texto já escrito
//     para o telemóvel do paciente (link wa.me); a rececionista carrega em
//     enviar. Não precisa de contrato com a Meta.
//   · Email — enviado pelo sistema (Resend).
//
// Aqui só vivem as regras puras: textos por omissão, marcadores, telemóvel
// em formato internacional e o link. Testado em scripts/tests/ronda-7.test.ts.
// =============================================================================

export const MESSAGE_KINDS = ['birthday', 'no-show'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  birthday: 'Parabéns (aniversário)',
  'no-show': 'Falta à consulta',
};

export const MESSAGE_TEMPLATE_MAX = 600;

/** Marcadores aceites nos textos, com a explicação mostrada à gestão */
export const MESSAGE_PLACEHOLDERS: Record<string, string> = {
  '{nome}': 'primeiro nome do paciente',
  '{clinica}': 'nome da clínica',
  '{telefone}': 'telefone da clínica',
  '{hora}': 'hora da consulta (só na mensagem de falta)',
};

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageKind, string> = {
  birthday:
    'Olá {nome}! A equipa do {clinica} deseja-lhe um feliz aniversário e um dia cheio de sorrisos. 🎉',
  'no-show':
    'Olá {nome}, sentimos a sua falta hoje na consulta das {hora} no {clinica}. Quer que remarquemos? Responda a esta mensagem ou ligue-nos para o {telefone}.',
};

export interface MessageVars {
  patientName: string;
  clinicName: string;
  clinicPhone?: string | null;
  time?: string | null;
}

/** "MARIA JOÃO DA SILVA" → "Maria" */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Texto final: usa o modelo da gestão ou, vazio, o texto por omissão */
export function renderMessage(
  kind: MessageKind,
  template: string | null | undefined,
  vars: MessageVars,
): string {
  const base = template?.trim() ? template.trim() : DEFAULT_MESSAGE_TEMPLATES[kind];
  return base
    .replaceAll('{nome}', firstName(vars.patientName) || 'paciente')
    .replaceAll('{clinica}', vars.clinicName)
    .replaceAll('{telefone}', vars.clinicPhone?.trim() || 'a clínica')
    .replaceAll('{hora}', vars.time?.trim() || 'hoje')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Telemóvel em formato internacional só com dígitos, como o wa.me pede.
 * Números portugueses de 9 dígitos ganham o 351; "+351 9…" e "00351 9…"
 * ficam "3519…". Devolve null se não der um número utilizável.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && /^[2-9]/.test(digits)) digits = `351${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Link que abre o WhatsApp (Web ou app) com a conversa e o texto prontos */
export function whatsAppLink(
  phone: string | null | undefined,
  text: string,
): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * Fichas do Dentoral marcadas para não usar ("(NAO USAR)", "NÃO USAR" no
 * nome): duplicados e registos mortos, que não devem receber mensagens nem
 * aparecer nos aniversários.
 */
export function isDoNotUseName(name: string | null | undefined): boolean {
  if (!name) return false;
  const plain = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  return /\bNAO\s+USAR\b/.test(plain);
}
