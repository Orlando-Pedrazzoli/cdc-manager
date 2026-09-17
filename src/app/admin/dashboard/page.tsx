// 📄 src/app/admin/dashboard/page.tsx
// =============================================================================
// CDC Manager — Dashboard Admin v2: "o que preciso fazer agora?"
// -----------------------------------------------------------------------------
// Server Component. O ecrã de entrada da gestão, desenhado em torno de cinco
// perguntas — não em torno de métricas:
//   ① O que acontece hoje?        → faixa Hoje + "A seguir hoje" (bloco principal)
//   ② O que precisa de atenção?   → "Requer atenção" (RX, próteses, recalls,
//                                    stock; catálogo como tarefa administrativa)
//   ③ Como está a clínica?        → Produção com contexto + Por cobrar
//   ④ O que está pendente?        → amanhã por confirmar, laboratório
//   ⑤ Há algum problema?          → faltas/cancelamentos, atrasos
// A camada de dados é a da v1 (tudo ao vivo do MongoDB, sem caches); a v2
// acrescenta só a meta mensal (soma dos objetivos dos médicos ativos).
// Apresentação em src/components/dashboard/*; responsivo em globals.css
// (.cdc-dash-*): 6→3→2 colunas na faixa, blocos empilhados abaixo de 1024px.
//
// Notas de implementação (mantidas da v1):
// · Recalls "por contactar" = status 'due' OU 'scheduled' cuja data já chegou
//   (leitura pura — a promoção lazy scheduled→due acontece só no load de
//   /admin/recalls; aqui apenas CONTAMOS, nunca escrevemos).
// · Stock "a repor" = produtos ativos com minStock > 0 e saldo TOTAL das duas
//   casas abaixo do mínimo (mesma regra do badge "Repor" da StockTable).
// · Badge da clínica: derivado do slug (capitalizado) — 3.ª clínica = zero
//   código, como nas colunas dinâmicas do Stock.
// · "Faltas e cancelamentos hoje": lista acionável (paciente → ficha,
//   Remarcar → agenda da clínica).
// · "Aniversários hoje": match dia+mês feito no Mongo com timezone Europe/Lisbon.
// · <AutoRefresh/>: refresh silencioso a cada 90s (pausa com separador oculto).
// · Sparkline de produção: 30 dias civis (Lisboa) em SVG puro.
// · Ocupação por clínica: minutos bloqueantes de hoje ÷ (abertura × gabinetes).
// · KPI "Novos pacientes": createdAt no mês 1–N vs anterior. ATENÇÃO
//   pós-migração Dentoral: o import em massa infla este número no mês da
//   migração (createdAt = data de inserção).
// =============================================================================

import Link from 'next/link';
import AutoRefresh from '@/components/ui/AutoRefresh';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Appointment, { BLOCKING_STATUS } from '@/models/Appointment';
import Patient from '@/models/Patient';
import Procedure from '@/models/Procedure';
import Recall from '@/models/Recall';
import Product from '@/models/Product';
import Doctor from '@/models/Doctor';
import TreatmentType from '@/models/TreatmentType';
import RxRequest from '@/models/RxRequest';
import LabCase from '@/models/LabCase';
import { LAB_WORK_TYPE_LABEL, type LabWorkType } from '@/lib/domain';
import { Cake, FlaskConical } from 'lucide-react';
import { HojeStrip, type HojeItem } from '@/components/dashboard/HojeStrip';
import {
  AttentionPanel,
  type AttentionItem,
} from '@/components/dashboard/AttentionPanel';
import { ProductionCard } from '@/components/dashboard/ProductionCard';
import { CollectCard } from '@/components/dashboard/CollectCard';
import {
  UpcomingCard,
  type UpcomingRow,
} from '@/components/dashboard/UpcomingCard';
import { ClinicCard } from '@/components/dashboard/ClinicCard';
import {
  ActionLink,
  C,
  EmptyLine,
  Pill,
  Row,
  Section,
  type Tone,
} from '@/components/dashboard/ui';
import { getActiveClinics } from '@/models/Clinic';
import {
  lisbonToUtc,
  todayLisbon,
  dateRange,
  weekdayOf,
  hhmmToMin,
} from '@/lib/availability';
import { formatCents } from '@/lib/commissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const CLINIC_STYLE: Record<string, { bg: string; fg: string }> = {
  colombo: { bg: '#E4EBFF', fg: '#1B2A6B' },
  buraca: { bg: '#EFE6FA', fg: '#5B2E91' },
};

