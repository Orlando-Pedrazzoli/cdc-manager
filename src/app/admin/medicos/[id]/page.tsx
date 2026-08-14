// 📄 src/app/admin/medicos/[id]/page.tsx
// =============================================================================
// CDC Manager — Admin: Ficha do Médico
// -----------------------------------------------------------------------------
// Separadores por URL (?tab=), mesmo padrão da ficha do paciente:
//   dados     → DoctorForm em modo edição (inclui editor de horários)
//   excecoes  → férias e dias especiais (DoctorExceptions)
//   comissoes → overrides por ato (CommissionEditor)
// =============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import TreatmentType from '@/models/TreatmentType';
import { getActiveClinics } from '@/models/Clinic';
import { Badge } from '@/components/ui/Badge';
import {
  DoctorForm,
  type DoctorFormInitial,
} from '@/components/medicos/DoctorForm';
import {
  DoctorExceptions,
  type ExceptionRow,
} from '@/components/medicos/DoctorExceptions';
import { CommissionEditor } from '@/components/medicos/CommissionEditor';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'dados', label: 'Dados e horários' },
  { key: 'excecoes', label: 'Férias e exceções' },
  { key: 'comissoes', label: 'Comissões' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function DoctorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) notFound();
  const tab: TabKey = (
    TABS.some(t => t.key === rawTab) ? rawTab : 'dados'
  ) as TabKey;

  await dbConnect();
  const [doctor, clinicsDocs, account] = await Promise.all([
    Doctor.findById(id).lean(),
    getActiveClinics(),
    User.findOne({ doctorId: id, role: 'doctor' })
      .select('status email')
      .lean(),
  ]);
  if (!doctor) notFound();

  const clinics = clinicsDocs.map(c => ({ id: String(c._id), name: c.name }));

  const initial: DoctorFormInitial = {
    name: doctor.name,
    licenseNumber: doctor.licenseNumber ?? '',
    specialties: doctor.specialties,
    commissionPercent:
      doctor.commissionRate != null
        ? String(Math.round(doctor.commissionRate * 100))
        : '',
    color: doctor.color ?? '#2743A6',
    clinicSchedules: doctor.clinicSchedules.map(cs => ({
      clinicId: String(cs.clinicId),
      bookableOnline: cs.bookableOnline,
      weeklySchedule: cs.weeklySchedule.map(w => ({
        weekday: w.weekday,
        ranges: w.ranges.map(r => ({ start: r.start, end: r.end })),
      })),
    })),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link
        href='/admin/medicos'
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#6A7186',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={15} />
        Corpo Clínico
      </Link>

      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: '999px',
            backgroundColor: doctor.color ?? '#2743A6',
          }}
        />
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          {doctor.name}
        </h1>
        {doctor.active ? (
          <Badge variant='success'>Ativo</Badge>
        ) : (
          <Badge variant='neutral'>Inativo</Badge>
        )}
        {account?.status === 'active' ? (
          <Badge variant='success'>Conta ativa</Badge>
        ) : account?.status === 'invited' ? (
          <Badge variant='warning'>Convite pendente</Badge>
        ) : account?.status === 'disabled' ? (
          <Badge variant='neutral'>Conta desativada</Badge>
        ) : (
          <Badge variant='neutral'>Sem conta</Badge>
        )}
        {account?.email && (
          <span style={{ fontSize: '13px', color: '#6A7186' }}>
            {account.email}
          </span>
        )}
      </div>

      {/* Separadores */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid #EEF1F8',
        }}
      >
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={
                t.key === 'dados'
                  ? `/admin/medicos/${id}`
                  : `/admin/medicos/${id}?tab=${t.key}`
              }
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                color: active ? '#2743A6' : '#6A7186',
                borderBottom: active
                  ? '2px solid #2743A6'
                  : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Conteúdo */}
      {tab === 'dados' && !doctor.licenseNumber && (
        <div
          style={{
            backgroundColor: '#FFF9EC',
            border: '1px solid #F0DCB0',
            borderRadius: '12px',
            padding: '12px 20px',
            fontSize: '13px',
            color: '#8A5A00',
            maxWidth: 860,
          }}
        >
          Este profissional não tem cédula profissional registada. Será
          necessária para emitir receitas e consentimentos — preencha o campo
          abaixo.
        </div>
      )}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: tab === 'dados' ? 860 : undefined,
        }}
      >
        {tab === 'dados' && (
          <DoctorForm
            mode='edit'
            doctorId={id}
            initial={initial}
            clinics={clinics}
          />
        )}

        {tab === 'excecoes' && (
          <DoctorExceptions
            doctorId={id}
            clinics={clinics}
            exceptions={doctor.exceptions.map(
              (e): ExceptionRow => ({
                date: e.date,
                clinicId: e.clinicId ? String(e.clinicId) : null,
                type: e.type as 'unavailable' | 'custom',
                ranges: e.ranges.map(r => ({ start: r.start, end: r.end })),
                reason: e.reason ?? null,
              }),
            )}
          />
        )}

        {tab === 'comissoes' && (
          <CommissionEditor
            doctorId={id}
            basePercentLabel={
              doctor.commissionRate != null
                ? `a taxa base do profissional (${Math.round(doctor.commissionRate * 100)}%)`
                : 'o default da clínica do ato (40%)'
            }
            treatments={(
              await TreatmentType.find({ active: { $ne: false } })
                .sort({ name: 1 })
                .select('name')
                .lean()
            ).map(t => ({ id: String(t._id), name: t.name }))}
            initialOverrides={doctor.commissionOverrides.map(o => ({
              treatmentTypeId: String(o.treatmentTypeId),
              ratePercent: Math.round(o.rate * 100),
            }))}
          />
        )}
      </div>
    </div>
  );
}
