// 📄 src/app/admin/pacientes/[id]/odontograma/page.tsx
// =============================================================================
// CDC Manager — Admin: Odontograma do paciente (SÓ LEITURA)
// -----------------------------------------------------------------------------
// Redesenho pós-demo 09/09/2026: o odontograma só existia na área do médico
// (com RBAC de relação médico↔paciente) — para o admin/direção era
// invisível. Esta página dá VISIBILIDADE total à gestão sem tocar na regra
// clínica: readOnly SEMPRE — o registo clínico é do corpo clínico, o admin
// consulta mas nunca edita (mesma filosofia never-delete do resto do
// sistema). Histórico de versões navegável (?v=N), como na área do médico.
// RBAC de rota: /admin → admin + receptionist (middleware).
// =============================================================================

import Link from 'next/link';
import { ArrowLeft, History, Eye } from 'lucide-react';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Odontogram from '@/models/Odontogram';
import { Odontograma } from '@/components/clinico/Odontograma';
import type { ToothEntry } from '@/components/clinico/ToothDetail';
import type { ToothStatus, FaceCondition, ToothFace } from '@/lib/domain';

export const dynamic = 'force-dynamic';

function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
        href='/admin/pacientes'
        style={{ color: '#2743A6', fontWeight: 600 }}
      >
        Voltar aos pacientes
      </Link>
    </div>
  );
}

export default async function AdminOdontogramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return <NotFound />;

  await dbConnect();
  const [patient, versions] = await Promise.all([
    Patient.findById(id).select('name processNumber').lean(),
    Odontogram.find({ patientId: id })
      .select('version createdAt updatedBy')
      .sort({ version: -1 })
      .lean(),
  ]);
  if (!patient) return <NotFound />;

  const latestVersion = versions[0]?.version ?? 0;
  const requested = Number(v);
  const showVersion =
    Number.isInteger(requested) && requested >= 1 && requested <= latestVersion
      ? requested
      : latestVersion;

  const doc =
    showVersion > 0
      ? await Odontogram.findOne({ patientId: id, version: showVersion }).lean()
      : null;

  const updaterIds = [...new Set(versions.map(x => String(x.updatedBy)))];
  const updaters = updaterIds.length
    ? await Doctor.find({ _id: { $in: updaterIds } })
        .select('name')
        .lean()
    : [];
  const updaterName = new Map(updaters.map(d => [String(d._id), d.name]));

  const initialTeeth: ToothEntry[] = (doc?.teeth ?? []).map(t => ({
    number: t.number,
    status: (t.status ?? 'present') as ToothStatus,
    faces: (t.faces ?? []).map(f => ({
      face: f.face as ToothFace,
      condition: f.condition as FaceCondition,
    })),
    note: (t.note as string | null) ?? null,
  }));

  const versionLabel = doc
    ? `Versão ${doc.version}${
        showVersion < latestVersion ? ' (antiga)' : ''
      } · ${doc.createdAt ? lisbonDateTime(doc.createdAt) : '—'} · ${
        updaterName.get(String(doc.updatedBy)) ?? 'Médico'
      }`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link
        href={`/admin/pacientes/${id}`}
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
          Odontograma
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

        {/* Histórico de versões */}
        {versions.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <History size={14} style={{ color: '#6A7186' }} />
            {versions.map(x => {
              const active = x.version === showVersion;
              return (
                <Link
                  key={x.version}
                  href={`/admin/pacientes/${id}/odontograma?v=${x.version}`}
                  title={`${x.createdAt ? lisbonDateTime(x.createdAt) : ''} · ${updaterName.get(String(x.updatedBy)) ?? ''}`}
                  style={{
                    borderRadius: '999px',
                    padding: '3px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    backgroundColor: active ? '#2743A6' : '#E4EBFF',
                    color: active ? '#FFFFFF' : '#1B2A6B',
                  }}
                >
                  v{x.version}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Aviso permanente: consulta sem edição */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#E8EEFF',
          border: '1px solid #C9D6F5',
          borderRadius: '10px',
          padding: '10px 16px',
          fontSize: '13px',
          color: '#1B2A6B',
        }}
      >
        <Eye size={15} />
        Vista de consulta (só leitura). A edição do odontograma é exclusiva do
        corpo clínico, na área do médico.
      </div>

      {latestVersion === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '24px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#6A7186',
            border: '1px dashed #D8DEEF',
            borderRadius: '12px',
            backgroundColor: '#FFFFFF',
          }}
        >
          Este paciente ainda não tem odontograma registado.
        </p>
      ) : (
        <Odontograma
          key={showVersion}
          patientId={id}
          initialTeeth={initialTeeth}
          versionLabel={versionLabel}
          readOnly
        />
      )}
    </div>
  );
}
