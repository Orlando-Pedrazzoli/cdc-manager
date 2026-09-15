// 📄 src/lib/listagens.ts
// =============================================================================
// CDC Manager — Listagens (Fase 5B): definições + queries
// -----------------------------------------------------------------------------
// P8 (Victor, "Listagens de Operador" do Dentoral): aniversários, últimas
// visitas por paciente por idade, tabela de tratamentos, tratamentos por
// tipo, tratamentos por paciente. (Ficha de paciente = página da ficha;
// justificações de presença = Fase 5A.)
// X2 (PPTX, "Listagens de faturação"): diário de caixa, documentos emitidos,
// tratamentos não faturados, faturação por categoria, planos de tratamento.
// (Por médico/produção = Relatórios; extratos/saldos/adiantamentos = 5C.)
//
// Cada listagem devolve { columns, rows, totals? } genéricos — a página
// renderiza tabela + CSV + impressão sem conhecer a listagem. Regra de
// fecho de mês para produção = lib/commission-accounting.ts.
// =============================================================================

import mongoose from 'mongoose';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Procedure from '@/models/Procedure';
import Invoice from '@/models/Invoice';
import TreatmentType from '@/models/TreatmentType';
import TreatmentPlan from '@/models/TreatmentPlan';
import Doctor from '@/models/Doctor';
import { lisbonToUtc } from '@/lib/availability';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import { INVOICE_STATUS_LABEL } from '@/lib/labels';

export type ListingKey =
  | 'aniversarios'
  | 'ultimas-visitas'
  | 'tabela-tratamentos'
  | 'tratamentos-por-tipo'
  | 'tratamentos-por-paciente'
  | 'diario-caixa'
  | 'documentos-emitidos'
  | 'nao-faturados'
  | 'faturacao-categoria'
  | 'planos'
  | 'saldos';

export interface ListingDef {
  key: ListingKey;
  group: 'operador' | 'faturacao';
  title: string;
  description: string;
  /** Filtros que a página mostra */
  filters: ('mes' | 'periodo' | 'clinica' | 'idade' | 'inatividade')[];
}

export const LISTINGS: ListingDef[] = [
  {
    key: 'aniversarios',
    group: 'operador',
    title: 'Aniversários',
    description:
      'Pacientes que fazem anos no mês — para o contacto de aniversário.',
    filters: ['mes'],
  },
  {
    key: 'ultimas-visitas',
    group: 'operador',
    title: 'Últimas visitas por paciente por idade',
    description:
      'Data da última consulta de cada paciente, filtrável por idade e tempo sem vir.',
    filters: ['idade', 'inatividade'],
  },
  {
    key: 'tabela-tratamentos',
    group: 'operador',
    title: 'Tabela de tratamentos',
    description: 'Catálogo em vigor com preços, custos e categorias.',
    filters: [],
  },
  {
    key: 'tratamentos-por-tipo',
    group: 'operador',
    title: 'Tratamentos por tipo',
    description:
      'Quantos atos de cada tipo foram executados e o valor, no período.',
    filters: ['periodo', 'clinica'],
  },
  {
    key: 'tratamentos-por-paciente',
    group: 'operador',
    title: 'Tratamentos por paciente',
    description: 'Atos executados por paciente no período, com valores.',
    filters: ['periodo', 'clinica'],
  },
  {
    key: 'diario-caixa',
    group: 'faturacao',
    title: 'Diário de caixa',
    description: 'Cobranças por dia e meio de pagamento.',
    filters: ['periodo', 'clinica'],
  },
  {
    key: 'documentos-emitidos',
    group: 'faturacao',
    title: 'Documentos emitidos',
    description: 'Todas as faturas do período, com estado e NIF.',
    filters: ['periodo', 'clinica'],
  },
  {
    key: 'nao-faturados',
    group: 'faturacao',
    title: 'Tratamentos não faturados',
    description: 'Atos concluídos que ainda não foram cobrados, por paciente.',
    filters: ['clinica'],
  },
  {
    key: 'faturacao-categoria',
    group: 'faturacao',
    title: 'Faturação por categoria de tratamento',
    description:
      'Valor cobrado por categoria no período (Clínica / Tipos de Tratamento).',
    filters: ['periodo', 'clinica'],
  },
  {
    key: 'planos',
    group: 'faturacao',
    title: 'Planos de tratamento',
    description: 'Orçamentos por estado, com valor e execução.',
    filters: ['periodo', 'clinica'],
  },
];

