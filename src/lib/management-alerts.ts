// 📄 src/lib/management-alerts.ts
// =============================================================================
// CDC Manager — Avisos da gestão (8.ª ronda, Victor 17/11/2026)
// -----------------------------------------------------------------------------
// Contas puras (sem BD nem React, para serem testadas) dos quatro avisos:
//   · 09 — aniversário de um médico ou colaborador: aviso na semana
//   · 16 — documento de um médico: 30 dias antes de expirar; vencido = todos
//          os dias, com urgência
//   · 17 — empresas parceiras e renovações: aviso antes de cada prazo
//   · 18 — fim de contrato: 40 dias antes de cada uma das três datas, para a
//          carta de não renovação
// Os dias são sempre 'YYYY-MM-DD' no fuso de Lisboa.
// =============================================================================

export const DOCUMENT_WARN_DAYS = 30;
export const PARTNER_WARN_DAYS = 30;
export const CONTRACT_WARN_DAYS = 40;

export type ManagementAlertKind =
  | 'birthday'
  | 'doctor-document'
  | 'partner'
  | 'contract'
  // 9.ª ronda/08: médico com muitas fichas abertas fora da agenda dele
  | 'patient-access';

export type ManagementAlertLevel = 'info' | 'warning' | 'urgent';

export interface ManagementAlert {
  kind: ManagementAlertKind;
  level: ManagementAlertLevel;
  /** Quem ou o quê: "Dra. Marta Silva", "Extintores — Segurmax" */
  subject: string;
  /** Frase pronta a mostrar */
  text: string;
  /** Dia a que o aviso se refere (aniversário, validade, fim de contrato) */
  date: string;
  /** Dias até lá (negativo = já passou) */
  days: number;
  /** Para onde levar quem clica */
  href: string | null;
  /** Só nos documentos dos médicos: para o médico ver os seus */
  doctorId?: string | null;
}

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Dias de `fromIso` até `toIso` (negativo se `toIso` já passou) */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

export function formatPtDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Segunda a domingo da semana de `todayIso` */
export function weekRange(todayIso: string): { start: string; end: string } {
  const t = toUtc(todayIso);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = segunda
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: iso(t - dow * DAY_MS), end: iso(t + (6 - dow) * DAY_MS) };
}

/**
 * Aniversário deste ano dentro da semana corrente? Devolve o dia, ou null.
 * Quem nasceu a 29/02 festeja a 28/02 nos anos comuns. Uma semana que apanha
 * a passagem de ano é verificada nos dois anos.
 */
export function birthdayThisWeek(
  birthIso: string,
  todayIso: string,
): string | null {
  const { start, end } = weekRange(todayIso);
  const [, bm, bd] = birthIso.split('-').map(Number);
  for (const year of new Set([
    Number(start.slice(0, 4)),
    Number(end.slice(0, 4)),
  ])) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = bm === 2 && bd === 29 && !leap ? 28 : bd;
    const iso = `${year}-${String(bm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso >= start && iso <= end) return iso;
  }
  return null;
}

const when = (days: number) =>
  days === 0
    ? 'hoje'
    : days === 1
      ? 'amanhã'
      : days > 1
        ? `daqui a ${days} dias`
        : days === -1
          ? 'ontem'
          : `há ${-days} dias`;

export interface AlertPerson {
  id: string;
  name: string;
  type: 'doctor' | 'employee';
  birthIso: string | null;
}

export function birthdayAlerts(
  people: AlertPerson[],
  todayIso: string,
): ManagementAlert[] {
  const out: ManagementAlert[] = [];
  for (const p of people) {
    if (!p.birthIso) continue;
    const day = birthdayThisWeek(p.birthIso, todayIso);
    if (!day) continue;
    const days = daysBetween(todayIso, day);
    out.push({
      kind: 'birthday',
      level: 'info',
      subject: p.name,
      text:
        days === 0
          ? `${p.name} faz anos hoje.`
          : days > 0
            ? `${p.name} faz anos ${when(days)} (${formatPtDay(day).slice(0, 5)}).`
            : `${p.name} fez anos ${when(days)} (${formatPtDay(day).slice(0, 5)}).`,
      date: day,
      days,
      href:
        p.type === 'doctor'
          ? `/admin/medicos/${p.id}`
          : `/admin/colaboradores/${p.id}`,
    });
  }
  return out;
}

export interface AlertExpiry {
  id: string;
  scope: 'doctor' | 'partner';
  name: string;
  /** Médico (scope doctor) ou empresa (scope partner) */
  owner: string | null;
  doctorId: string | null;
  expiresIso: string;
}

/** Documentos dos médicos (16) e empresas parceiras (17) */
export function expiryAlerts(
  items: AlertExpiry[],
  todayIso: string,
): ManagementAlert[] {
  const out: ManagementAlert[] = [];
  for (const it of items) {
    const days = daysBetween(todayIso, it.expiresIso);
    const limit = it.scope === 'doctor' ? DOCUMENT_WARN_DAYS : PARTNER_WARN_DAYS;
    if (days > limit) continue;
    const subject = it.owner ? `${it.name} — ${it.owner}` : it.name;
    out.push({
      kind: it.scope === 'doctor' ? 'doctor-document' : 'partner',
      level: days < 0 ? 'urgent' : 'warning',
      subject,
      text:
        days < 0
          ? `${subject}: vencido ${when(days)} (${formatPtDay(it.expiresIso)}). Atualizar com urgência.`
          : `${subject}: expira ${when(days)} (${formatPtDay(it.expiresIso)}).`,
      date: it.expiresIso,
      days,
      href: '/admin/prazos',
      doctorId: it.doctorId,
    });
  }
  return out;
}

export interface AlertContract {
  employeeId: string;
  name: string;
  /** As datas de fim de contrato registadas na ficha (até três) */
  endIsos: string[];
}

/** Fim de contrato (18): aviso 40 dias antes de cada data, até ela chegar */
export function contractAlerts(
  employees: AlertContract[],
  todayIso: string,
): ManagementAlert[] {
  const out: ManagementAlert[] = [];
  for (const e of employees) {
    const sorted = [...e.endIsos].sort();
    sorted.forEach((iso, i) => {
      const days = daysBetween(todayIso, iso);
      if (days < 0 || days > CONTRACT_WARN_DAYS) return;
      out.push({
        kind: 'contract',
        level: days <= 10 ? 'urgent' : 'warning',
        subject: e.name,
        text: `${e.name}: o contrato termina ${when(days)} (${formatPtDay(iso)}, ${i + 1}.ª data). Decidir a renovação ou enviar a carta de não renovação.`,
        date: iso,
        days,
        href: `/admin/colaboradores/${e.employeeId}`,
      });
    });
  }
  return out;
}

const LEVEL_ORDER: Record<ManagementAlertLevel, number> = {
  urgent: 0,
  warning: 1,
  info: 2,
};

/** Urgentes primeiro; dentro do mesmo nível, o que está mais perto */
export function sortAlerts(alerts: ManagementAlert[]): ManagementAlert[] {
  return [...alerts].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      a.days - b.days ||
      a.subject.localeCompare(b.subject, 'pt'),
  );
}
