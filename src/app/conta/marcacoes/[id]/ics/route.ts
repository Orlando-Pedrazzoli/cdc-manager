// 📄 src/app/conta/marcacoes/[id]/ics/route.ts
// =============================================================================
// CDC Manager — Portal do Paciente: "Adicionar ao calendário" (.ics)
// -----------------------------------------------------------------------------
// GET com sessão de paciente → ficheiro iCalendar da PRÓPRIA marcação
// (patientId da sessão na query — regra nº 1 do portal). Abre direto no
// calendário do telemóvel (iOS/Android) ou no Outlook/Google no desktop.
// Sem dados clínicos: título genérico, médico, clínica e morada.
// Datas em UTC (sufixo Z) — o calendário converte para o fuso local.
// =============================================================================

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { getClinicById } from '@/models/Clinic';
import { getOrganization } from '@/models/Organization';

export const dynamic = 'force-dynamic';

const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const patientId = session?.user?.patientId;
  if (!patientId || session.user.role !== 'patient') {
    return new NextResponse('Não autorizado', { status: 401 });
  }
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  await dbConnect();
  const appt = await Appointment.findOne({
    _id: id,
    patientId,
    status: { $in: ['pending', 'confirmed'] },
  })
    .select('startAt endAt clinicId doctorId')
    .lean();
  if (!appt) return new NextResponse('Não encontrado', { status: 404 });

  const [clinic, doctor, org] = await Promise.all([
    getClinicById(String(appt.clinicId)),
    appt.doctorId ? Doctor.findById(appt.doctorId).select('name').lean() : null,
    getOrganization(),
  ]);

  const title = `Consulta — ${clinic?.name ?? org.name}`;
  const description = [
    doctor?.name ? `Médico(a): ${doctor.name}` : null,
    clinic?.phone ? `Para remarcar ou cancelar: ${clinic.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const location = [clinic?.name, clinic?.address].filter(Boolean).join(', ');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(org.appName)}//PT`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}@${esc(org.appName.toLowerCase().replace(/\s+/g, '-'))}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(appt.startAt as Date)}`,
    `DTEND:${icsDate(appt.endAt as Date)}`,
    `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    location ? `LOCATION:${esc(location)}` : null,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)} amanhã`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="consulta-${icsDate(appt.startAt as Date).slice(0, 8)}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
