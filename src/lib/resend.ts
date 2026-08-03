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

const FROM =
  process.env.EMAIL_FROM ??
  'Centro Dentário Colombo <noreply@send.centrodentariocolombo.com>';

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
      from: FROM,
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
function baseLayout(contentHtml: string): string {
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
            <td style="background-color:#1B2A6B;border-radius:12px 12px 0 0;padding:24px 32px;" align="center">
              <span style="color:#FFFFFF;font-size:18px;font-weight:bold;letter-spacing:0.5px;">
                Centro Dentário Colombo
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
                Centro Dentário Colombo · Centro Comercial Colombo, Lisboa<br />
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
  const activateUrl = `${APP_URL}/ativar`;

  const content = `
    <h1 style="margin:0 0 16px 0;color:#1B2A6B;font-size:20px;">
      Bem-vindo(a), ${params.name}
    </h1>
    <p style="margin:0 0 8px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Foi criada uma conta em seu nome no portal do
      <strong>Centro Dentário Colombo</strong>. Para a ativar e definir a sua
      password, utilize o seguinte código:
    </p>
    ${codeBlock(params.plainCode)}
    <p style="margin:0 0 8px 0;color:#3A3F4A;font-size:14px;line-height:1.7;">
      Aceda à página de ativação e introduza o código juntamente com o seu email:
    </p>
    ${actionButton('Ativar a minha conta', activateUrl)}
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      O código é válido até <strong>${formatExpiry(params.expiresAt)}</strong>
      e só pode ser utilizado uma vez. Se não solicitou esta conta, ignore
      este email.
    </p>`;

  return send({
    to: params.to,
    subject: 'Ative a sua conta — Centro Dentário Colombo',
    html: baseLayout(content),
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
  const resetUrl = `${APP_URL}/recuperar-password`;

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
    subject: 'Recuperação de password — Centro Dentário Colombo',
    html: baseLayout(content),
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
}): Promise<SendResult> {
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
    <p style="margin:0;color:#6A7186;font-size:13px;line-height:1.7;">
      Se precisar de remarcar ou cancelar, contacte a clínica. Até breve!
    </p>`;

  return send({
    to: params.to,
    subject: `Consulta marcada — ${params.dateLabel}, ${params.timeLabel}`,
    html: baseLayout(content),
  });
}