/** "colombo" → "Colombo" (badge dinâmico — sem hardcode por clínica) */
function slugLabel(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export default async function AdminDashboardPage() {
  const session = await auth();
  const firstName = (session?.user?.name ?? '').split(' ')[0];

  await dbConnect();

  const today = todayLisbon();
  const dayStart = lisbonToUtc(today, 0);
  const dayEnd = lisbonToUtc(today, 24 * 60);
  const now = new Date();

  // Períodos mensais para o KPI de faturação: mês corrente ATÉ HOJE vs o
  // MESMO intervalo de dias do mês anterior (dia 1–N contra dia 1–N — nunca
  // contra o mês anterior inteiro, que seria uma comparação desonesta a
  // meio do mês). Dia N ajustado ao tamanho do mês anterior (31 mar → 28 fev).
  const [yStr, mStr, dStr] = today.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = lisbonToUtc(`${yStr}-${mStr}-01`, 0);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevMonthDays = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const prevD = Math.min(d, prevMonthDays);
  const prevStart = lisbonToUtc(`${prevY}-${pad(prevM)}-01`, 0);
  const prevEnd = lisbonToUtc(`${prevY}-${pad(prevM)}-${pad(prevD)}`, 24 * 60);

  // Amanhã (data civil Lisboa) — para o KPI "Por confirmar amanhã".
  // dayEnd JÁ É a meia-noite de amanhã; só falta o fim do dia seguinte.
  const tomorrowStr = new Date(Date.UTC(y, m - 1, d + 1))
    .toISOString()
    .slice(0, 10);
  const tomorrowEnd = lisbonToUtc(tomorrowStr, 24 * 60);

  // Janela do sparkline de produção: últimos 30 dias civis (incl. hoje)
  const spark30StartStr = new Date(Date.UTC(y, m - 1, d - 29))
    .toISOString()
    .slice(0, 10);
  const spark30Start = lisbonToUtc(spark30StartStr, 0);

  const [
    clinics,
    apptsByClinic,
    executedByClinic,
    toCollect,
    recallsDue,
    stockLow,
    monthAgg,
    prevMonthAgg,
    catalogUnconfirmed,
    upcomingRaw,
    pendingTomorrow,
    missedRaw,
    birthdaysRaw,
    sparkAgg,
    newPatientsMonth,
    newPatientsPrev,
    occupancyRaw,
    rxPending,
    labOverdue,
    labDueRaw,
    doctorGoalAgg,
  ] = await Promise.all([
    getActiveClinics(),
    // Marcações de hoje agrupadas por clínica × estado
    Appointment.aggregate<{
      _id: { clinicId: mongoose.Types.ObjectId; status: string };
      n: number;
    }>([
      { $match: { startAt: { $gte: dayStart, $lt: dayEnd } } },
      {
        $group: {
          _id: { clinicId: '$clinicId', status: '$status' },
          n: { $sum: 1 },
        },
      },
    ]),
    // Atos executados hoje (nº + valor) POR CLÍNICA — o global soma-se abaixo
    Procedure.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      cents: number;
    }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: dayStart, $lt: dayEnd },
        },
      },
      {
        $group: {
          _id: '$clinicId',
          n: { $sum: 1 },
          cents: { $sum: '$priceCents' },
        },
      },
    ]),
    // Por cobrar (qualquer data): completed sem fatura, por clínica
    Procedure.aggregate<{
      _id: mongoose.Types.ObjectId;
      n: number;
      cents: number;
    }>([
      { $match: { status: 'completed', invoiceId: null } },
      {
        $group: {
          _id: '$clinicId',
          n: { $sum: 1 },
          cents: { $sum: '$priceCents' },
        },
      },
    ]),
    // Recalls na fila de contacto (leitura pura — ver nota no topo)
    Recall.countDocuments({
      $or: [{ status: 'due' }, { status: 'scheduled', dueAt: { $lte: now } }],
    }),
    // Produtos ativos com mínimo definido e saldo total abaixo do mínimo
    Product.aggregate<{ n: number }>([
      { $match: { active: true, minStock: { $gt: 0 } } },
      {
        $project: {
          minStock: 1,
          total: { $sum: '$stockCache.quantity' },
        },
      },
      { $match: { $expr: { $lt: ['$total', '$minStock'] } } },
      { $count: 'n' },
    ]),
    // Faturado este mês (executado, não pago): mês corrente até hoje
    Procedure.aggregate<{ _id: null; n: number; cents: number }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: monthStart, $lt: dayEnd },
        },
      },
      { $group: { _id: null, n: { $sum: 1 }, cents: { $sum: '$priceCents' } } },
    ]),
    // Mesmo período do mês anterior (dia 1–N) para comparação honesta
    Procedure.aggregate<{ _id: null; n: number; cents: number }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: prevStart, $lt: prevEnd },
        },
      },
      { $group: { _id: null, n: { $sum: 1 }, cents: { $sum: '$priceCents' } } },
    ]),
    // Catálogo por confirmar (o trabalho atual pós-importação Dentoral)
    TreatmentType.countDocuments({
      active: true,
      source: { $ne: 'clinic-confirmed' },
    }),
    // A seguir hoje: em curso/espera sempre; pendentes/confirmadas futuras
    Appointment.find({
      startAt: { $gte: dayStart, $lt: dayEnd },
      $or: [
        { status: { $in: ['in-progress', 'checked-in'] } },
        {
          status: { $in: ['pending', 'confirmed'] },
          startAt: { $gte: now },
        },
      ],
    })
      .select('startAt status patientId doctorId clinicId')
      .sort({ startAt: 1 })
      .limit(7)
      .lean(),
    // Marcações de amanhã ainda pending — a receção liga hoje a confirmar
    Appointment.countDocuments({
      startAt: { $gte: dayEnd, $lt: tomorrowEnd },
      status: 'pending',
    }),
    // Faltas e cancelamentos de HOJE — lista acionável (remarcar)
    Appointment.find({
      startAt: { $gte: dayStart, $lt: dayEnd },
      status: { $in: ['no-show', 'cancelled'] },
    })
      .select('startAt status patientId doctorId clinicId')
      .sort({ startAt: 1 })
      .limit(8)
      .lean(),
    // Aniversários de hoje: match dia+mês no Mongo (timezone Lisboa) —
    // nunca traz a coleção inteira para o Node
    Patient.aggregate<{
      _id: mongoose.Types.ObjectId;
      name: string;
      phone: string | null;
      birthDate: Date;
    }>([
      { $match: { status: 'active', birthDate: { $ne: null } } },
      {
        $match: {
          $expr: {
            $and: [
              {
                $eq: [
                  {
                    $dayOfMonth: {
                      date: '$birthDate',
                      timezone: 'Europe/Lisbon',
                    },
                  },
                  d,
                ],
              },
              {
                $eq: [
                  { $month: { date: '$birthDate', timezone: 'Europe/Lisbon' } },
                  m,
                ],
              },
            ],
          },
        },
      },
      { $project: { name: 1, phone: 1, birthDate: 1 } },
      { $sort: { name: 1 } },
      { $limit: 12 },
    ]),
    // Produção diária dos últimos 30 dias — alimenta o sparkline do KPI.
    // Agrupamento por dia civil de LISBOA (timezone no $dateToString).
    Procedure.aggregate<{ _id: string; cents: number }>([
      {
        $match: {
          status: { $in: ['completed', 'invoiced'] },
          executedAt: { $gte: spark30Start, $lt: dayEnd },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$executedAt',
              timezone: 'Europe/Lisbon',
            },
          },
          cents: { $sum: '$priceCents' },
        },
      },
    ]),
    // Novos pacientes: mês corrente até hoje vs mesmo intervalo 1–N anterior
    Patient.countDocuments({ createdAt: { $gte: monthStart, $lt: dayEnd } }),
    Patient.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } }),
    // Ocupação: marcações bloqueantes de hoje com o intervalo real ocupado
    // (endAt já inclui buffer — reflete o tempo de gabinete indisponível)
    Appointment.find({
      startAt: { $gte: dayStart, $lt: dayEnd },
      status: { $in: BLOCKING_STATUS },
    })
      .select('clinicId startAt endAt')
      .lean(),
    // RX por captar: pedidos na fila da sala (qualquer dia — um pedido
    // esquecido de ontem continua a dever captação)
    RxRequest.countDocuments({ status: { $in: ['requested', 'in-progress'] } }),
    // Próteses atrasadas: no laboratório com data prevista ultrapassada —
    // sinal de COBRANÇA (a receção liga ao laboratório); /admin/proteses
    LabCase.countDocuments({ status: 'sent', dueDate: { $lt: dayStart } }),
    // E3 (Isabel): "no dashboard deve haver um que refere quais os
    // laboratórios com entregas para cada dia" — retornos previstos HOJE e
    // AMANHÃ ainda no laboratório, agrupados por laboratório
    LabCase.find({
      status: 'sent',
      dueDate: { $gte: dayStart, $lt: tomorrowEnd },
    })
      .select('labName workType patientId dueDate clinicId')
      .sort({ dueDate: 1, labName: 1 })
      .lean(),
    // Meta mensal da clínica = soma dos objetivos dos médicos ativos. Sem
    // objetivos definidos → 0 e a barra não aparece (nunca inventamos meta).
    Doctor.aggregate<{ _id: null; cents: number }>([
      { $match: { active: true, monthlyGoalCents: { $gt: 0 } } },
      { $group: { _id: null, cents: { $sum: '$monthlyGoalCents' } } },
    ]),
  ]);

  // Entregas de laboratório hoje/amanhã, por laboratório (E3)
  const labDuePatients = labDueRaw.length
    ? await Patient.find({ _id: { $in: labDueRaw.map(c => c.patientId) } })
        .select('name')
        .lean()
    : [];
  const labDuePatientById = new Map(
    labDuePatients.map(p => [String(p._id), p.name]),
  );
  const labDueGroups = new Map<
    string,
    {
      lab: string;
      today: number;
      items: { id: string; work: string; patient: string; isToday: boolean }[];
    }
  >();
  for (const c of labDueRaw) {
    const isToday = new Date(c.dueDate).getTime() < dayEnd.getTime();
    const g = labDueGroups.get(c.labName) ?? {
      lab: c.labName,
      today: 0,
      items: [],
    };
    if (isToday) g.today++;
    g.items.push({
      id: String(c._id),
      work: LAB_WORK_TYPE_LABEL[c.workType as LabWorkType],
      patient: labDuePatientById.get(String(c.patientId)) ?? '—',
      isToday,
    });
    labDueGroups.set(c.labName, g);
  }
  const labDue = Array.from(labDueGroups.values()).sort(
    (a, b) => b.today - a.today,
  );

  // Reorganizar agregações
  const perClinic = new Map<
    string,
    { total: number; byStatus: Record<string, number> }
  >();
  for (const row of apptsByClinic) {
    const key = String(row._id.clinicId);
    const entry = perClinic.get(key) ?? { total: 0, byStatus: {} };
    entry.total += row.n;
    entry.byStatus[row._id.status] = row.n;
    perClinic.set(key, entry);
  }
  const executedMap = new Map(executedByClinic.map(r => [String(r._id), r]));
  const executedTotalCents = executedByClinic.reduce((s, r) => s + r.cents, 0);
  const executedTotalN = executedByClinic.reduce((s, r) => s + r.n, 0);
  const collectByClinic = new Map(toCollect.map(r => [String(r._id), r]));
  const collectTotalCents = toCollect.reduce((s, r) => s + r.cents, 0);
  const collectTotalN = toCollect.reduce((s, r) => s + r.n, 0);
  const stockLowN = stockLow[0]?.n ?? 0;

  // --- Faturação mensal ------------------------------------------------------
  const monthCents = monthAgg[0]?.cents ?? 0;
  const monthN = monthAgg[0]?.n ?? 0;
  const prevCents = prevMonthAgg[0]?.cents ?? 0;

  // --- Sparkline de produção (30 dias, zeros preenchidos) --------------------
  const sparkByDay = new Map(sparkAgg.map(r => [r._id, r.cents] as const));
  const spark = dateRange(spark30StartStr, today).map(
    ds => sparkByDay.get(ds) ?? 0,
  );

  // --- Ocupação de hoje por clínica ------------------------------------------
  // Capacidade = minutos de abertura de hoje × gabinetes simultâneos.
  // Ocupado = soma dos intervalos das marcações bloqueantes (com clamp ao
  // dia). Leitura simples e honesta — não desconta sobreposições entre
  // gabinetes porque a capacidade já as multiplica.
  const weekdayToday = weekdayOf(today);
  const usedMinByClinic = new Map<string, number>();
  for (const a of occupancyRaw) {
    const s = Math.max((a.startAt as Date).getTime(), dayStart.getTime());
    const e = Math.min((a.endAt as Date).getTime(), dayEnd.getTime());
    if (e > s) {
      const key = String(a.clinicId);
      usedMinByClinic.set(
        key,
        (usedMinByClinic.get(key) ?? 0) + Math.round((e - s) / 60_000),
      );
    }
  }
  const occupancyByClinic = new Map<
    string,
    { pct: number; openMin: number } // openMin 0 = clínica fechada hoje
  >();
  for (const c of clinics) {
    const day = c.openingHours.find(o => o.weekday === weekdayToday);
    const baseMin = (day?.ranges ?? []).reduce(
      (s, r) => s + (hhmmToMin(r.end) - hhmmToMin(r.start)),
      0,
    );
    const openMin = baseMin * (c.maxConcurrentAppointments ?? 1);
    const used = usedMinByClinic.get(String(c._id)) ?? 0;
    const pct =
      openMin > 0 ? Math.min(100, Math.round((used / openMin) * 100)) : 0;
    occupancyByClinic.set(String(c._id), { pct, openMin });
  }

  // --- Resolver nomes de "A seguir hoje" + faltas numa só passagem ----------
  const nameSourceAppts = [...upcomingRaw, ...missedRaw];
  const upPatientIds = [
    ...new Set(nameSourceAppts.map(a => String(a.patientId))),
  ];
  const upDoctorIds = [
    ...new Set(
      nameSourceAppts.filter(a => a.doctorId).map(a => String(a.doctorId)),
    ),
  ];
  const [upPatients, upDoctors] = await Promise.all([
    upPatientIds.length
      ? Patient.find({ _id: { $in: upPatientIds } })
          .select('name')
          .lean()
      : [],
    upDoctorIds.length
      ? Doctor.find({ _id: { $in: upDoctorIds } })
          .select('name')
          .lean()
      : [],
  ]);
  const patientNameById = new Map(
    upPatients.map(p => [String(p._id), p.name] as const),
  );
  const doctorNameById = new Map(
    upDoctors.map(dd => [String(dd._id), dd.name] as const),
  );
  const clinicSlugById = new Map(
    clinics.map(c => [String(c._id), c.slug] as const),
  );
  const timeFmt = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
  const UP_STATUS: Record<string, { label: string; tone: Tone }> = {
    'in-progress': { label: 'Em curso', tone: 'good' },
    'checked-in': { label: 'Em espera', tone: 'warn' },
    confirmed: { label: 'Confirmada', tone: 'info' },
    pending: { label: 'Por confirmar', tone: 'neutral' },
  };
  const minutesLisbon = (dt: Date) =>
    Math.round((dt.getTime() - dayStart.getTime()) / 60_000);
  const upcoming: UpcomingRow[] = upcomingRaw.map(a => {
    const slug = clinicSlugById.get(String(a.clinicId)) ?? '';
    return {
      id: String(a._id),
      time: timeFmt.format(a.startAt as Date),
      minutes: minutesLisbon(a.startAt as Date),
      patientId: String(a.patientId),
      patientName: patientNameById.get(String(a.patientId)) ?? '(paciente)',
      doctorName: a.doctorId
        ? (doctorNameById.get(String(a.doctorId)) ?? '(médico)')
        : 'Por atribuir',
      clinicLabel: slugLabel(slug),
      clinicTone: CLINIC_STYLE[slug] ?? { bg: '#EAECF3', fg: '#3D4257' },
      status: UP_STATUS[a.status as string] ?? {
        label: a.status as string,
        tone: 'neutral',
      },
    };
  });

  // --- Faltas e cancelamentos de hoje (acionáveis) ---------------------------
  const MISSED_STATUS: Record<string, { label: string; tone: Tone }> = {
    'no-show': { label: 'Falta', tone: 'bad' },
    cancelled: { label: 'Cancelada', tone: 'neutral' },
  };
  const missed = missedRaw.map(a => ({
    id: String(a._id),
    time: timeFmt.format(a.startAt as Date),
    patientId: String(a.patientId),
    patientName: patientNameById.get(String(a.patientId)) ?? '(paciente)',
    doctorName: a.doctorId
      ? (doctorNameById.get(String(a.doctorId)) ?? '(médico)')
      : 'Por atribuir',
    clinicSlug: clinicSlugById.get(String(a.clinicId)) ?? '',
    status: MISSED_STATUS[a.status as string] ?? {
      label: a.status as string,
      tone: 'neutral' as Tone,
    },
  }));

  // --- Aniversários de hoje --------------------------------------------------
  const birthdays = birthdaysRaw.map(p => ({
    id: String(p._id),
    name: p.name,
    phone: p.phone ?? null,
    // É hoje o aniversário → idade = ano corrente − ano de nascimento
    age: y - p.birthDate.getUTCFullYear(),
  }));

  const rawDate = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date());
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  // --- Agregados do dia (todas as clínicas) ----------------------------------
  const sumStatus = (...keys: string[]) =>
    [...perClinic.values()].reduce(
      (s, e) => s + keys.reduce((t, k) => t + (e.byStatus[k] ?? 0), 0),
      0,
    );
  const doneOf = (byStatus: Record<string, number>) =>
    byStatus['completed'] ?? 0;
  const activeOf = (byStatus: Record<string, number>) =>
    (byStatus['pending'] ?? 0) +
    (byStatus['confirmed'] ?? 0) +
    (byStatus['checked-in'] ?? 0) +
    (byStatus['in-progress'] ?? 0) +
    (byStatus['completed'] ?? 0);
  const missedOf = (byStatus: Record<string, number>) =>
    (byStatus['cancelled'] ?? 0) + (byStatus['no-show'] ?? 0);

  const todayTotal = sumStatus(
    'pending',
    'confirmed',
    'checked-in',
    'in-progress',
    'completed',
  );
  const todayDone = sumStatus('completed');
  const todayToConfirm = sumStatus('pending');
  const goalCents = doctorGoalAgg[0]?.cents ?? 0;

  // Janela do dia para a timeline de "A seguir hoje": da abertura mais cedo
  // ao fecho mais tarde entre as clínicas abertas hoje (fallback 08:00–20:00)
  let dayOpenMin = Infinity;
  let dayCloseMin = -Infinity;
  for (const c of clinics) {
    const day = c.openingHours.find(o => o.weekday === weekdayToday);
    for (const r of day?.ranges ?? []) {
      dayOpenMin = Math.min(dayOpenMin, hhmmToMin(r.start));
      dayCloseMin = Math.max(dayCloseMin, hhmmToMin(r.end));
    }
  }
  if (!Number.isFinite(dayOpenMin)) dayOpenMin = 8 * 60;
  if (!Number.isFinite(dayCloseMin)) dayCloseMin = 20 * 60;
  const nowMin = Math.round((now.getTime() - dayStart.getTime()) / 60_000);

  // --- Requer atenção: pendências acionáveis, só as que existem --------------
  const attention: AttentionItem[] = [
    {
      count: collectTotalN,
      label: `${collectTotalN} ${collectTotalN === 1 ? 'ato' : 'atos'} por cobrar (${formatCents(collectTotalCents)})`,
      href: '/admin/cobranca',
      tone: 'info',
    },
    {
      count: rxPending,
      label: `${rxPending} RX por captar na sala`,
      href: '/admin/rx',
      tone: 'warn',
    },
    {
      count: labOverdue,
      label: `${labOverdue} ${labOverdue === 1 ? 'prótese atrasada' : 'próteses atrasadas'} no laboratório`,
      href: '/admin/proteses?filtro=atrasadas',
      tone: 'bad',
    },
    {
      count: recallsDue,
      label: `${recallsDue} ${recallsDue === 1 ? 'recall' : 'recalls'} para contactar`,
      href: '/admin/recalls',
      tone: 'bad',
    },
    {
      count: stockLowN,
      label: `${stockLowN} ${stockLowN === 1 ? 'produto' : 'produtos'} abaixo do stock mínimo`,
      href: '/admin/stock',
      tone: 'warn',
    },
    {
      count: catalogUnconfirmed,
      label: `Catálogo: ${catalogUnconfirmed} atos por confirmar (preço, duração, flags)`,
      href: '/admin/tratamentos',
      tone: 'neutral',
      admin: true,
    },
  ];
  const attentionN = attention.filter(a => !a.admin && a.count > 0).length;

  // --- Faixa Hoje: 6 números, cada um com a sua ação --------------------------
  const hoje: HojeItem[] = [
    {
      label: 'Consultas hoje',
      value: String(todayTotal),
      sub:
        todayTotal > 0
          ? `${todayDone} concluída${todayDone === 1 ? '' : 's'} · ${todayToConfirm} por confirmar`
          : 'Sem marcações',
      href: '/admin/agenda',
    },
    {
      label: 'Novos pacientes',
      value: String(newPatientsMonth),
      sub:
        newPatientsPrev > 0
          ? `${newPatientsMonth >= newPatientsPrev ? '▲' : '▼'} ${newPatientsPrev} no mês anterior`
          : 'este mês',
      href: '/admin/pacientes',
    },
    {
      label: 'Produção hoje',
      value: formatCents(executedTotalCents),
      sub: `${executedTotalN} ato${executedTotalN === 1 ? '' : 's'} executado${executedTotalN === 1 ? '' : 's'}`,
      href: '/admin/relatorios',
      tone: executedTotalCents > 0 ? 'good' : undefined,
    },
    {
      label: 'Por cobrar',
      value: formatCents(collectTotalCents),
      sub:
        collectTotalN > 0
          ? `${collectTotalN} ato${collectTotalN === 1 ? '' : 's'}`
          : 'Tudo cobrado',
      href: '/admin/cobranca',
    },
    {
      label: 'Amanhã por confirmar',
      value: String(pendingTomorrow),
      sub: pendingTomorrow > 0 ? 'Ligar a confirmar' : 'Amanhã confirmado',
      href: `/admin/agenda?date=${tomorrowStr}`,
      tone: pendingTomorrow > 0 ? 'warn' : undefined,
    },
    {
      label: 'Pendências',
      value: String(attentionN),
      sub: attentionN > 0 ? 'Requer atenção' : 'Tudo em dia',
      href: '#requer-atencao',
      tone: attentionN > 0 ? 'bad' : 'good',
    },
  ];

  const collectByClinicRows = clinics
    .map(c => {
      const r = collectByClinic.get(String(c._id));
      return { name: c.name, cents: r?.cents ?? 0, n: r?.n ?? 0 };
    })
    .filter(r => r.cents > 0);

  const btn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '9px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  };

  return (
    <div className='cdc-dash'>
      {/* Dados frescos sem F5: a página vive aberta na receção o dia todo */}
      <AutoRefresh intervalMs={90_000} />

      {/* Cabeçalho: saudação + data discreta; ações primárias sempre à mão */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '-0.2px',
              color: C.navy,
            }}
          >
            {firstName ? `Olá, ${firstName}` : 'Dashboard'}
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: C.faint }}>
            {dateLabel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link
            href='/admin/agenda'
            style={{ ...btn, backgroundColor: C.action, color: '#FFFFFF' }}
          >
            + Nova marcação
          </Link>
          <Link
            href='/admin/pacientes/novo'
            style={{
              ...btn,
              backgroundColor: '#FFFFFF',
              color: C.action,
              border: '1px solid #C9D4FF',
            }}
          >
            + Novo paciente
          </Link>
        </div>
      </div>

      {/* ① Hoje */}
      <HojeStrip items={hoje} />

      {/* ① + ② A seguir hoje (principal) · Requer atenção */}
      <div className='cdc-dash-main'>
        <UpcomingCard
          rows={upcoming}
          dayStartMin={dayOpenMin}
          dayEndMin={dayCloseMin}
          nowMin={nowMin}
        />
        <div id='requer-atencao' style={{ scrollMarginTop: '72px' }}>
          <AttentionPanel items={attention} />
        </div>
      </div>

      {/* ③ Como está a clínica: produção com contexto · por cobrar */}
      <div className='cdc-dash-two'>
        <ProductionCard
          monthCents={monthCents}
          monthN={monthN}
          prevCents={prevCents}
          todayCents={executedTotalCents}
          todayN={executedTotalN}
          goalCents={goalCents}
          spark={spark}
        />
        <CollectCard
          totalCents={collectTotalCents}
          totalN={collectTotalN}
          byClinic={collectByClinicRows}
          pendingTomorrow={pendingTomorrow}
          tomorrowHref={`/admin/agenda?date=${tomorrowStr}`}
        />
      </div>

      {/* Clínicas lado a lado */}
      <div className='cdc-dash-auto'>
        {clinics.map(c => {
          const stats = perClinic.get(String(c._id)) ?? {
            total: 0,
            byStatus: {},
          };
          const executed = executedMap.get(String(c._id));
          const collect = collectByClinic.get(String(c._id));
          const cl = CLINIC_STYLE[c.slug] ?? { bg: '#EAECF3', fg: '#3D4257' };
          const occ = occupancyByClinic.get(String(c._id)) ?? {
            pct: 0,
            openMin: 0,
          };
          return (
            <ClinicCard
              key={c.slug}
              name={c.name}
              slug={c.slug}
              badge={{ ...cl, label: slugLabel(c.slug) }}
              occupancyPct={occ.pct}
              isOpen={occ.openMin > 0}
              total={activeOf(stats.byStatus)}
              done={doneOf(stats.byStatus)}
              toConfirm={stats.byStatus['pending'] ?? 0}
              missed={missedOf(stats.byStatus)}
              inProgress={stats.byStatus['in-progress'] ?? 0}
              waiting={stats.byStatus['checked-in'] ?? 0}
              executedCents={executed?.cents ?? 0}
              executedN={executed?.n ?? 0}
              collectCents={collect?.cents ?? 0}
            />
          );
        })}
      </div>

      {/* ④ Entregas de laboratório hoje / amanhã, por laboratório (E3) */}
      {labDue.length > 0 && (
        <Section
          title='Entregas de laboratório'
          icon={<FlaskConical size={16} style={{ color: C.action }} />}
          action={
            <ActionLink href='/admin/proteses?filtro=a-chegar'>
              Ver todas
            </ActionLink>
          }
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            {labDue.map(g => (
              <div
                key={g.lab}
                style={{
                  border: `1px solid ${C.line}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  backgroundColor: g.today > 0 ? '#EEF2FF' : '#F8F9FD',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: C.navy,
                    }}
                  >
                    {g.lab}
                  </span>
                  <span style={{ fontSize: '11px', color: C.muted }}>
                    {g.today} hoje · {g.items.length - g.today} amanhã
                  </span>
                </div>
                {g.items.map(it => (
                  <div
                    key={it.id}
                    style={{
                      fontSize: '12px',
                      color: C.neutralFg,
                      display: 'flex',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        color: it.isToday ? C.action : C.faint,
                        fontWeight: 700,
                        minWidth: 48,
                      }}
                    >
                      {it.isToday ? 'Hoje' : 'Amanhã'}
                    </span>
                    <span>
                      {it.work} · {it.patient}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ⑤ Faltas de hoje (acionáveis) + aniversários — só quando existem */}
      {(missed.length > 0 || birthdays.length > 0) && (
        <div className='cdc-dash-two'>
          {missed.length > 0 && (
            <Section
              title='Faltas e cancelamentos hoje'
              titleColor={C.bad}
              flush
            >
              {missed.map((f, i) => (
                <Row
                  key={f.id}
                  first={i === 0}
                  time={f.time}
                  timeColor={C.neutralFg}
                  title={f.patientName}
                  titleHref={`/admin/pacientes/${f.patientId}`}
                  subtitle={f.doctorName}
                  meta={
                    <>
                      <Pill tone={f.status.tone}>{f.status.label}</Pill>
                      <ActionLink
                        href={`/admin/agenda?clinic=${f.clinicSlug}`}
                        small
                      >
                        Remarcar
                      </ActionLink>
                    </>
                  }
                />
              ))}
            </Section>
          )}
          {birthdays.length > 0 && (
            <Section
              title='Aniversários hoje'
              icon={<Cake size={16} style={{ color: C.action }} />}
              flush
            >
              {birthdays.map((b, i) => (
                <Row
                  key={b.id}
                  first={i === 0}
                  title={b.name}
                  titleHref={`/admin/pacientes/${b.id}`}
                  subtitle={`Faz ${b.age} anos`}
                  meta={
                    b.phone ? (
                      <a
                        href={`tel:${b.phone}`}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: C.action,
                          textDecoration: 'none',
                        }}
                      >
                        {b.phone}
                      </a>
                    ) : undefined
                  }
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {upcoming.length === 0 && todayTotal === 0 && missed.length === 0 && (
        <EmptyLine text='Dia sem marcações. A agenda de amanhã já está preparada?' />
      )}
    </div>
  );
}
