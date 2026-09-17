// 📄 src/lib/resend.ts
// =============================================================================
// CDC Manager — Cliente Resend + templates de email transacional
// -----------------------------------------------------------------------------
// Ponto único de envio de email do sistema. Sprint 1 cobre:
//   1. Convite de ativação de conta (código CDC-XXXX-XXXX)
//   2. Recuperação de password (mesmo mecanismo, propósito 'password-reset')
//
// Decisões:
//   - Cliente lazy: instanciado no primeiro envio, nunca no import — evita
//     crash em build/edge quando RESEND_API_KEY não está presente.
//   - Templates em HTML inline (tabelas + estilos inline): é o único formato
//     verdadeiramente fiável em clientes de email (Gmail/Outlook ignoram
//     <style> externo). Cores da marca CDC: #1B2A6B / #2743A6 / #F4F6FB.
//   - Falha de envio NUNCA rebenta a operação principal: devolvemos
//     { ok, error } e o chamador decide (ex.: mostrar o código ao admin
//     para envio manual por WhatsApp — sentVia: 'manual').
//   - O código de ativação em claro passa por aqui apenas em trânsito;
//     nunca é logado (nem em erro).
// =============================================================================

import { Resend } from 'resend';
import { getOrganization, type Brand } from '@/models/Organization';

// -----------------------------------------------------------------------------
// Cliente (lazy singleton)
// -----------------------------------------------------------------------------
let _client: Resend | null = null;

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[resend] RESEND_API_KEY em falta. Defina no .env.local / Vercel.',
    );
  }
  _client ??= new Resend(apiKey);
  return _client;
}

// Remetente: Organization (nome + endereço) → EMAIL_FROM → default histórico.
// O endereço tem de pertencer a um domínio verificado no Resend.
const FALLBACK_FROM =
  process.env.EMAIL_FROM ??
  'Centro Dentário Colombo <noreply@send.centrodentariocolombo.com>';

