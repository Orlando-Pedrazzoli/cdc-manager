// 📄 src/components/pacientes/PatientForm.tsx
// =============================================================================
// CDC Manager — Pacientes: formulário partilhado (criar + editar)
// -----------------------------------------------------------------------------
// Um único formulário para os dois modos:
//   create → createPatientAction; sucesso navega para a ficha nova
//   edit   → updatePatientAction.bind(patientId); sucesso mostra toast
//
// Casos especiais tratados:
//   - warning da action (ex.: telefone já existe noutra ficha) → toast de
//     aviso, SEM bloquear o fluxo (é informação, não erro)
//   - manualCode (email do convite falhou) → modal com o código CDC-XXXX-XXXX
//     em destaque + botão copiar, para a receção enviar por WhatsApp;
//     só navega para a ficha DEPOIS de fechado (o código não se perde)
//   - consents RGPD: desmarcar não revoga (semântica da action) — o help
//     text explica; a revogação formal terá fluxo próprio
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy } from 'lucide-react';
import {
  createPatientAction,
  updatePatientAction,
  type PatientFormState,
} from '@/actions/patients';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

// Valores iniciais (modo edit) — datas já serializadas para o input
export interface PatientFormInitial {
  name: string;
  birthDate: string; // 'YYYY-MM-DD' ou ''
  nif: string;
  phone: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  profession: string;
  preferredChannel: string;
  preferredDoctorId: string;
  notes: string;
  hasConsentData: boolean;
  hasConsentReminders: boolean;
  hasConsentMarketing: boolean;
}

const EMPTY: PatientFormInitial = {
  name: '',
  birthDate: '',
  nif: '',
  phone: '',
  email: '',
  street: '',
  postalCode: '',
  city: '',
  profession: '',
  preferredChannel: 'whatsapp',
  preferredDoctorId: '',
  notes: '',
  hasConsentData: false,
  hasConsentReminders: false,
  hasConsentMarketing: false,
};

const sectionTitle = {
  margin: '0 0 4px',
  fontSize: '13px',
  fontWeight: 700 as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: '#6A7186',
};

const grid2 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
};

