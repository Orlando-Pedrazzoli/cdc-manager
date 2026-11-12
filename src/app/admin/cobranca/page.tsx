// 📄 src/app/admin/cobranca/page.tsx
// =============================================================================
// CDC Manager — Receção: Cobrança
// -----------------------------------------------------------------------------
// A fila de cobrança POR CLÍNICA (?clinic=, padrão da agenda): atos
// executados (completed) ainda sem fatura, agrupados por paciente, com
// checkout no modal. Em baixo, as cobranças de hoje da clínica.
// Servida pelo índice {clinicId, status, invoiceId, executedAt} criado
// no arranque do Sprint 3 — a fila nasceu antes do ecrã.
//
// 6.ª ronda/10 (Victor, nov. 2026): FILTROS na fila — ano, mês, dia (data em
// que o ato foi feito), paciente, tratamento, médico e laboratório (pacientes
// com trabalho pedido a esse laboratório nesta clínica). Tudo em GET, para o
// endereço se poder guardar/partilhar. Sem filtros, a fila mostra só os
// primeiros MAX_CARDS pacientes (eram ~950 cartões de uma vez).
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Link from 'next/link';
import Procedure from '@/models/Procedure';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Invoice from '@/models/Invoice';
import LabCase from '@/models/LabCase';
import Supplier from '@/models/Supplier';
import { patientSearchOr } from '@/lib/patient-search';
import { getActiveClinics } from '@/models/Clinic';
import { clinicLabel, defaultClinic } from '@/lib/branding';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { formatCents } from '@/lib/commissions';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import {
  CheckoutModal,
  type BillableAct,
} from '@/components/cobranca/CheckoutModal';
import { processLabel } from '@/lib/domain';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cobranças' };

function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

const MAX_CARDS = 100;
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const OID_RE = /^[0-9a-fA-F]{24}$/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ano / mês / dia → intervalo [início, fim[ em UTC (hora de Lisboa).
 *  Mês sem ano = ano corrente; dia só conta com mês. */
function executedRange(
  ano: number | null,
  mes: number | null,
  dia: number | null,
  currentYear: number,
): { start: Date; end: Date } | null {
  if (!ano && !mes) return null;
  const y = ano ?? currentYear;
  if (!mes) {
    return {
      start: lisbonToUtc(`${y}-01-01`, 0),
      end: lisbonToUtc(`${y + 1}-01-01`, 0),
    };
  }
  const daysInMonth = new Date(Date.UTC(y, mes, 0)).getUTCDate();
  if (dia && dia <= daysInMonth) {
    const d = `${y}-${pad2(mes)}-${pad2(dia)}`;
    return { start: lisbonToUtc(d, 0), end: lisbonToUtc(d, 24 * 60) };
  }
  const nextY = mes === 12 ? y + 1 : y;
  const nextM = mes === 12 ? 1 : mes + 1;
  return {
    start: lisbonToUtc(`${y}-${pad2(mes)}-01`, 0),
    end: lisbonToUtc(`${nextY}-${pad2(nextM)}-01`, 0),
  };
}

const filterField: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid #D8DEEF',
  padding: '7px 10px',
  fontSize: '13px',
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
  maxWidth: '100%',
};
const filterLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6A7186',
};