export interface ListingColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  kind?: 'cents' | 'text' | 'int';
}
export interface ListingResult {
  columns: ListingColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
  note?: string;
}

export interface ListingParams {
  mes: string; // YYYY-MM
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (inclusive)
  clinicId: string | null;
  ageMin: number | null;
  ageMax: number | null;
  inactiveMonths: number | null;
}

const ptDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
const ptDateTime = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  })
    .format(d)
    .replace(',', '');
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function bounds(p: ListingParams): [Date, Date] {
  return [lisbonToUtc(p.from, 0), lisbonToUtc(shiftDate(p.to, 1), 0)];
}
function ageOf(birth: Date, at = new Date()): number {
  let a = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) a--;
  return a;
}
const clinicMatch = (p: ListingParams) =>
  p.clinicId ? { clinicId: new mongoose.Types.ObjectId(p.clinicId) } : {};

export async function runListing(
  key: ListingKey,
  p: ListingParams,
): Promise<ListingResult> {
  switch (key) {
    case 'aniversarios': {
      const month = Number(p.mes.slice(5, 7));
      const patients = await Patient.find({
        status: 'active',
        birthDate: { $ne: null },
      })
        .select('name processNumber birthDate phone email')
        .lean();
      const rows = patients
        .filter(
          x => x.birthDate && new Date(x.birthDate).getUTCMonth() + 1 === month,
        )
        .map(x => {
          const b = new Date(x.birthDate as Date);
          return {
            dia: b.getUTCDate(),
            processo: String(x.processNumber),
            nome: x.name,
            idade: ageOf(
              b,
              new Date(Number(p.mes.slice(0, 4)), month - 1, b.getUTCDate()),
            ),
            telefone: x.phone ?? '',
            email: x.email ?? '',
          };
        })
        .sort((a, b) => a.dia - b.dia);
      return {
        columns: [
          { key: 'dia', label: 'Dia', kind: 'int' },
          { key: 'processo', label: 'Nº' },
          { key: 'nome', label: 'Paciente' },
          { key: 'idade', label: 'Faz anos', kind: 'int', align: 'right' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'email', label: 'Email' },
        ],
        rows,
      };
    }

    case 'ultimas-visitas': {
      const last = await Appointment.aggregate<{
        _id: mongoose.Types.ObjectId;
        last: Date;
        n: number;
      }>([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$patientId',
            last: { $max: '$startAt' },
            n: { $sum: 1 },
          },
        },
      ]);
      const lastBy = new Map(last.map(l => [String(l._id), l]));
      const patients = await Patient.find({ status: 'active' })
        .select('name processNumber birthDate phone')
        .lean();
      const now = new Date();
      const rows = patients
        .map(x => {
          const l = lastBy.get(String(x._id));
          const age = x.birthDate ? ageOf(new Date(x.birthDate)) : null;
          const months = l
            ? Math.floor(
                (now.getTime() - new Date(l.last).getTime()) /
                  (30.44 * 86_400_000),
              )
            : null;
          return {
            processo: String(x.processNumber),
            nome: x.name,
            idade: age,
            ultima: l ? ptDate(l.last) : 'nunca',
            meses: months,
            consultas: l?.n ?? 0,
            telefone: x.phone ?? '',
            _sort: l ? new Date(l.last).getTime() : 0,
          };
        })
        .filter(
          r =>
            (p.ageMin == null || (r.idade != null && r.idade >= p.ageMin)) &&
            (p.ageMax == null || (r.idade != null && r.idade <= p.ageMax)),
        )
        .filter(
          r =>
            p.inactiveMonths == null ||
            r.meses == null ||
            r.meses >= p.inactiveMonths,
        )
        .sort((a, b) => a._sort - b._sort)
        .map(r => {
          const { _sort: _ignored, ...rest } = r;
          void _ignored;
          return rest;
        });
      return {
        columns: [
          { key: 'processo', label: 'Nº' },
          { key: 'nome', label: 'Paciente' },
          { key: 'idade', label: 'Idade', kind: 'int', align: 'right' },
          { key: 'ultima', label: 'Última consulta' },
          { key: 'meses', label: 'Meses sem vir', kind: 'int', align: 'right' },
          { key: 'consultas', label: 'Consultas', kind: 'int', align: 'right' },
          { key: 'telefone', label: 'Telefone' },
        ],
        rows,
        note: 'Ordenado dos pacientes há mais tempo sem vir para os mais recentes.',
      };
    }

    case 'tabela-tratamentos': {
      const tt = await TreatmentType.find({ active: true })
        .sort({ category: 1, name: 1 })
        .select('name category dentoralCode priceCents costCents durationMin')
        .lean();
      return {
        columns: [
          { key: 'categoria', label: 'Categoria' },
          { key: 'codigo', label: 'Código' },
          { key: 'nome', label: 'Ato' },
          {
            key: 'duracao',
            label: 'Duração (min)',
            kind: 'int',
            align: 'right',
          },
          {
            key: 'custo',
            label: 'Custo direto',
            kind: 'cents',
            align: 'right',
          },
          { key: 'pvp', label: 'PVP', kind: 'cents', align: 'right' },
        ],
        rows: tt.map(t => ({
          categoria: t.category ?? '—',
          codigo: (t.dentoralCode as string | null) ?? '',
          nome: t.name,
          duracao: t.durationMin,
          custo: t.costCents ?? 0,
          pvp: t.priceCents,
        })),
      };
    }

    case 'tratamentos-por-tipo': {
      const [s, e] = bounds(p);
      const agg = await Procedure.aggregate<{
        _id: { name: string; cat: string | null };
        n: number;
        cents: number;
      }>([
        {
          $match: {
            ...clinicMatch(p),
            status: { $in: ['completed', 'invoiced'] },
            executedAt: { $gte: s, $lt: e },
          },
        },
        {
          $group: {
            _id: { name: '$nameSnapshot', cat: '$categorySnapshot' },
            n: { $sum: 1 },
            cents: { $sum: '$priceCents' },
          },
        },
        { $sort: { n: -1 } },
      ]);
      const rows = agg.map(a => ({
        categoria: a._id.cat ?? '—',
        ato: a._id.name,
        n: a.n,
        valor: a.cents,
      }));
      return {
        columns: [
          { key: 'categoria', label: 'Categoria' },
          { key: 'ato', label: 'Tratamento' },
          { key: 'n', label: 'Nº atos', kind: 'int', align: 'right' },
          {
            key: 'valor',
            label: 'Valor cobrado',
            kind: 'cents',
            align: 'right',
          },
        ],
        rows,
        totals: {
          n: rows.reduce((x, r) => x + r.n, 0),
          valor: rows.reduce((x, r) => x + r.valor, 0),
        },
      };
    }

    case 'tratamentos-por-paciente': {
      const [s, e] = bounds(p);
      const procs = await Procedure.find({
        ...clinicMatch(p),
        status: { $in: ['completed', 'invoiced'] },
        executedAt: { $gte: s, $lt: e },
      })
        .select(
          'patientId doctorId nameSnapshot categorySnapshot priceCents executedAt toothNumbers',
        )
        .sort({ patientId: 1, executedAt: 1 })
        .lean();
      const [patients, doctors] = await Promise.all([
        Patient.find({ _id: { $in: procs.map(x => x.patientId) } })
          .select('name processNumber')
          .lean(),
        Doctor.find({}).select('name').lean(),
      ]);
      const pBy = new Map(patients.map(x => [String(x._id), x]));
      const dBy = new Map(doctors.map(x => [String(x._id), x.name]));
      const rows = procs.map(x => {
        const pt = pBy.get(String(x.patientId));
        return {
          processo: pt ? String(pt.processNumber) : '—',
          paciente: pt?.name ?? '(removido)',
          data: x.executedAt ? ptDate(x.executedAt) : '',
          categoria: x.categorySnapshot ?? '—',
          ato:
            x.nameSnapshot +
            (x.toothNumbers?.length ? ` (${x.toothNumbers.join(', ')})` : ''),
          medico: dBy.get(String(x.doctorId)) ?? '—',
          valor: x.priceCents,
        };
      });
      return {
        columns: [
          { key: 'processo', label: 'Nº' },
          { key: 'paciente', label: 'Paciente' },
          { key: 'data', label: 'Data' },
          { key: 'categoria', label: 'Categoria' },
          { key: 'ato', label: 'Tratamento' },
          { key: 'medico', label: 'Médico' },
          { key: 'valor', label: 'Valor', kind: 'cents', align: 'right' },
        ],
        rows,
        totals: { valor: rows.reduce((a, r) => a + r.valor, 0) },
      };
    }

    case 'diario-caixa': {
      const [s, e] = bounds(p);
      const inv = await Invoice.find({
        ...clinicMatch(p),
        status: { $ne: 'voided' },
        paidAt: { $gte: s, $lt: e },
      })
        .select('paidAt paymentMethod totalCents')
        .sort({ paidAt: 1 })
        .lean();
      const byDay = new Map<string, Record<string, number>>();
      for (const i of inv) {
        const d = ptDate(i.paidAt as Date);
        const r = byDay.get(d) ?? {
          cash: 0,
          card: 0,
          mbway: 0,
          transfer: 0,
          total: 0,
          n: 0,
        };
        r[i.paymentMethod as string] =
          (r[i.paymentMethod as string] ?? 0) + i.totalCents;
        r.total += i.totalCents;
        r.n += 1;
        byDay.set(d, r);
      }
      const rows = Array.from(byDay.entries()).map(([dia, r]) => ({
        dia,
        n: r.n,
        cash: r.cash,
        card: r.card,
        mbway: r.mbway,
        transfer: r.transfer,
        total: r.total,
      }));
      const sum = (k: string) =>
        rows.reduce((a, r) => a + (r[k as keyof typeof r] as number), 0);
      return {
        columns: [
          { key: 'dia', label: 'Dia' },
          { key: 'n', label: 'Docs', kind: 'int', align: 'right' },
          {
            key: 'cash',
            label: PAYMENT_METHOD_LABEL.cash,
            kind: 'cents',
            align: 'right',
          },
          {
            key: 'card',
            label: PAYMENT_METHOD_LABEL.card,
            kind: 'cents',
            align: 'right',
          },
          {
            key: 'mbway',
            label: PAYMENT_METHOD_LABEL.mbway,
            kind: 'cents',
            align: 'right',
          },
          {
            key: 'transfer',
            label: PAYMENT_METHOD_LABEL.transfer,
            kind: 'cents',
            align: 'right',
          },
          { key: 'total', label: 'Total', kind: 'cents', align: 'right' },
        ],
        rows,
        totals: {
          n: sum('n'),
          cash: sum('cash'),
          card: sum('card'),
          mbway: sum('mbway'),
          transfer: sum('transfer'),
          total: sum('total'),
        },
      };
    }

    case 'documentos-emitidos': {
      const [s, e] = bounds(p);
      const inv = await Invoice.find({
        ...clinicMatch(p),
        createdAt: { $gte: s, $lt: e },
      })
        .select(
          'createdAt patientId status paymentMethod totalCents nifSnapshot moloniDocumentNumber',
        )
        .sort({ createdAt: -1 })
        .lean();
      const patients = await Patient.find({
        _id: { $in: inv.map(i => i.patientId) },
      })
        .select('name processNumber')
        .lean();
      const pBy = new Map(patients.map(x => [String(x._id), x]));
      const rows = inv.map(i => {
        const pt = pBy.get(String(i.patientId));
        return {
          data: ptDateTime(i.createdAt as Date),
          documento:
            i.moloniDocumentNumber ??
            `Interno #${String(i._id).slice(-6).toUpperCase()}`,
          processo: pt ? String(pt.processNumber) : '—',
          paciente: pt?.name ?? '(removido)',
          nif: i.nifSnapshot ?? 'Cons. final',
          meio:
            PAYMENT_METHOD_LABEL[i.paymentMethod as PaymentMethod] ??
            i.paymentMethod,
          estado:
            INVOICE_STATUS_LABEL[
              i.status as keyof typeof INVOICE_STATUS_LABEL
            ] ?? i.status,
          valor: i.status === 'voided' ? 0 : i.totalCents,
        };
      });
      return {
        columns: [
          { key: 'data', label: 'Data' },
          { key: 'documento', label: 'Documento' },
          { key: 'processo', label: 'Nº' },
          { key: 'paciente', label: 'Paciente' },
          { key: 'nif', label: 'NIF' },
          { key: 'meio', label: 'Meio' },
          { key: 'estado', label: 'Estado' },
          { key: 'valor', label: 'Valor', kind: 'cents', align: 'right' },
        ],
        rows,
        totals: { valor: rows.reduce((a, r) => a + r.valor, 0) },
        note: 'Documentos anulados aparecem com valor 0 e não somam.',
      };
    }

    case 'nao-faturados': {
      const procs = await Procedure.find({
        ...clinicMatch(p),
        status: 'completed',
        invoiceId: null,
      })
        .select('patientId nameSnapshot priceCents executedAt')
        .sort({ executedAt: 1 })
        .lean();
      const patients = await Patient.find({
        _id: { $in: procs.map(x => x.patientId) },
      })
        .select('name processNumber phone')
        .lean();
      const pBy = new Map(patients.map(x => [String(x._id), x]));
      const grouped = new Map<
        string,
        {
          processo: string;
          paciente: string;
          telefone: string;
          n: number;
          desde: Date;
          valor: number;
        }
      >();
      for (const x of procs) {
        const k = String(x.patientId);
        const pt = pBy.get(k);
        const g = grouped.get(k) ?? {
          processo: pt ? String(pt.processNumber) : '—',
          paciente: pt?.name ?? '(removido)',
          telefone: pt?.phone ?? '',
          n: 0,
          desde: x.executedAt as Date,
          valor: 0,
        };
        g.n += 1;
        g.valor += x.priceCents;
        if (x.executedAt && x.executedAt < g.desde) g.desde = x.executedAt;
        grouped.set(k, g);
      }
      const rows = Array.from(grouped.values())
        .sort((a, b) => b.valor - a.valor)
        .map(g => ({ ...g, desde: ptDate(g.desde) }));
      return {
        columns: [
          { key: 'processo', label: 'Nº' },
          { key: 'paciente', label: 'Paciente' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'n', label: 'Atos', kind: 'int', align: 'right' },
          { key: 'desde', label: 'Mais antigo' },
          { key: 'valor', label: 'Por cobrar', kind: 'cents', align: 'right' },
        ],
        rows,
        totals: {
          n: rows.reduce((a, r) => a + r.n, 0),
          valor: rows.reduce((a, r) => a + r.valor, 0),
        },
      };
    }

    case 'faturacao-categoria': {
      const [s, e] = bounds(p);
      const inv = await Invoice.find({
        ...clinicMatch(p),
        status: { $ne: 'voided' },
        paidAt: { $gte: s, $lt: e },
      })
        .select('lines')
        .lean();
      const procIds = inv.flatMap(i => i.lines.map(l => l.procedureId));
      const procs = await Procedure.find({ _id: { $in: procIds } })
        .select('categorySnapshot priceCents')
        .lean();
      const byCat = new Map<string, { n: number; cents: number }>();
      for (const x of procs) {
        const k = x.categorySnapshot ?? '—';
        const g = byCat.get(k) ?? { n: 0, cents: 0 };
        g.n += 1;
        g.cents += x.priceCents;
        byCat.set(k, g);
      }
      const total = Array.from(byCat.values()).reduce((a, g) => a + g.cents, 0);
      const rows = Array.from(byCat.entries())
        .map(([categoria, g]) => ({
          categoria,
          n: g.n,
          valor: g.cents,
          peso: total ? `${Math.round((g.cents / total) * 1000) / 10}%` : '—',
        }))
        .sort((a, b) => b.valor - a.valor);
      return {
        columns: [
          { key: 'categoria', label: 'Categoria' },
          { key: 'n', label: 'Atos', kind: 'int', align: 'right' },
          { key: 'valor', label: 'Cobrado', kind: 'cents', align: 'right' },
          { key: 'peso', label: '% do total', align: 'right' },
        ],
        rows,
        totals: { n: rows.reduce((a, r) => a + r.n, 0), valor: total },
      };
    }

    case 'saldos': {
      const inv = await Invoice.find({
        ...clinicMatch(p),
        status: { $ne: 'voided' },
        paidCents: { $ne: null },
      })
        .select('patientId createdAt totalCents paidCents moloniDocumentNumber')
        .lean();
      const open = inv.filter(
        i => (i.paidCents ?? i.totalCents) < i.totalCents,
      );
      const patients = await Patient.find({
        _id: { $in: open.map(i => i.patientId) },
      })
        .select('name processNumber phone')
        .lean();
      const pBy = new Map(patients.map(x => [String(x._id), x]));
      const rows = open
        .map(i => {
          const pt = pBy.get(String(i.patientId));
          return {
            data: ptDate(i.createdAt as Date),
            documento:
              i.moloniDocumentNumber ??
              `Interno #${String(i._id).slice(-6).toUpperCase()}`,
            processo: pt ? String(pt.processNumber) : '—',
            paciente: pt?.name ?? '(removido)',
            telefone: pt?.phone ?? '',
            total: i.totalCents,
            pago: i.paidCents ?? 0,
            divida: i.totalCents - (i.paidCents ?? 0),
          };
        })
        .sort((a, b) => b.divida - a.divida);
      return {
        columns: [
          { key: 'data', label: 'Data' },
          { key: 'documento', label: 'Documento' },
          { key: 'processo', label: 'Nº' },
          { key: 'paciente', label: 'Paciente' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'total', label: 'Total', kind: 'cents', align: 'right' },
          { key: 'pago', label: 'Pago', kind: 'cents', align: 'right' },
          { key: 'divida', label: 'Em dívida', kind: 'cents', align: 'right' },
        ],
        rows,
        totals: {
          total: rows.reduce((a, r) => a + r.total, 0),
          pago: rows.reduce((a, r) => a + r.pago, 0),
          divida: rows.reduce((a, r) => a + r.divida, 0),
        },
        note: 'Para registar o pagamento em falta, abrir o documento em Faturação.',
      };
    }

    case 'planos': {
      const [s, e] = bounds(p);
      const plans = await TreatmentPlan.find({
        ...clinicMatch(p),
        createdAt: { $gte: s, $lt: e },
      })
        .select(
          'patientId doctorId title status totalCents discountCents items createdAt',
        )
        .sort({ createdAt: -1 })
        .lean();
      const [patients, doctors] = await Promise.all([
        Patient.find({ _id: { $in: plans.map(x => x.patientId) } })
          .select('name processNumber')
          .lean(),
        Doctor.find({}).select('name').lean(),
      ]);
      const pBy = new Map(patients.map(x => [String(x._id), x]));
      const dBy = new Map(doctors.map(x => [String(x._id), x.name]));
      const STATUS: Record<string, string> = {
        draft: 'Rascunho',
        proposed: 'Proposto',
        approved: 'Aprovado',
        'in-progress': 'Em curso',
        completed: 'Concluído',
        declined: 'Recusado',
        expired: 'Expirado',
      };
      const rows = plans.map(x => ({
        data: ptDate(x.createdAt as Date),
        processo: pBy.get(String(x.patientId))
          ? String(pBy.get(String(x.patientId))!.processNumber)
          : '—',
        paciente: pBy.get(String(x.patientId))?.name ?? '(removido)',
        titulo: x.title,
        medico: dBy.get(String(x.doctorId)) ?? '—',
        estado: STATUS[x.status] ?? x.status,
        itens: x.items.length,
        valor: x.totalCents - (x.discountCents ?? 0),
      }));
      return {
        columns: [
          { key: 'data', label: 'Data' },
          { key: 'processo', label: 'Nº' },
          { key: 'paciente', label: 'Paciente' },
          { key: 'titulo', label: 'Plano' },
          { key: 'medico', label: 'Médico' },
          { key: 'estado', label: 'Estado' },
          { key: 'itens', label: 'Itens', kind: 'int', align: 'right' },
          { key: 'valor', label: 'Valor', kind: 'cents', align: 'right' },
        ],
        rows,
        totals: { valor: rows.reduce((a, r) => a + r.valor, 0) },
      };
    }
  }
}
