// 📄 src/app/api/cron/reminders/route.ts
// =============================================================================
// CDC Manager — CRON: lembretes 24h antes da consulta
// -----------------------------------------------------------------------------
// Invocado de hora a hora (vercel.json). Para cada marcação que COMEÇA nas
// próximas 24 horas, ainda ativa e sem lembrete enviado:
//   · pending   → email com botão "Confirmar presença" (/confirmar/[token])
//   · confirmed → email lembrete simples (sem botão)
// Marca reminder24hSentAt ANTES de enviar (claim atómico com filtro
// $eq null) — duas execuções sobrepostas do cron nunca enviam em dobro; se
// o envio falhar, o registo 'failed' fica no outbox para retry manual.
//
// A NÃO-resposta ao botão é o sinal operacional: essas marcações continuam
// 'pending' e aparecem no painel "Por confirmar (24h)" da agenda do admin
// — é daí que a receção liga ao paciente (best practice anti-no-show:
// tratar não-resposta como escalonamento, nunca como confirmação).
//
// Segurança: exige Authorization: Bearer ${CRON_SECRET} — o header que a
// Vercel injeta automaticamente nos cron jobs quando a env CRON_SECRET
// está definida no projeto.
// =============================================================================

import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Clinic from '@/models/Clinic';
import TreatmentType from '@/models/TreatmentType';
import Doctor from '@/models/Doctor';
import Notification from '@/models/Notification';
import { sendAppointmentReminderEmail } from '@/lib/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Candidatas: começam dentro de 24h, ativas, lembrete ainda não enviado
  const candidates = await Appointment.find({
    startAt: { $gt: now, $lte: in24h },
    status: { $in: ['pending', 'confirmed'] },
    reminder24hSentAt: null,
  })
    .select(
      'status startAt patientId clinicId treatmentTypeId doctorId confirmToken',
    )
    .limit(200)
    .lean();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const appt of candidates) {
    // Claim atómico: só UMA execução ganha este documento
    const claim = await Appointment.updateOne(
      { _id: appt._id, reminder24hSentAt: null },
      { $set: { reminder24hSentAt: new Date() } },
    );
    if (claim.modifiedCount !== 1) {
      skipped++;
      continue;
    }

    const [patient, clinic, treatment, doctor] = await Promise.all([
      Patient.findById(appt.patientId).select('name email consents'),
      Clinic.findById(appt.clinicId).select('name address'),
      TreatmentType.findById(appt.treatmentTypeId).select('name'),
      appt.doctorId
        ? Doctor.findById(appt.doctorId).select('name')
        : Promise.resolve(null),
    ]);

    // Sem email ou sem consentimento RGPD → nada a enviar (o claim fica:
    // a marcação continua visível no painel "Por confirmar" para ligarem)
    if (!patient?.email || !patient.consents?.remindersAt) {
      skipped++;
      continue;
    }

    const parts = new Intl.DateTimeFormat('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Lisbon',
    }).formatToParts(appt.startAt);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const rawDate = `${get('weekday')}, ${get('day')} de ${get('month')}`;
    const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
    const timeLabel = `${get('hour')}:${get('minute')}`;

    const result = await sendAppointmentReminderEmail({
      to: patient.email,
      patientName: patient.name,
      clinicName: clinic?.name ?? 'Centro Dentário Colombo',
      clinicAddress: clinic?.address ?? null,
      dateLabel,
      timeLabel,
      treatmentName: treatment?.name ?? 'Consulta',
      doctorName: doctor?.name ?? null,
      confirmUrl:
        appt.status === 'pending' && appt.confirmToken
          ? `${APP_URL}/confirmar/${appt.confirmToken}`
          : null,
    });

    if (result.ok) sent++;
    else failed++;

    await Notification.create({
      type: 'reminder-24h',
      channel: 'email',
      patientId: appt.patientId,
      recipient: patient.email,
      appointmentId: appt._id,
      status: result.ok ? 'sent' : 'failed',
      sentAt: result.ok ? new Date() : null,
      failedAt: result.ok ? null : new Date(),
      errorMessage: result.ok ? null : result.error,
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    window: { from: now.toISOString(), to: in24h.toISOString() },
    candidates: candidates.length,
    sent,
    skipped,
    failed,
  });
}