export default async function CobrancaPage({
  searchParams,
}: {
  searchParams: Promise<{
    clinic?: string;
    ano?: string;
    mes?: string;
    dia?: string;
    paciente?: string;
    tratamento?: string;
    medico?: string;
    lab?: string;
  }>;
}) {
  const sp = await searchParams;
  const clinicParam = sp.clinic;
  const session = await auth();
  if (!session?.user) return null;

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === clinicParam) ?? defaultClinic(clinics);
  if (!clinic) return null;

  const today = todayLisbon();
  const currentYear = Number(today.slice(0, 4));

  // --- Filtros (6.ª ronda/10) -------------------------------------------------
  const int = (v: string | undefined, min: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const fAno = int(sp.ano, 2000, currentYear + 1);
  const fMes = int(sp.mes, 1, 12);
  const fDia = fMes ? int(sp.dia, 1, 31) : null;
  const fPaciente = (sp.paciente ?? '').trim().slice(0, 80);
  const fTratamento = (sp.tratamento ?? '').trim().slice(0, 80);
  const fMedico = sp.medico && OID_RE.test(sp.medico) ? sp.medico : '';
  const fLab = sp.lab && OID_RE.test(sp.lab) ? sp.lab : '';
  const hasFilters = Boolean(
    fAno || fMes || fPaciente || fTratamento || fMedico || fLab,
  );

  const procFilter: Record<string, unknown> = {
    clinicId: clinic._id,
    status: 'completed',
    invoiceId: null,
  };
  const range = executedRange(fAno, fMes, fDia, currentYear);
  if (range) procFilter.executedAt = { $gte: range.start, $lt: range.end };
  if (fTratamento) {
    procFilter.nameSnapshot = { $regex: escapeRe(fTratamento), $options: 'i' };
  }
  if (fMedico) procFilter.doctorId = fMedico;

  // Paciente (nome, n.º de processo, telemóvel, NIF…) e laboratório
  // resolvem-se para listas de pacientes; os dois juntos = interseção
  let patientIdFilter: string[] | null = null;
  if (fPaciente) {
    const or = patientSearchOr(fPaciente);
    const found = or.length
      ? await Patient.find({ $or: or }).select('_id').limit(2000).lean()
      : [];
    patientIdFilter = found.map(p => String(p._id));
  }
  if (fLab) {
    const withLab = (
      await LabCase.distinct('patientId', {
        clinicId: clinic._id,
        supplierId: fLab,
        status: { $ne: 'cancelled' },
      })
    ).map(String);
    patientIdFilter = patientIdFilter
      ? patientIdFilter.filter(id => withLab.includes(id))
      : withLab;
  }
  if (patientIdFilter) procFilter.patientId = { $in: patientIdFilter };

  const [pendingProcs, todayInvoices, filterDoctors, filterLabs] =
    await Promise.all([
    Procedure.find(procFilter)
      .sort({ executedAt: 1 })
      .lean(),
    Invoice.find({
      clinicId: clinic._id,
      paidAt: { $gte: lisbonToUtc(today, 0), $lt: lisbonToUtc(today, 24 * 60) },
    })
      .sort({ paidAt: -1 })
      .lean(),
    Doctor.find({ active: true }).select('name').sort({ name: 1 }).lean(),
    Supplier.find({ isLab: true }).select('name').sort({ name: 1 }).lean(),
  ]);

  const patientIds = [
    ...new Set([
      ...pendingProcs.map(p => String(p.patientId)),
      ...todayInvoices.map(i => String(i.patientId)),
    ]),
  ];
  const doctorIds = [...new Set(pendingProcs.map(p => String(p.doctorId)))];
  const [patients, doctors] = await Promise.all([
    patientIds.length
      ? Patient.find({ _id: { $in: patientIds } })
          .select('name processNumber nif')
          .lean()
      : [],
    doctorIds.length
      ? Doctor.find({ _id: { $in: doctorIds } })
          .select('name')
          .lean()
      : [],
  ]);
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));

  // Agrupar a fila por paciente
  const queue = new Map<string, typeof pendingProcs>();
  for (const p of pendingProcs) {
    const key = String(p.patientId);
    if (!queue.has(key)) queue.set(key, []);
    queue.get(key)!.push(p);
  }
  const queueTotalCents = pendingProcs.reduce((s, p) => s + p.priceCents, 0);
  // Sem filtros a fila inteira não cabe no ecrã: mostram-se os primeiros
  // (os mais antigos por cobrar) e pede-se para filtrar
  const queueEntries = [...queue.entries()];
  const shownEntries = queueEntries.slice(0, MAX_CARDS);
  const hiddenCount = queueEntries.length - shownEntries.length;
  const todayTotalCents = todayInvoices.reduce((s, i) => s + i.totalCents, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho + seletor de clínica */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
            Cobranças
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {queue.size} paciente{queue.size === 1 ? '' : 's'} por cobrar ·{' '}
            {formatCents(queueTotalCents)}
            {hasFilters ? ' · com os filtros aplicados' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {clinics.map(c => {
            const active = c.slug === clinic.slug;
            return (
              <Link
                key={c.slug}
                href={`/admin/cobranca?clinic=${c.slug}`}
                style={{
                  borderRadius: '10px',
                  border: '1px solid #D8DEEF',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  backgroundColor: active ? '#2743A6' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#1B2A6B',
                }}
              >
                {clinicLabel(c)}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 6.ª ronda/10: filtros de pesquisa */}
      <form
        method='get'
        action='/admin/cobranca'
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '10px',
          alignItems: 'end',
        }}
      >
        <input type='hidden' name='clinic' value={clinic.slug} />
        <label style={filterLabel}>
          Ano
          <select name='ano' defaultValue={fAno ?? ''} style={filterField}>
            <option value=''>Todos</option>
            {Array.from({ length: 8 }, (_, i) => currentYear - i).map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabel}>
          Mês
          <select name='mes' defaultValue={fMes ?? ''} style={filterField}>
            <option value=''>Todos</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabel}>
          Dia
          <select name='dia' defaultValue={fDia ?? ''} style={filterField}>
            <option value=''>Todos</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabel}>
          Paciente
          <input
            type='search'
            name='paciente'
            defaultValue={fPaciente}
            placeholder='Nome, n.º processo, telemóvel, NIF'
            style={filterField}
          />
        </label>
        <label style={filterLabel}>
          Tratamento
          <input
            type='search'
            name='tratamento'
            defaultValue={fTratamento}
            placeholder='Ex.: destartarização'
            style={filterField}
          />
        </label>
        <label style={filterLabel}>
          Médico
          <select name='medico' defaultValue={fMedico} style={filterField}>
            <option value=''>Todos</option>
            {filterDoctors.map(d => (
              <option key={String(d._id)} value={String(d._id)}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabel}>
          Laboratório
          <select name='lab' defaultValue={fLab} style={filterField}>
            <option value=''>Todos</option>
            {filterLabs.map(l => (
              <option key={String(l._id)} value={String(l._id)}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type='submit'
            style={{
              ...filterField,
              backgroundColor: '#2743A6',
              borderColor: '#2743A6',
              color: '#FFFFFF',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Filtrar
          </button>
          {hasFilters && (
            <Link
              href={`/admin/cobranca?clinic=${clinic.slug}`}
              style={{ fontSize: '13px', fontWeight: 600, color: '#2743A6' }}
            >
              Limpar
            </Link>
          )}
        </div>
      </form>
      {fMes && !fAno && (
        <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
          Mês sem ano escolhido: a mostrar {MONTHS[fMes - 1]} de {currentYear}.
        </p>
      )}

      {/* Fila de cobrança */}
      {queue.size === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '28px',
            fontSize: '14px',
            color: '#6A7186',
          }}
        >
          {hasFilters
            ? 'Nenhum valor por cobrar corresponde aos filtros.'
            : 'Sem valores por cobrar nesta clínica. 🎉'}
        </div>
      ) : (
        shownEntries.map(([patientId, procs]) => {
          const patient = patientById.get(patientId);
          const subtotal = procs.reduce((s, p) => s + p.priceCents, 0);
          const acts: BillableAct[] = procs.map(p => ({
            id: String(p._id),
            name:
              p.nameSnapshot +
              (p.toothNumbers?.length
                ? ` (dentes ${p.toothNumbers.join(', ')})`
                : ''),
            priceCents: p.priceCents,
            executedAtLabel: p.executedAt ? lisbonDateTime(p.executedAt) : '—',
            doctorName: doctorName.get(String(p.doctorId)) ?? '—',
          }));
          return (
            <div
              key={patientId}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EEF1F8',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '13px 20px',
                  borderBottom: '1px solid #EEF1F8',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#1B2A6B',
                    }}
                  >
                    {patient ? (
                      <Link
                        href={`/admin/pacientes/${patientId}`}
                        style={{ color: '#1B2A6B', textDecoration: 'none' }}
                      >
                        {patient.name}
                      </Link>
                    ) : (
                      '(paciente removido)'
                    )}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6A7186',
                      }}
                    >
                      Proc. {patient ? processLabel(patient.processNumber) : '—'}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '12px',
                      color: '#6A7186',
                    }}
                  >
                    {procs.length} ato{procs.length === 1 ? '' : 's'} ·{' '}
                    <strong style={{ color: '#1B2A6B' }}>
                      {formatCents(subtotal)}
                    </strong>
                  </p>
                </div>
                <CheckoutModal
                  clinicId={String(clinic._id)}
                  patientId={patientId}
                  patientName={patient?.name ?? '—'}
                  patientNif={(patient?.nif as string | null) ?? null}
                  acts={acts}
                />
              </div>
              <div>
                {acts.map(a => (
                  <div
                    key={a.id}
                    className='cdc-line'
                    style={{
                      padding: '8px 20px',
                      borderBottom: '1px solid #F4F6FB',
                      fontSize: '13px',
                    }}
                  >
                    <div className='cdc-line-main'>
                      <span
                        style={{
                          display: 'block',
                          color: '#1B2A6B',
                          fontWeight: 600,
                        }}
                      >
                        {a.name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          color: '#6A7186',
                          fontSize: '12px',
                        }}
                      >
                        {a.executedAtLabel} · {a.doctorName}
                      </span>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: '#1B2A6B',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatCents(a.priceCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
      {hiddenCount > 0 && (
        <div
          style={{
            backgroundColor: '#FFF9EC',
            border: '1px solid #F0DCB0',
            borderRadius: '14px',
            padding: '14px 20px',
            fontSize: '13px',
            color: '#6B4E00',
          }}
        >
          A mostrar os {shownEntries.length} pacientes com atos mais antigos
          por cobrar. Há mais <strong>{hiddenCount}</strong> — use os filtros
          acima (paciente, médico, data…) para os encontrar.
        </div>
      )}

      {/* Cobranças de hoje */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
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
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
            Cobranças de hoje
          </span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B2A6B' }}>
            {formatCents(todayTotalCents)}
          </span>
        </div>
        {todayInvoices.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '18px 20px',
              fontSize: '13px',
              color: '#6A7186',
            }}
          >
            Ainda sem cobranças hoje.
          </p>
        ) : (
          todayInvoices.map(inv => {
            const p = patientById.get(String(inv.patientId));
            return (
              <div
                key={String(inv._id)}
                className='cdc-line'
                style={{
                  padding: '10px 20px',
                  borderBottom: '1px solid #F4F6FB',
                  fontSize: '13px',
                }}
              >
                <div className='cdc-line-main'>
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      color: '#1B2A6B',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p?.name ?? '—'}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      color: '#6A7186',
                      fontSize: '12px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inv.paidAt ? lisbonDateTime(inv.paidAt) : '—'} ·{' '}
                    {PAYMENT_METHOD_LABEL[inv.paymentMethod as PaymentMethod] ??
                      inv.paymentMethod}
                    {inv.status === 'awaiting-emission' && (
                      <span style={{ color: '#8A5A00', fontWeight: 600 }}>
                        {' '}
                        · aguarda emissão (Moloni)
                      </span>
                    )}
                  </span>
                </div>
                <div className='cdc-line-meta'>
                  <span
                    style={{
                      fontWeight: 700,
                      color: '#1B2A6B',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCents(inv.totalCents)}
                  </span>
                  <Link
                    href={`/admin/faturacao/${String(inv._id)}`}
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#2743A6',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ver fatura
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
