// 📄 src/app/admin/cobranca/page.tsx
// =============================================================================
// CDC Manager — Receção: Cobrança
// -----------------------------------------------------------------------------
// A fila de cobrança POR CLÍNICA (?clinic=, padrão da agenda): atos
// executados (completed) ainda sem fatura, agrupados por paciente, com
// checkout no modal. Em baixo, as cobranças de hoje da clínica.
// Servida pelo índice {clinicId, status, invoiceId, executedAt} criado
// no arranque do Sprint 3 — a fila nasceu antes do ecrã.
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Link from 'next/link';
import Procedure from '@/models/Procedure';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Invoice from '@/models/Invoice';
import { getActiveClinics } from '@/models/Clinic';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { formatCents } from '@/lib/commissions';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import {
  CheckoutModal,
  type BillableAct,
} from '@/components/cobranca/CheckoutModal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cobrança' };

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

export default async function CobrancaPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string }>;
}) {
  const { clinic: clinicParam } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  await dbConnect();
  const clinics = await getActiveClinics();
  const clinic =
    clinics.find(c => c.slug === clinicParam) ??
    clinics.find(c => c.slug === 'colombo') ??
    clinics[0];
  if (!clinic) return null;

  const today = todayLisbon();
  const [pendingProcs, todayInvoices] = await Promise.all([
    Procedure.find({
      clinicId: clinic._id,
      status: 'completed',
      invoiceId: null,
    })
      .sort({ executedAt: 1 })
      .lean(),
    Invoice.find({
      clinicId: clinic._id,
      paidAt: { $gte: lisbonToUtc(today, 0), $lt: lisbonToUtc(today, 24 * 60) },
    })
      .sort({ paidAt: -1 })
      .lean(),
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
            Cobrança
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6A7186' }}>
            {queue.size} paciente{queue.size === 1 ? '' : 's'} por cobrar ·{' '}
            {formatCents(queueTotalCents)}
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
                {c.slug.charAt(0).toUpperCase() + c.slug.slice(1)}
              </Link>
            );
          })}
        </div>
      </div>

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
          Sem valores por cobrar nesta clínica. 🎉
        </div>
      ) : (
        [...queue.entries()].map(([patientId, procs]) => {
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
                      Proc. {String(patient?.processNumber ?? '—')}
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '8px 20px',
                      borderBottom: '1px solid #F4F6FB',
                      fontSize: '13px',
                    }}
                  >
                    <span
                      style={{ flex: 1, color: '#1B2A6B', fontWeight: 600 }}
                    >
                      {a.name}
                    </span>
                    <span style={{ color: '#6A7186', fontSize: '12px' }}>
                      {a.executedAtLabel} · {a.doctorName}
                    </span>
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '10px 20px',
                  borderBottom: '1px solid #F4F6FB',
                  fontSize: '13px',
                }}
              >
                <span
                  style={{
                    color: '#6A7186',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inv.paidAt ? lisbonDateTime(inv.paidAt) : '—'}
                </span>
                <span style={{ flex: 1, fontWeight: 600, color: '#1B2A6B' }}>
                  {p?.name ?? '—'}
                </span>
                <span style={{ color: '#6A7186' }}>
                  {PAYMENT_METHOD_LABEL[inv.paymentMethod as PaymentMethod] ??
                    inv.paymentMethod}
                </span>
                {inv.status === 'awaiting-emission' && (
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: '#FFF4DE',
                      color: '#8A5A00',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Aguarda emissão (Moloni)
                  </span>
                )}
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
                  Ver →
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
