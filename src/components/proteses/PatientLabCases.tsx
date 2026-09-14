// 📄 src/components/proteses/PatientLabCases.tsx
// =============================================================================
// CDC Manager — Ficha do paciente: separador "Laboratórios" (E3 "drill down")
// -----------------------------------------------------------------------------
// Server component: lista os pedidos a laboratórios/entidades externas deste
// paciente (trabalho, laboratório, enviado, retorno previsto, estado, médico)
// com o botão "Novo pedido a laboratório" (paciente fixo). Usado pela ficha
// do admin/receção (com ações) e pela do médico (só leitura + criar).
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import LabCase from '@/models/LabCase';
import Supplier from '@/models/Supplier';
import Doctor from '@/models/Doctor';
import { getActiveClinics } from '@/models/Clinic';
import {
  LAB_WORK_TYPE_LABEL,
  LAB_CASE_STATUS_LABEL,
  type LabWorkType,
  type LabCaseStatus,
} from '@/lib/domain';
import { LabCaseToolbar } from '@/components/proteses/NewLabCaseModal';
import { LabCaseRowActions } from '@/components/proteses/LabCaseRowActions';

const STATUS_BADGE: Record<LabCaseStatus, { bg: string; fg: string }> = {
  sent: { bg: '#E8EEFF', fg: '#2743A6' },
  received: { bg: '#E7F6EC', fg: '#1B7A3D' },
  delivered: { bg: '#EEF0F4', fg: '#3A3F4A' },
  cancelled: { bg: '#FDEDED', fg: '#B3261E' },
};
const ptDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);

export async function PatientLabCases({
  patientId,
  patientLabel,
  mode,
}: {
  patientId: string;
  patientLabel: string;
  /** staff: ações de receber/nova data/cancelar; doctor: só criar */
  mode: 'staff' | 'doctor';
}) {
  await dbConnect();
  const [cases, clinics, doctors, labs] = await Promise.all([
    LabCase.find({ patientId }).sort({ createdAt: -1 }).lean(),
    getActiveClinics(),
    Doctor.find({ active: true }).select('name').sort({ name: 1 }).lean(),
    Supplier.find({ isLab: true, active: true })
      .select('name defaultLeadDays')
      .sort({ name: 1 })
      .lean(),
  ]);
  const doctorById = new Map(doctors.map(d => [String(d._id), d.name]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1B2A6B',
    borderBottom: '1px solid #F4F6FB',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#6A7186' }}>
          Trabalhos pedidos a terceiros para este paciente — protésico,
          alinhadores, biópsias, exames. O retorno previsto aparece na agenda
          desse dia e no dashboard.
        </p>
        <LabCaseToolbar
          clinics={clinics.map(c => ({ id: String(c._id), name: c.name }))}
          doctors={doctors.map(d => ({ id: String(d._id), name: d.name }))}
          labs={labs.map(l => ({
            id: String(l._id),
            name: l.name,
            defaultLeadDays: l.defaultLeadDays ?? null,
          }))}
          lockedPatient={{ id: patientId, label: patientLabel }}
          doctorMode={mode === 'doctor'}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}
        >
          <thead>
            <tr>
              <th style={th}>Trabalho</th>
              <th style={th}>Laboratório</th>
              <th style={th}>Médico</th>
              <th style={th}>Enviado</th>
              <th style={th}>Retorno previsto</th>
              <th style={th}>Estado</th>
              {mode === 'staff' && (
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              )}
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr>
                <td
                  style={{ ...td, color: '#6A7186' }}
                  colSpan={mode === 'staff' ? 7 : 6}
                >
                  Sem pedidos a laboratório para este paciente.
                </td>
              </tr>
            )}
            {cases.map(c => {
              const status = c.status as LabCaseStatus;
              const badge = STATUS_BADGE[status];
              const late =
                status === 'sent' &&
                new Date(c.dueDate).getTime() < today.getTime();
              return (
                <tr key={String(c._id)}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>
                      {LAB_WORK_TYPE_LABEL[c.workType as LabWorkType]}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6A7186' }}>
                      {[
                        c.toothNotes,
                        c.shade ? `cor ${c.shade}` : null,
                        c.notes,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td style={td}>{c.labName}</td>
                  <td style={td}>
                    {c.doctorId
                      ? (doctorById.get(String(c.doctorId)) ?? '—')
                      : '—'}
                  </td>
                  <td style={td}>{ptDate(c.sentAt as Date)}</td>
                  <td
                    style={{
                      ...td,
                      color: late ? '#B3261E' : '#1B2A6B',
                      fontWeight: late ? 700 : 400,
                    }}
                  >
                    {ptDate(c.dueDate as Date)}
                    {late ? ' · atrasado' : ''}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: badge.bg,
                        color: badge.fg,
                      }}
                    >
                      {LAB_CASE_STATUS_LABEL[status]}
                    </span>
                  </td>
                  {mode === 'staff' && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      <LabCaseRowActions id={String(c._id)} status={status} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