async function resolveFrom(): Promise<string> {
  const org = await getOrganization();
  if (org.emailFromAddress) {
    return `${org.emailFromName ?? org.name} <${org.emailFromAddress}>`;
  }
  return FALLBACK_FROM;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export type SendResult = { ok: true } | { ok: false; error: string };

// -----------------------------------------------------------------------------
// Envio genérico com tratamento de erro uniforme
// -----------------------------------------------------------------------------
async function send(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  try {
    const { error } = await getClient().emails.send({
      from: await resolveFrom(),
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      console.error('[resend] erro no envio:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[resend] exceção no envio:', message);
    return { ok: false, error: message };
  }
}

// -----------------------------------------------------------------------------
// Layout base — moldura comum a todos os emails da clínica
// -----------------------------------------------------------------------------
function baseLayout(contentHtml: string, org: Brand): string {
  const footer =
    org.emailFooter ?? [org.name, org.address].filter(Boolean).join(' · ');
  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#F4F6FB;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F6FB;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Cabeçalho -->
          <tr>
            <td style="background-color:${org.primaryColor};border-radius:12px 12px 0 0;padding:24px 32px;" align="center">
              <span style="color:#FFFFFF;font-size:18px;font-weight:bold;letter-spacing:0.5px;">
                ${org.name}
              </span>
            </td>
          </tr>
          <!-- Conteúdo -->
          <tr>
            <td style="background-color:#FFFFFF;padding:32px;border-radius:0 0 12px 12px;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding:24px 32px;">
              <p style="margin:0;color:#9AA1B4;font-size:12px;line-height:1.6;">
                ${footer}<br />
                Este email foi enviado automaticamente — por favor não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Bloco de destaque do código CDC-XXXX-XXXX (grande, legível, copiável)
function codeBlock(plainCode: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td align="center" style="background-color:#F4F6FB;border:1px solid #D8DEEF;border-radius:10px;padding:20px;">
          <span style="color:#1B2A6B;font-size:26px;font-weight:bold;letter-spacing:3px;font-family:'Courier New',Courier,monospace;">
            ${plainCode}
          </span>
        </td>
      </tr>
    </table>`;
}

// Botão de ação (bulletproof: table-based, funciona em Outlook)
function actionButton(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
      <tr>
        <td align="center" style="background-color:#2743A6;border-radius:8px;">
          <a href="${href}" target="_blank"
             style="display:inline-block;padding:12px 28px;color:#FFFFFF;font-size:14px;font-weight:bold;text-decoration:none;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

// Formata a validade do código em pt-PT (ex.: "6 de agosto de 2026")
function formatExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// -----------------------------------------------------------------------------
// 1) CONVITE DE ATIVAÇÃO DE CONTA
// -----------------------------------------------------------------------------
export async function sendActivationEmail(params: {
  to: string;
  name: string;
  plainCode: string;
  expiresAt: Date;
}): Promise<SendResult> {
  const org = await getOrganization();
  // Deep-link: código + email seguem no URL — o utilizador só define a
  // password (o código já viaja neste mesmo email; o link não expõe nada
  // de novo, é single-use e expira)
  const activateUrl = `${APP_URL}/ativar?codigo=${encodeURIComponent(params.plainCode)}&email=${encodeURIComponent(params.to)}`;

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1B2A6B;font-size:20px;">
      Bem-vindo(a), ${params.name}
    </h1>
    <p style="margin:0 0 8px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Foi criada uma conta em seu nome no portal do
      <strong>${org.name}</strong>. Para a ativar e definir a sua
      password, utilize o seguinte código:
    </p>
    ${codeBlock(params.plainCode)}
    <p style="margin:0 0 8px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Clique no botão — o email e o código seguem já preenchidos; só
      precisa de definir a sua password:
    </p>
    ${actionButton('Ativar a minha conta', activateUrl)}
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      O código é válido até <strong>${formatExpiry(params.expiresAt)}</strong>
      e só pode ser utilizado uma vez. Se não solicitou esta conta, ignore
      este email.
    </p>`;

  return send({
    to: params.to,
    subject: `Ative a sua conta — ${org.name}`,
    html: baseLayout(content, org),
  });
}

// -----------------------------------------------------------------------------
// 2) RECUPERAÇÃO DE PASSWORD
// -----------------------------------------------------------------------------
export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  plainCode: string;
  expiresAt: Date;
}): Promise<SendResult> {
  const org = await getOrganization();
  // Deep-link: mesmo padrão da ativação — salta direto para a fase de
  // definição da nova password com email + código preenchidos
  const resetUrl = `${APP_URL}/recuperar-password?codigo=${encodeURIComponent(params.plainCode)}&email=${encodeURIComponent(params.to)}`;

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1B2A6B;font-size:20px;">
      Recuperação de password
    </h1>
    <p style="margin:0 0 8px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Olá ${params.name}, recebemos um pedido para redefinir a password da sua
      conta. Utilize o seguinte código para continuar:
    </p>
    ${codeBlock(params.plainCode)}
    ${actionButton('Redefinir password', resetUrl)}
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      O código é válido até <strong>${formatExpiry(params.expiresAt)}</strong>
      e só pode ser utilizado uma vez.<br /><br />
      <strong>Não fez este pedido?</strong> Ignore este email — a sua password
      atual mantém-se inalterada e ninguém consegue aceder à conta sem este
      código.
    </p>`;

  return send({
    to: params.to,
    subject: `Recuperação de password — ${org.name}`,
    html: baseLayout(content, org),
  });
}

// -----------------------------------------------------------------------------
// 3) CONFIRMAÇÃO DE MARCAÇÃO
// -----------------------------------------------------------------------------
// Enviada ao paciente quando a receção cria a marcação — SÓ com email na
// ficha E consentimento de lembretes (consents.remindersAt). Best-effort:
// a falha nunca reverte a marcação (padrão SendResult do projeto).
// Os lembretes T-72h/T-24h por WhatsApp/SMS chegam no Sprint 6.
export async function sendAppointmentConfirmationEmail(params: {
  to: string;
  patientName: string;
  clinicName: string;
  clinicAddress: string | null;
  dateLabel: string; // "Segunda-feira, 3 de agosto de 2026"
  timeLabel: string; // "15:30"
  treatmentName: string;
  doctorName: string | null;
  // Link público /confirmar/[token] — confirmação com um clique já no ato
  // da marcação (primeiro toque da cadência; o lembrete 24h repete-o)
  confirmUrl?: string | null;
}): Promise<SendResult> {
  const org = await getOrganization();
  const rows: [string, string][] = [
    ['Data', params.dateLabel],
    ['Hora', params.timeLabel],
    ['Ato', params.treatmentName],
  ];
  if (params.doctorName) rows.push(['Profissional', params.doctorName]);
  rows.push([
    'Clínica',
    params.clinicName +
      (params.clinicAddress ? ` — ${params.clinicAddress}` : ''),
  ]);

  const detailRows = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:6px 14px 6px 0;color:#6A7186;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td>
        <td style="padding:6px 0;color:#1B2A6B;font-size:14px;font-weight:600;">${v}</td>
      </tr>`,
    )
    .join('');

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1B2A6B;font-size:20px;">
      Consulta marcada ✔
    </h1>
    <p style="margin:0 0 12px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Olá ${params.patientName}, a sua consulta ficou marcada com os
      seguintes detalhes:
    </p>
    <table style="border-collapse:collapse;margin:0 0 16px 0;background:#F4F6FB;border-radius:10px;padding:8px;width:100%;">
      <tbody>${detailRows}</tbody>
    </table>
    ${
      params.confirmUrl
        ? `<p style="margin:0 0 4px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Pedimos que confirme a sua presença — basta um clique:
    </p>
    ${actionButton('Confirmar presença ✔', params.confirmUrl)}`
        : ''
    }
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      Se precisar de remarcar ou cancelar, contacte a clínica. Até breve!
    </p>`;

  return send({
    to: params.to,
    subject: `Consulta marcada — ${params.dateLabel}, ${params.timeLabel}`,
    html: baseLayout(content, org),
  });
}

// -----------------------------------------------------------------------------
// 4) NOTIFICAÇÃO INTERNA AO MÉDICO — nova marcação na SUA agenda
// -----------------------------------------------------------------------------
export async function sendDoctorNewAppointmentEmail(params: {
  to: string;
  doctorName: string;
  patientName: string;
  clinicName: string;
  dateLabel: string; // "Segunda-feira, 3 de agosto de 2026"
  timeLabel: string; // "15:30"
  treatmentName: string;
  note: string | null;
}): Promise<SendResult> {
  const org = await getOrganization();
  const agendaUrl = `${APP_URL}/doutor/agenda`;
  const rows: [string, string][] = [
    ['Paciente', params.patientName],
    ['Data', params.dateLabel],
    ['Hora', params.timeLabel],
    ['Ato', params.treatmentName],
    ['Clínica', params.clinicName],
  ];
  if (params.note) rows.push(['Nota', params.note]);

  const detailRows = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:6px 14px 6px 0;color:#6A7186;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td>
        <td style="padding:6px 0;color:#1B2A6B;font-size:14px;font-weight:600;">${v}</td>
      </tr>`,
    )
    .join('');

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1B2A6B;font-size:20px;">
      Nova marcação na sua agenda
    </h1>
    <p style="margin:0 0 12px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Olá Dr(a). ${params.doctorName}, foi criada uma nova marcação para si:
    </p>
    <table style="border-collapse:collapse;margin:0 0 16px 0;background:#F4F6FB;border-radius:10px;padding:8px;width:100%;">
      <tbody>${detailRows}</tbody>
    </table>
    ${actionButton('Ver a minha agenda', agendaUrl)}
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      Este é um aviso automático do ${org.appName}.
    </p>`;

  return send({
    to: params.to,
    subject: `Nova marcação — ${params.patientName}, ${params.dateLabel} às ${params.timeLabel}`,
    html: baseLayout(content, org),
  });
}

// -----------------------------------------------------------------------------
// 5) LEMBRETE 24H ANTES DA CONSULTA — com botão de confirmação (um clique)
// -----------------------------------------------------------------------------
// Enviado pelo cron /api/cron/reminders. Se a marcação ainda está 'pending',
// o botão confirma; se já está 'confirmed', o lembrete vai sem botão (a
// não-resposta a este email é o sinal para a receção ligar — painel
// "Por confirmar" na agenda do admin).
export async function sendAppointmentReminderEmail(params: {
  to: string;
  patientName: string;
  clinicName: string;
  clinicAddress: string | null;
  dateLabel: string;
  timeLabel: string;
  treatmentName: string;
  doctorName: string | null;
  confirmUrl: string | null; // null = já confirmada → lembrete simples
}): Promise<SendResult> {
  const org = await getOrganization();
  const rows: [string, string][] = [
    ['Data', params.dateLabel],
    ['Hora', params.timeLabel],
    ['Ato', params.treatmentName],
  ];
  if (params.doctorName) rows.push(['Profissional', params.doctorName]);
  rows.push([
    'Clínica',
    params.clinicName +
      (params.clinicAddress ? ` — ${params.clinicAddress}` : ''),
  ]);

  const detailRows = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:6px 14px 6px 0;color:#6A7186;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td>
        <td style="padding:6px 0;color:#1B2A6B;font-size:14px;font-weight:600;">${v}</td>
      </tr>`,
    )
    .join('');

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1B2A6B;font-size:20px;">
      A sua consulta é amanhã 🦷
    </h1>
    <p style="margin:0 0 12px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Olá ${params.patientName}, lembramos que tem uma consulta marcada:
    </p>
    <table style="border-collapse:collapse;margin:0 0 16px 0;background:#F4F6FB;border-radius:10px;padding:8px;width:100%;">
      <tbody>${detailRows}</tbody>
    </table>
    ${
      params.confirmUrl
        ? `<p style="margin:0 0 4px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Por favor confirme a sua presença — basta um clique:
    </p>
    ${actionButton('Confirmar presença ✔', params.confirmUrl)}
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      Se não puder comparecer, contacte a clínica para remarcar — assim
      libertamos o horário para outro paciente.
    </p>`
        : `<p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      A sua presença já está confirmada. Se precisar de remarcar ou
      cancelar, contacte a clínica. Até amanhã!
    </p>`
    }`;

  return send({
    to: params.to,
    subject: `Lembrete: consulta amanhã — ${params.dateLabel}, ${params.timeLabel}`,
    html: baseLayout(content, org),
  });
}
