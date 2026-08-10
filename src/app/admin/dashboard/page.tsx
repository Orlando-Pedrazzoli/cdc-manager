// 📄 src/app/admin/dashboard/page.tsx
// =============================================================================
// CDC Manager — Dashboard Admin: a operação do dia
// -----------------------------------------------------------------------------
// Server Component. O ecrã de entrada da gestão: como está o dia AGORA nas
// duas clínicas — marcações e o seu progresso, atos executados e valor, o que
// está POR COBRAR (ponte visível para a Cobrança), recalls por contactar e
// stock a repor. Tudo calculado ao vivo do MongoDB, sem caches.
//
// Notas de implementação:
// · Recalls "por contactar" = status 'due' OU 'scheduled' cuja data já chegou
//   (leitura pura — a promoção lazy scheduled→due acontece só no load de
//   /admin/recalls; aqui apenas CONTAMOS, nunca escrevemos).
// · Stock "a repor" = produtos ativos com minStock > 0 e saldo TOTAL das duas
//   casas abaixo do mínimo (mesma regra do badge "Repor" da StockTable).
// · Badge da clínica: derivado do slug (capitalizado) — 3.ª clínica = zero
//   código, como nas colunas dinâmicas do Stock.
// · KPI "Por confirmar amanhã": marcações pending de amanhã — o gesto diário
//   da receção (ligar a confirmar presença) com visibilidade e um clique.
// · "Faltas e cancelamentos hoje": lista acionável (paciente → ficha,
//   Remarcar → agenda da clínica) — o Dentoral mostrava a falta; aqui age-se.
// · "Aniversários hoje": fidelização barata — nome, idade e telefone
//   clicável. Match dia+mês feito no Mongo com timezone Europe/Lisbon.
// · <AutoRefresh/>: a receção deixa a página aberta o dia todo — refresh
//   silencioso a cada 90s (pausa com separador oculto).
// · Sparkline de produção: 30 dias civis (Lisboa) em SVG puro no KPI —
//   zeros preenchidos, hoje em destaque verde. Tendência que o Dentoral
//   nunca deu.
// · Ocupação por clínica: minutos bloqueantes de hoje ÷ (abertura ×
//   gabinetes). Antecipa o C.8 com leitura simples.
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
    patientsTotal,
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
    Patient.countDocuments({ status: 'active' }),
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
  ]);

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
  const UP_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
    'in-progress': { label: 'Em curso', bg: '#E7F5EC', fg: '#186A3B' },
    'checked-in': { label: 'Em espera', bg: '#FFF4E0', fg: '#8A5A00' },
    confirmed: { label: 'Confirmada', bg: '#E4EBFF', fg: '#1B2A6B' },
    pending: { label: 'Pendente', bg: '#EAECF3', fg: '#3D4257' },
  };
  const upcoming = upcomingRaw.map(a => ({
    id: String(a._id),
    time: timeFmt.format(a.startAt as Date),
    patientId: String(a.patientId),
    patientName: patientNameById.get(String(a.patientId)) ?? '(paciente)',
    doctorName: a.doctorId
      ? (doctorNameById.get(String(a.doctorId)) ?? '(médico)')
      : 'Por atribuir',
    clinicSlug: clinicSlugById.get(String(a.clinicId)) ?? '',
    status: UP_STATUS[a.status as string] ?? {
      label: a.status as string,
      bg: '#EAECF3',
      fg: '#3D4257',
    },
  }));

  // --- Faltas e cancelamentos de hoje (acionáveis) ---------------------------
  const MISSED_STATUS: Record<
    string,
    { label: string; bg: string; fg: string }
  > = {
    'no-show': { label: 'Falta', bg: '#FDF3F2', fg: '#B3261E' },
    cancelled: { label: 'Cancelada', bg: '#EAECF3', fg: '#3D4257' },
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
      bg: '#EAECF3',
      fg: '#3D4257',
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

  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '14px',
    padding: '16px 20px',
  };

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

  // ---------------------------------------------------------------------------
  // KPIs — os acionáveis (Por cobrar, Recalls, Stock) são cartões-link.
  // Paleta de alerta: azul (cobrança), vermelho (recalls), âmbar (stock).
  // ---------------------------------------------------------------------------
  const kpis: Array<{
    label: string;
    value: string;
    sub?: string;
    href?: string;
    accentBg?: string;
    accentBorder?: string;
    valueColor?: string;
    /** Série diária para mini-gráfico de barras (SVG inline, sem libs) */
    spark?: number[];
  }> = [
    { label: 'Pacientes ativos', value: String(patientsTotal) },
    {
      label: 'Novos pacientes este mês',
      value: String(newPatientsMonth),
      sub:
        newPatientsPrev > 0
          ? `${newPatientsMonth >= newPatientsPrev ? '▲' : '▼'} vs ${newPatientsPrev} no mesmo período do mês passado`
          : newPatientsMonth > 0
            ? 'Primeiros registos do período'
            : 'Sem registos novos',
      href: '/admin/pacientes',
    },
    {
      label: 'Atos executados hoje',
      value: String(executedTotalN),
      sub: formatCents(executedTotalCents),
    },
    {
      // "Produção" e não "Faturado": mede atos EXECUTADOS (executedAt), não
      // documentos fiscais — quando o Moloni entrar (Sprint 4), "faturado"
      // passa a ter significado próprio e este nome evita a confusão.
      label: 'Produção este mês',
      value: formatCents(monthCents),
      spark,
      // Comparação honesta: mesmo intervalo de dias (1–N) do mês anterior
      sub:
        prevCents > 0
          ? `${monthCents >= prevCents ? '▲' : '▼'} vs ${formatCents(prevCents)} no mesmo período do mês passado`
          : `${monthN} ato${monthN === 1 ? '' : 's'} executado${monthN === 1 ? '' : 's'}`,
      href: '/admin/relatorios',
    },
    {
      label: 'Por cobrar',
      value: formatCents(collectTotalCents),
      sub:
        collectTotalN > 0
          ? `${collectTotalN} ato${collectTotalN === 1 ? '' : 's'} aguarda${collectTotalN === 1 ? '' : 'm'} cobrança`
          : 'Tudo cobrado',
      href: '/admin/cobranca',
      ...(collectTotalCents > 0
        ? { accentBg: '#F5F8FF', accentBorder: '#C9D4FF' }
        : {}),
    },
    {
      label: 'Por confirmar amanhã',
      value: String(pendingTomorrow),
      sub:
        pendingTomorrow > 0
          ? 'Ligar a confirmar presença'
          : 'Amanhã confirmado',
      href: `/admin/agenda?date=${tomorrowStr}`,
      ...(pendingTomorrow > 0
        ? { accentBg: '#F5F8FF', accentBorder: '#C9D4FF' }
        : {}),
    },
    {
      label: 'Recalls por contactar',
      value: String(recallsDue),
      sub: recallsDue > 0 ? 'Na fila de contacto' : 'Em dia',
      href: '/admin/recalls',
      ...(recallsDue > 0
        ? {
            accentBg: '#FDF3F2',
            accentBorder: '#F3CFCC',
            valueColor: '#B3261E',
          }
        : {}),
    },
    {
      label: 'Stock a repor',
      value: String(stockLowN),
      sub: stockLowN > 0 ? 'Abaixo do mínimo' : 'Níveis OK',
      href: '/admin/stock',
      ...(stockLowN > 0
        ? {
            accentBg: '#FFF9EE',
            accentBorder: '#F2DEB6',
            valueColor: '#8A5A00',
          }
        : {}),
    },
    {
      label: 'Catálogo por confirmar',
      value: String(catalogUnconfirmed),
      sub:
        catalogUnconfirmed > 0
          ? 'Rever duração, preço e flags'
          : 'Catálogo confirmado',
      href: '/admin/tratamentos',
      ...(catalogUnconfirmed > 0
        ? {
            accentBg: '#FFF9EE',
            accentBorder: '#F2DEB6',
            valueColor: '#8A5A00',
          }
        : {}),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Dados frescos sem F5: a página vive aberta na receção o dia todo */}
      <AutoRefresh intervalMs={90_000} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
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
              color: '#1B2A6B',
            }}
          >
            {firstName ? `Olá, ${firstName}` : 'Dashboard'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
            {dateLabel}
          </p>
        </div>
        {/* Ações rápidas: os dois gestos mais frequentes da administração */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            href='/admin/agenda'
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              backgroundColor: '#2743A6',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            + Nova marcação
          </Link>
          <Link
            href='/admin/pacientes/novo'
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              backgroundColor: '#FFFFFF',
              color: '#2743A6',
              border: '1px solid #C9D4FF',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            + Novo paciente
          </Link>
        </div>
      </div>

      {/* KPIs globais + alertas operacionais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
        }}
      >
        {kpis.map(kpi => {
          const sparkMax = kpi.spark ? Math.max(...kpi.spark) : 0;
          const body = (
            <div
              style={{
                ...card,
                height: '100%',
                boxSizing: 'border-box',
                border: kpi.accentBorder
                  ? `1px solid ${kpi.accentBorder}`
                  : card.border,
                backgroundColor: kpi.accentBg ?? '#FFFFFF',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  color: kpi.valueColor ?? '#1B2A6B',
                  lineHeight: 1.15,
                }}
              >
                {kpi.value}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  color: '#6A7186',
                }}
              >
                {kpi.label}
              </p>
              {kpi.sub && (
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: '#9AA1B4',
                  }}
                >
                  {kpi.sub}
                </p>
              )}
              {kpi.spark && sparkMax > 0 && (
                // 30 barras = 30 dias; a última (hoje) em destaque.
                // viewBox fixo + preserveAspectRatio none → estica à largura
                // do cartão sem media queries.
                <svg
                  viewBox={`0 0 ${kpi.spark.length * 5} 30`}
                  preserveAspectRatio='none'
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '30px',
                    marginTop: '8px',
                  }}
                  aria-hidden='true'
                >
                  {kpi.spark.map((v, i) => {
                    const h =
                      v > 0 ? Math.max(2, Math.round((v / sparkMax) * 28)) : 1;
                    const isToday = i === kpi.spark!.length - 1;
                    return (
                      <rect
                        key={i}
                        x={i * 5}
                        y={30 - h}
                        width={4}
                        height={h}
                        rx={1}
                        fill={
                          v === 0 ? '#E8EBF4' : isToday ? '#0F7B4D' : '#2743A6'
                        }
                      />
                    );
                  })}
                </svg>
              )}
              {kpi.href && (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#2743A6',
                  }}
                >
                  Abrir →
                </p>
              )}
            </div>
          );
          return kpi.href ? (
            <Link
              key={kpi.label}
              href={kpi.href}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              {body}
            </Link>
          ) : (
            <div key={kpi.label}>{body}</div>
          );
        })}
      </div>

      {/* A seguir hoje: quem é o próximo, em que clínica, com que médico */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '13px 20px',
            borderBottom: '1px solid #EEF1F8',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
            A seguir hoje
          </span>
          <Link
            href='/admin/agenda'
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#2743A6',
              textDecoration: 'none',
            }}
          >
            Abrir agenda →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '16px 20px',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: '#9AA1B4' }}>
              Sem mais consultas hoje.
            </p>
            <Link
              href='/admin/agenda'
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#2743A6',
                textDecoration: 'none',
              }}
            >
              + Nova marcação
            </Link>
          </div>
        ) : (
          <div>
            {upcoming.map((u, i) => {
              const cl = CLINIC_STYLE[u.clinicSlug] ?? {
                bg: '#EAECF3',
                fg: '#3D4257',
              };
              return (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '10px 20px',
                    borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#1B2A6B',
                      width: 46,
                      flexShrink: 0,
                    }}
                  >
                    {u.time}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/admin/pacientes/${u.patientId}`}
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#1C2233',
                        textDecoration: 'none',
                      }}
                    >
                      {u.patientName}
                    </Link>
                    <p
                      style={{
                        margin: '1px 0 0',
                        fontSize: '12px',
                        color: '#6A7186',
                      }}
                    >
                      {u.doctorName}
                    </p>
                  </div>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: cl.bg,
                      color: cl.fg,
                      flexShrink: 0,
                    }}
                  >
                    {slugLabel(u.clinicSlug)}
                  </span>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: u.status.bg,
                      color: u.status.fg,
                      flexShrink: 0,
                    }}
                  >
                    {u.status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Faltas de hoje (acionáveis) + aniversários — só quando existem */}
      {(missed.length > 0 || birthdays.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '12px',
          }}
        >
          {missed.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '13px 20px',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#B3261E',
                  }}
                >
                  Faltas e cancelamentos hoje
                </span>
              </div>
              <div>
                {missed.map((f, i) => {
                  return (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '10px 20px',
                        borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#3D4257',
                          width: 46,
                          flexShrink: 0,
                        }}
                      >
                        {f.time}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={`/admin/pacientes/${f.patientId}`}
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#1C2233',
                            textDecoration: 'none',
                          }}
                        >
                          {f.patientName}
                        </Link>
                        <p
                          style={{
                            margin: '1px 0 0',
                            fontSize: '12px',
                            color: '#6A7186',
                          }}
                        >
                          {f.doctorName}
                        </p>
                      </div>
                      <span
                        style={{
                          borderRadius: '999px',
                          padding: '2px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: f.status.bg,
                          color: f.status.fg,
                          flexShrink: 0,
                        }}
                      >
                        {f.status.label}
                      </span>
                      <Link
                        href={`/admin/agenda?clinic=${f.clinicSlug}`}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#2743A6',
                          textDecoration: 'none',
                          flexShrink: 0,
                        }}
                      >
                        Remarcar →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {birthdays.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '13px 20px',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                  }}
                >
                  Aniversários hoje 🎂
                </span>
              </div>
              <div>
                {birthdays.map((b, i) => (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '10px 20px',
                      borderTop: i === 0 ? 'none' : '1px solid #F4F6FB',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={`/admin/pacientes/${b.id}`}
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#1C2233',
                          textDecoration: 'none',
                        }}
                      >
                        {b.name}
                      </Link>
                      <p
                        style={{
                          margin: '1px 0 0',
                          fontSize: '12px',
                          color: '#6A7186',
                        }}
                      >
                        Faz {b.age} anos
                      </p>
                    </div>
                    {b.phone && (
                      <a
                        href={`tel:${b.phone}`}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#2743A6',
                          textDecoration: 'none',
                          flexShrink: 0,
                        }}
                      >
                        {b.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* O dia por clínica */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '12px',
        }}
      >
        {clinics.map(c => {
          const stats = perClinic.get(String(c._id)) ?? {
            total: 0,
            byStatus: {},
          };
          const executed = executedMap.get(String(c._id));
          const collect = collectByClinic.get(String(c._id));
          const cl = CLINIC_STYLE[c.slug] ?? { bg: '#EAECF3', fg: '#3D4257' };
          const inProgress = stats.byStatus['in-progress'] ?? 0;
          const waiting = stats.byStatus['checked-in'] ?? 0;
          const occ = occupancyByClinic.get(String(c._id)) ?? {
            pct: 0,
            openMin: 0,
          };
          return (
            <div
              key={c.slug}
              style={{ ...card, padding: 0, overflow: 'hidden' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 20px',
                  borderBottom: '1px solid #EEF1F8',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1B2A6B',
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    borderRadius: '999px',
                    padding: '2px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: cl.bg,
                    color: cl.fg,
                  }}
                >
                  {slugLabel(c.slug)}
                </span>
              </div>
              <div
                style={{
                  padding: '14px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {occ.openMin > 0 ? (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: '#6A7186' }}>
                        Ocupação hoje
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1B2A6B',
                        }}
                      >
                        {occ.pct}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        borderRadius: '999px',
                        backgroundColor: '#EEF1F8',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${occ.pct}%`,
                          borderRadius: '999px',
                          backgroundColor: '#2743A6',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
                    Fechada hoje
                  </p>
                )}
                <p style={{ margin: 0, fontSize: '14px', color: '#3D4257' }}>
                  <strong style={{ color: '#1B2A6B' }}>
                    {activeOf(stats.byStatus)}
                  </strong>{' '}
                  consulta{activeOf(stats.byStatus) === 1 ? '' : 's'} hoje ·{' '}
                  {doneOf(stats.byStatus)} concluída
                  {doneOf(stats.byStatus) === 1 ? '' : 's'}
                  {missedOf(stats.byStatus) > 0 && (
                    <span style={{ color: '#B3261E' }}>
                      {' '}
                      · {missedOf(stats.byStatus)} falta
                      {missedOf(stats.byStatus) === 1 ? '' : 's'}/cancelada
                      {missedOf(stats.byStatus) === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
                {(inProgress > 0 || waiting > 0) && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: '#0F7B4D',
                      fontWeight: 600,
                    }}
                  >
                    Agora: {inProgress > 0 ? `${inProgress} em curso` : ''}
                    {inProgress > 0 && waiting > 0 ? ' · ' : ''}
                    {waiting > 0 ? `${waiting} em espera` : ''}
                  </p>
                )}
                {executed && executed.cents > 0 && (
                  <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
                    Executado hoje:{' '}
                    <strong style={{ color: '#0F7B4D' }}>
                      {formatCents(executed.cents)}
                    </strong>{' '}
                    ({executed.n} ato{executed.n === 1 ? '' : 's'})
                  </p>
                )}
                {collect && collect.cents > 0 && (
                  <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
                    Por cobrar:{' '}
                    <strong style={{ color: '#1B2A6B' }}>
                      {formatCents(collect.cents)}
                    </strong>{' '}
                    ({collect.n} ato{collect.n === 1 ? '' : 's'})
                  </p>
                )}
                <Link
                  href={`/admin/agenda?clinic=${c.slug}`}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#2743A6',
                    textDecoration: 'none',
                  }}
                >
                  Abrir agenda →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
