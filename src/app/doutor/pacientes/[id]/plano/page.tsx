// 📄 src/app/doutor/pacientes/[id]/plano/page.tsx
// =============================================================================
// CDC Manager — Médico: Planos de tratamento do paciente
// -----------------------------------------------------------------------------
// Server Component. Lista os planos (mais recente primeiro) com itens,
// totais e ações de ciclo de vida por estado. ?novo=1 abre o editor de
// criação. A execução é POR ITEM (fase a fase) — cada execução congela a
// comissão e entrega o ato à cobrança (Sprint 4).
// RBAC: relação médico↔paciente, como no resto da ficha.
// =============================================================================

import Link from 'next/link';
import { ArrowLeft, FilePlus2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import TreatmentPlan from '@/models/TreatmentPlan';
import Procedure from '@/models/Procedure';
import { getActiveClinics } from '@/models/Clinic';
import { formatCents } from '@/lib/commissions';
import {
  PlanEditor,
  PlanLifecycleButtons,
  ExecuteItemButton,
} from '@/components/clinico/PlanEditor';

export const dynamic = 'force-dynamic';

const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  proposed: 'Proposto',
  approved: 'Aprovado',
  'in-progress': 'Em execução',
  completed: 'Concluído',
  declined: 'Recusado',
  expired: 'Expirado',
};

const PLAN_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#EAECF3', fg: '#3D4257' },
  proposed: { bg: '#FFF4DE', fg: '#8A5A00' },
  approved: { bg: '#E0F5EA', fg: '#0F7B4D' },
  'in-progress': { bg: '#E4EBFF', fg: '#2743A6' },
  completed: { bg: '#1B2A6B', fg: '#FFFFFF' },
  declined: { bg: '#F6E4E3', fg: '#B3261E' },
  expired: { bg: '#F6E4E3', fg: '#B3261E' },
};

function lisbonDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(d);
}

function NotFound() {
  return (
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
      Paciente não encontrado.{' '}
      <Link
        href='/doutor/pacientes'
        style={{ color: '#2743A6', fontWeight: 600 }}
      >
        Voltar aos meus pacientes
      </Link>
    </div>
  );
}