export function PatientForm({
  mode,
  patientId,
  initial,
  doctors,
}: {
  mode: 'create' | 'edit';
  patientId?: string; // obrigatório em edit
  initial?: PatientFormInitial;
  doctors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const values = initial ?? EMPTY;

  const action =
    mode === 'edit' && patientId
      ? updatePatientAction.bind(null, patientId)
      : createPatientAction;

  const [state, formAction, pending] = useActionState<
    PatientFormState,
    FormData
  >(action, undefined);

  // Modal do código manual (email do convite falhou)
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  const handledState = useRef<PatientFormState>(undefined);

  useEffect(() => {
    if (!state || state === handledState.current) return;
    handledState.current = state;

    if ('error' in state) return; // o erro é mostrado inline no formulário

    if (state.warning) toast(state.warning, { icon: '⚠️', duration: 6000 });

    if (state.manualCode) {
      // Segurar a navegação até a receção copiar o código
      setManualCode(state.manualCode);
      setPendingNavId(state.patientId);
      return;
    }

    if (mode === 'create') {
      toast.success(`Paciente criado (processo nº ${state.processNumber})`);
      router.push(`/admin/pacientes/${state.patientId}`);
    } else {
      toast.success('Ficha atualizada.');
      router.refresh();
    }
  }, [state, mode, router]);

  const closeManualCode = () => {
    const navId = pendingNavId;
    setManualCode(null);
    setPendingNavId(null);
    if (mode === 'create' && navId) {
      router.push(`/admin/pacientes/${navId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <>
      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        {/* --- Identificação -------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Identificação</h3>
          <div style={grid2}>
            <Input
              id='name'
              name='name'
              label='Nome completo *'
              required
              minLength={3}
              maxLength={160}
              defaultValue={values.name}
              placeholder='Maria da Silva'
            />
            <Input
              id='birthDate'
              name='birthDate'
              label='Data de nascimento'
              type='date'
              defaultValue={values.birthDate}
            />
            <Input
              id='nif'
              name='nif'
              label='NIF'
              inputMode='numeric'
              maxLength={9}
              defaultValue={values.nif}
              placeholder='9 dígitos'
              help='Vai nas faturas para dedução no IRS'
            />
            <Input
              id='profession'
              name='profession'
              label='Profissão'
              maxLength={100}
              defaultValue={values.profession}
            />
          </div>
        </section>

        {/* --- Contactos ------------------------------------------------------ */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Contactos</h3>
          <div style={grid2}>
            <Input
              id='phone'
              name='phone'
              label='Telemóvel'
              type='tel'
              defaultValue={values.phone}
              placeholder='912 345 678 ou +351...'
              help='Usado para confirmações e lembretes WhatsApp'
            />
            <Input
              id='email'
              name='email'
              label='Email'
              type='email'
              defaultValue={values.email}
              placeholder='paciente@exemplo.pt'
            />
          </div>
          <div style={grid2}>
            <Input
              id='street'
              name='street'
              label='Morada'
              maxLength={200}
              defaultValue={values.street}
            />
            <Input
              id='postalCode'
              name='postalCode'
              label='Código postal'
              maxLength={8}
              defaultValue={values.postalCode}
              placeholder='0000-000'
            />
            <Input
              id='city'
              name='city'
              label='Localidade'
              maxLength={100}
              defaultValue={values.city}
            />
          </div>
        </section>

        {/* --- Preferências --------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Preferências</h3>
          <div style={grid2}>
            <Select
              id='preferredChannel'
              name='preferredChannel'
              label='Canal preferido de contacto'
              defaultValue={values.preferredChannel}
            >
              <option value='whatsapp'>WhatsApp</option>
              <option value='sms'>SMS</option>
              <option value='email'>Email</option>
              <option value='phone'>Chamada telefónica</option>
            </Select>
            <Select
              id='preferredDoctorId'
              name='preferredDoctorId'
              label='Médico habitual'
              defaultValue={values.preferredDoctorId}
            >
              <option value=''>— Sem preferência —</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            id='notes'
            name='notes'
            label='Notas administrativas'
            maxLength={2000}
            defaultValue={values.notes}
            help='Visível à receção (ex.: “faturar em nome do pai”). Alertas clínicos vão na anamnese.'
          />
        </section>

        {/* --- RGPD ----------------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <h3 style={sectionTitle}>Consentimentos (RGPD)</h3>
          <Checkbox
            id='consentDataProcessing'
            name='consentDataProcessing'
            label='Tratamento de dados pessoais e de saúde'
            defaultChecked={values.hasConsentData}
            help='Necessário para a prestação de cuidados. Desmarcar não revoga — a revogação formal é feita na ficha.'
          />
          <Checkbox
            id='consentReminders'
            name='consentReminders'
            label='Lembretes e confirmações de consulta'
            defaultChecked={values.hasConsentReminders}
          />
          <Checkbox
            id='consentMarketing'
            name='consentMarketing'
            label='Recalls e comunicações da clínica'
            defaultChecked={values.hasConsentMarketing}
          />
        </section>

        {/* --- Portal (só na criação) ----------------------------------------- */}
        {mode === 'create' && (
          <section
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <h3 style={sectionTitle}>Portal do paciente</h3>
            <Checkbox
              id='sendActivationInvite'
              name='sendActivationInvite'
              label='Enviar convite de ativação do portal por email'
              help='Requer o email preenchido. O paciente recebe um código para criar a password.'
            />
          </section>
        )}

        {/* Erro da action */}
        {state && 'error' in state && (
          <p
            style={{
              margin: 0,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '14px',
              backgroundColor: '#FDEDED',
              color: '#B3261E',
            }}
          >
            {state.error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button type='submit' loading={pending}>
            {mode === 'create' ? 'Criar paciente' : 'Guardar alterações'}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {/* Modal: código de ativação para envio manual */}
      <Modal
        open={manualCode !== null}
        onClose={closeManualCode}
        title='Enviar código manualmente'
        footer={<Button onClick={closeManualCode}>Continuar</Button>}
      >
        <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#3A3F4A' }}>
          O email do convite não foi entregue. Envie este código ao paciente
          (por WhatsApp, por exemplo) — é válido durante 7 dias e de uso único:
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            backgroundColor: '#F4F6FB',
            border: '1px solid #D8DEEF',
            borderRadius: '10px',
            padding: '14px 16px',
          }}
        >
          <code
            style={{
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '2px',
              color: '#1B2A6B',
            }}
          >
            {manualCode}
          </code>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              if (manualCode) {
                navigator.clipboard.writeText(manualCode);
                toast.success('Código copiado.');
              }
            }}
          >
            <Copy size={14} style={{ marginRight: 4 }} />
            Copiar
          </Button>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: '13px', color: '#6A7186' }}>
          O paciente ativa a conta em <strong>/ativar</strong> com o email e
          este código.
        </p>
      </Modal>
    </>
  );
}
