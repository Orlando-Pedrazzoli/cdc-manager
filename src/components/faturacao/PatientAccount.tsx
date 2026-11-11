// 📄 src/components/faturacao/PatientAccount.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: Conta-corrente (Fase 5C — "Extratos de
// Contas Correntes" do Dentoral). Server component: documentos do paciente
// com total, pago, em dívida, e saldo global; atos concluídos por cobrar.
//
// 4.ª ronda (Victor, nov. 2026), ponto 06: "Faturar" na própria
// conta-corrente — abre o MESMO checkout da página Cobranças, sem sair da
// ficha do paciente. Um botão por clínica quando há atos em mais de uma
// (cada documento pertence a uma clínica).
// =============================================================================

import Link from 'next/link';
import { dbConnect } from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Procedure from '@/models/Procedure';
import { formatCents } from '@/lib/commissions';
import { INVOICE_STATUS_LABEL } from '@/lib/labels';
import { Badge } from '@/components/ui/Badge';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import { clinicLabel } from '@/lib/branding';
import { CheckoutModal, type BillableAct } from '@/components/cobranca/CheckoutModal';

const ptDateTime = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d);

const ptDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);

export async function PatientAccount({
  patientId,
  canBill = true,
}: {
  patientId: string;
  /** Mostra o botão "Faturar" (receção/administração) */
  canBill?: boolean;
}) {
  await dbConnect();
  const [invoices, unbilled] = await Promise.all([
    Invoice.find({ patientId })
      .sort({ createdAt: -1 })
      .select(
        'createdAt status totalCents paidCents payments moloniDocumentNumber',
      )
      .lean(),
    Procedure.find({ patientId, status: 'completed', invoiceId: null })
      .select('nameSnapshot priceCents executedAt clinicId doctorId')
      .sort({ executedAt: 1 })
      .lean(),
  ]);

  // Atos por faturar, agrupados por clínica (um checkout por clínica)
  const billable: { clinicId: string; label: string; acts: BillableAct[] }[] = [];
  let patientInfo: { name: string; nif: string | null } | null = null;
  if (canBill && unbilled.length > 0) {
    const [patient, doctors, clinics] = await Promise.all([
      Patient.findById(patientId).select('name nif').lean(),
      Doctor.find({ _id: { $in: [...new Set(unbilled.map(p => String(p.doctorId)))] } })
        .select('name')
        .lean(),
      getActiveClinics(),
    ]);
    patientInfo = { name: patient?.name ?? '—', nif: (patient?.nif as string | null) ?? null };
    const doctorName = new Map(doctors.map(d => [String(d._id), d.name]));
    for (const p of unbilled) {
      const cid = String(p.clinicId);
      let group = billable.find(g => g.clinicId === cid);
      if (!group) {
        const clinic = clinics.find(c => String(c._id) === cid);
        group = { clinicId: cid, label: clinic ? clinicLabel(clinic) : 'Clínica', acts: [] };
        billable.push(group);
      }
      group.acts.push({
        id: String(p._id),
        name: p.nameSnapshot,
        priceCents: p.priceCents,
        executedAtLabel: p.executedAt ? ptDateTime(p.executedAt as Date) : '—',
        doctorName: doctorName.get(String(p.doctorId)) ?? '—',
      });
    }
  }
  const active = invoices.filter(i => i.status !== 'voided');
  const totalBilled = active.reduce((a, i) => a + i.totalCents, 0);
  const totalPaid = active.reduce(
    (a, i) => a + (i.paidCents ?? i.totalCents),
    0,
  );
  const due = totalBilled - totalPaid;
  const unbilledCents = unbilled.reduce((a, p) => a + p.priceCents, 0);

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6A7186',
    borderBottom: '1px solid #EEF1F8',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '9px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
  };
  const kpi = (label: string, value: string, color = '#1B2A6B') => (
    <div
      style={{
        flex: '1 1 140px',
        border: '1px solid #EEF1F8',
        borderRadius: '10px',
        padding: '10px 14px',
      }}
    >
      <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>{label}</p>
      <p
        style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color }}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpi('Faturado', formatCents(totalBilled))}
        {kpi('Pago', formatCents(totalPaid), '#0F7B4D')}
        {kpi('Em dívida', formatCents(due), due > 0 ? '#B3261E' : '#0F7B4D')}
        {kpi(
          'Por faturar (atos concluídos)',
          formatCents(unbilledCents),
          unbilledCents > 0 ? '#B26A00' : '#1B2A6B',
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Data</th>
              <th style={th}>Documento</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={{ ...th, textAlign: 'right' }}>Pago</th>
              <th style={{ ...th, textAlign: 'right' }}>Em dívida</th>
              <th style={th}>Recibos</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td style={{ ...td, color: '#6A7186' }} colSpan={7}>
                  Sem documentos.
                </td>
              </tr>
            )}
            {invoices.map(i => {
              const paid =
                i.status === 'voided' ? 0 : (i.paidCents ?? i.totalCents);
              const d = i.status === 'voided' ? 0 : i.totalCents - paid;
              return (
                <tr
                  key={String(i._id)}
                  style={{ opacity: i.status === 'voided' ? 0.55 : 1 }}
                >
                  <td style={td}>{ptDate(i.createdAt as Date)}</td>
                  <td style={td}>
                    <Link
                      href={`/admin/faturacao/${String(i._id)}`}
                      style={{
                        color: '#2743A6',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {i.moloniDocumentNumber ??
                        `Interno #${String(i._id).slice(-6).toUpperCase()}`}
                    </Link>
                  </td>
                  <td style={td}>
                    <Badge
                      variant={
                        d > 0
                          ? 'warning'
                          : i.status === 'voided'
                            ? 'danger'
                            : 'success'
                      }
                    >
                      {d > 0
                        ? 'Saldo em dívida'
                        : INVOICE_STATUS_LABEL[
                            i.status as keyof typeof INVOICE_STATUS_LABEL
                          ]}
                    </Badge>
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCents(i.totalCents)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: '#0F7B4D',
                    }}
                  >
                    {formatCents(paid)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: d > 0 ? '#B3261E' : '#9AA1B4',
                      fontWeight: d > 0 ? 700 : 400,
                    }}
                  >
                    {formatCents(d)}
                  </td>
                  <td style={{ ...td, fontSize: '12px', color: '#6A7186' }}>
                    {(i.payments ?? []).length ||
                      (i.status === 'voided' ? 0 : 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {unbilled.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: '#FFF8E8',
            border: '1px solid #F3DFA8',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px', color: '#7A4B00' }}>
            <strong>
              {unbilled.length} ato{unbilled.length === 1 ? '' : 's'} concluído
              {unbilled.length === 1 ? '' : 's'} por faturar
            </strong>{' '}
            ({formatCents(unbilledCents)})
          </p>
          {patientInfo && billable.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {billable.map(g => (
                <CheckoutModal
                  key={g.clinicId}
                  clinicId={g.clinicId}
                  patientId={patientId}
                  patientName={patientInfo.name}
                  patientNif={patientInfo.nif}
                  acts={g.acts}
                  buttonLabel={billable.length > 1 ? `Faturar · ${g.label}` : 'Faturar'}
                />
              ))}
            </div>
          ) : (
            <Link href='/admin/cobranca' style={{ fontSize: '13px', fontWeight: 600, color: '#2743A6' }}>
              Ver em Cobranças
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