export default async function PatientPlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const { id } = await params;
  const { novo } = await searchParams;
  const creating = novo === '1';

  const session = await auth();
  const doctorId = session?.user?.doctorId;
  if (!doctorId || !/^[0-9a-fA-F]{24}$/.test(id)) return <NotFound />;

  await dbConnect();
  const hasRelation = await Appointment.exists({ doctorId, patientId: id });
  if (!hasRelation) return <NotFound />;

  const [patient, plans, treatments, clinics] = await Promise.all([
    Patient.findById(id).select('name processNumber').lean(),
    TreatmentPlan.find({ patientId: id }).sort({ createdAt: -1 }).lean(),
    TreatmentType.find({ active: true })
      .select('name priceCents')
      .sort({ name: 1 })
      .lean(),
    getActiveClinics(),
  ]);
  if (!patient) return <NotFound />;

  // Estado de execução dos itens (procedures ligados)
  const procIds = plans
    .flatMap(p => p.items.map(i => i.procedureId))
    .filter(Boolean)
    .map(String);
  const procs = procIds.length
    ? await Procedure.find({ _id: { $in: procIds } })
        .select('status executedAt')
        .lean()
    : [];
  const procById = new Map(procs.map(p => [String(p._id), p]));
  const clinicName = new Map(clinics.map(c => [String(c._id), c.name]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link
        href={`/doutor/pacientes/${id}`}
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
        Ficha de {patient.name}
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Planos de tratamento
          <span
            style={{
              marginLeft: 10,
              fontSize: '13px',
              fontWeight: 500,
              color: '#6A7186',
            }}
          >
            {patient.name} · Proc. {String(patient.processNumber ?? '—')}
          </span>
        </h1>
        {!creating && (
          <Link href={`/doutor/pacientes/${id}/plano?novo=1`}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '10px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#2743A6',
                color: '#FFFFFF',
              }}
            >
              <FilePlus2 size={15} />
              Novo plano
            </span>
          </Link>
        )}
      </div>

      {creating ? (
        <PlanEditor
          patientId={id}
          treatments={treatments.map(t => ({
            id: String(t._id),
            name: t.name,
            priceCents: t.priceCents,
          }))}
          clinics={clinics.map(c => ({ id: String(c._id), name: c.name }))}
        />
      ) : plans.length === 0 ? (
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
          Sem planos de tratamento. Crie o primeiro com o botão acima.
        </div>
      ) : (
        plans.map(plan => {
          const st = PLAN_STATUS_STYLE[plan.status] ?? PLAN_STATUS_STYLE.draft;
          const finalCents = Math.max(
            plan.totalCents - (plan.discountCents ?? 0),
            0,
          );
          const executable = ['approved', 'in-progress'].includes(plan.status);
          const items = [...plan.items].sort(
            (a, b) => (a.phase ?? 1) - (b.phase ?? 1),
          );

          return (
            <div
              key={String(plan._id)}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EEF1F8',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              {/* Cabeçalho do plano */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '14px 20px',
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
                    {plan.title}
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '12px',
                      color: '#6A7186',
                    }}
                  >
                    {clinicName.get(String(plan.clinicId)) ?? '—'} · criado{' '}
                    {plan.createdAt ? lisbonDate(plan.createdAt) : '—'}
                    {plan.validUntil && plan.status === 'proposed'
                      ? ` · válido até ${lisbonDate(plan.validUntil)}`
                      : ''}
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '3px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: st.bg,
                      color: st.fg,
                    }}
                  >
                    {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
                  </span>
                  <PlanLifecycleButtons
                    planId={String(plan._id)}
                    status={plan.status}
                  />
                </div>
              </div>

              {/* Itens */}
              <div>
                {items.map(item => {
                  const proc = item.procedureId
                    ? procById.get(String(item.procedureId))
                    : null;
                  const executed =
                    proc?.status === 'completed' || proc?.status === 'invoiced';
                  return (
                    <div
                      key={String(item._id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '10px 20px',
                        borderBottom: '1px solid #F4F6FB',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#6A7186',
                          backgroundColor: '#F4F6FB',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Fase {item.phase ?? 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#1B2A6B',
                          }}
                        >
                          {item.nameSnapshot}
                          {item.toothNumbers.length > 0 && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#6A7186',
                              }}
                            >
                              Dentes {item.toothNumbers.join(', ')}
                            </span>
                          )}
                        </p>
                        {executed && proc?.executedAt && (
                          <p
                            style={{
                              margin: '1px 0 0',
                              fontSize: '11px',
                              color: '#0F7B4D',
                            }}
                          >
                            ✓ Executado a {lisbonDate(proc.executedAt)}
                          </p>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#1B2A6B',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatCents(item.priceCents)}
                      </span>
                      {executable &&
                        proc?.status === 'planned' &&
                        item.procedureId && (
                          <ExecuteItemButton
                            procedureId={String(item.procedureId)}
                          />
                        )}
                    </div>
                  );
                })}
              </div>

              {/* Rodapé: totais */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '16px',
                  padding: '12px 20px',
                  backgroundColor: '#F9FAFD',
                  fontSize: '13px',
                  color: '#3D4257',
                }}
              >
                <span>
                  Total: <strong>{formatCents(plan.totalCents)}</strong>
                </span>
                {(plan.discountCents ?? 0) > 0 && (
                  <>
                    <span style={{ color: '#0F7B4D' }}>
                      Desconto: −{formatCents(plan.discountCents)}
                    </span>
                    <span>
                      A pagar:{' '}
                      <strong style={{ color: '#1B2A6B' }}>
                        {formatCents(finalCents)}
                      </strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
