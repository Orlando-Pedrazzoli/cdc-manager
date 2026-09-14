// 📄 src/app/conta/anamnese/page.tsx
// =============================================================================
// CDC Manager — Portal do paciente: Ficha de anamnese (Fase 3B, P10/E19)
// -----------------------------------------------------------------------------
// "Anamnese na área dele, para que ele preencha e o médico tenha acesso."
// O paciente preenche (ou renova) a ficha antes da consulta; fica "por
// validar" até o médico a rever. patientId SEMPRE da sessão. Não expõe
// nada do registo clínico do médico (alergias/notas/observações privadas).
// =============================================================================

import { auth } from '@/lib/auth';
import { dbConnect } from '@/lib/mongodb';
import Patient from '@/models/Patient';
import ClinicalRecord from '@/models/ClinicalRecord';
import { AnamnesisQuestionnaire } from '@/components/clinico/AnamnesisQuestionnaire';
import { AnamnesisStatusBanner } from '@/components/clinico/AnamnesisStatusBanner';
import type { QuestionnaireData } from '@/lib/anamnesis';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'A minha ficha de anamnese' };

export default async function PortalAnamnesePage() {
  const session = await auth();
  const patientId = session?.user?.patientId;
  if (!patientId) return null;

  await dbConnect();
  const [patient, record] = await Promise.all([
    Patient.findById(patientId).select('name birthDate').lean(),
    ClinicalRecord.findOne({ patientId }).select('questionnaire').lean(),
  ]);
  if (!patient) return null;

  let isMinor = false;
  if (patient.birthDate) {
    const b = new Date(patient.birthDate);
    const n = new Date();
    let age = n.getFullYear() - b.getFullYear();
    const m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
    isMinor = age < 18;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Ficha de anamnese
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
          Para o atendermos em segurança precisamos de conhecer a sua saúde.
          Preencha com calma; o seu médico valida a ficha na consulta. É
          renovada uma vez por ano.
        </p>
      </div>

      <AnamnesisStatusBanner
        questionnaire={record?.questionnaire ?? null}
        showOk
      />

      <AnamnesisQuestionnaire
        mode='patient'
        initial={
          (record?.questionnaire?.data as QuestionnaireData | null) ?? null
        }
        isMinor={isMinor}
      />
    </div>
  );
}