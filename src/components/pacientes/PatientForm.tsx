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

// -----------------------------------------------------------------------------
// Telefone internacional (balcão): select de indicativo + nº nacional →
// hidden input compõe o valor que o Zod normaliza para E.164 no server.
// Lista curada para a realidade do balcão de Lisboa; "Outro" aceita o
// número completo com qualquer indicativo (+...).
// -----------------------------------------------------------------------------
const DIAL_CODES: { code: string; label: string }[] = [
  { code: '+351', label: '🇵🇹 Portugal +351' },
  { code: '+55', label: '🇧🇷 Brasil +55' },
  { code: '+34', label: '🇪🇸 Espanha +34' },
  { code: '+33', label: '🇫🇷 França +33' },
  { code: '+44', label: '🇬🇧 Reino Unido +44' },
  { code: '+49', label: '🇩🇪 Alemanha +49' },
  { code: '+39', label: '🇮🇹 Itália +39' },
  { code: '+41', label: '🇨🇭 Suíça +41' },
  { code: '+352', label: '🇱🇺 Luxemburgo +352' },
  { code: '+32', label: '🇧🇪 Bélgica +32' },
  { code: '+31', label: '🇳🇱 Países Baixos +31' },
  { code: '+353', label: '🇮🇪 Irlanda +353' },
  { code: '+48', label: '🇵🇱 Polónia +48' },
  { code: '+40', label: '🇷🇴 Roménia +40' },
  { code: '+380', label: '🇺🇦 Ucrânia +380' },
  { code: '+238', label: '🇨🇻 Cabo Verde +238' },
  { code: '+244', label: '🇦🇴 Angola +244' },
  { code: '+245', label: '🇬🇼 Guiné-Bissau +245' },
  { code: '+258', label: '🇲🇿 Moçambique +258' },
  { code: '+239', label: '🇸🇹 São Tomé +239' },
  { code: '+1', label: '🇺🇸 EUA/Canadá +1' },
];

/** Decompõe um E.164 guardado em (indicativo, nacional); sem match → Outro */
function splitPhone(stored: string): { dial: string; national: string } {
  if (!stored) return { dial: '+351', national: '' };
  // indicativos mais longos primeiro (+351 antes de +35 hipotético)
  const sorted = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const { code } of sorted) {
    if (stored.startsWith(code)) {
      return { dial: code, national: stored.slice(code.length) };
    }
  }
  return { dial: 'other', national: stored };
}

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

  // Telefone internacional: indicativo + nº nacional (hidden compõe)
  const initialPhone = splitPhone(values.phone);
  const [dial, setDial] = useState<string>(initialPhone.dial);
  const [nationalNumber, setNationalNumber] = useState<string>(
    initialPhone.national,
  );
  const composedPhone =
    dial === 'other'
      ? nationalNumber.trim()
      : nationalNumber.trim()
        ? `${dial}${nationalNumber.replace(/[\s().\-]/g, '')}`
        : '';

  // Código postal → Localidade e, quando o CP7 tem UMA só artéria, também
  // a Morada (GeoAPI.pt; silencioso, nunca sobrepõe o que foi escrito).
  // Nota: ao contrário do CEP brasileiro, o CP7 nem sempre identifica a
  // rua única — nesses casos a Morada fica manual, por desenho.
  const [postalCode, setPostalCode] = useState<string>(values.postalCode);
  const [city, setCity] = useState<string>(values.city);
  const [street, setStreet] = useState<string>(values.street);
  const cityTouched = useRef<boolean>(Boolean(values.city));
  const streetTouched = useRef<boolean>(Boolean(values.street));
  useEffect(() => {
    if (!/^\d{4}-\d{3}$/.test(postalCode)) return;
    if (cityTouched.current && streetTouched.current) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    fetch(`https://json.geoapi.pt/cp/${postalCode}`, {
      signal: controller.signal,
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== 'object') return;
        const d = data as Record<string, unknown>;

        if (!cityTouched.current) {
          const locality =
            (typeof d.Localidade === 'string' && d.Localidade) ||
            (typeof d.localidade === 'string' && d.localidade) ||
            (typeof d.concelho === 'string' && d.concelho) ||
            (typeof d.Concelho === 'string' && d.Concelho) ||
            null;
          if (locality) setCity(locality);
        }

        if (!streetTouched.current) {
          // Recolher artérias em todos os formatos que a GeoAPI usa
          const candidates = new Set<string>();
          const collect = (v: unknown) => {
            if (typeof v === 'string' && v.trim()) candidates.add(v.trim());
          };
          collect(d['Artéria'] ?? d.arteria);
          const lists = [d.partes, d.ruas, d.pontos] as unknown[];
          for (const list of lists) {
            if (!Array.isArray(list)) continue;
            for (const item of list) {
              if (typeof item === 'string') collect(item);
              else if (item && typeof item === 'object') {
                const o = item as Record<string, unknown>;
                collect(o['Artéria'] ?? o.arteria ?? o.rua ?? o.local);
              }
            }
          }
          // Só preenche quando é INEQUÍVOCO (uma única artéria no CP7)
          if (candidates.size === 1) {
            setStreet([...candidates][0]);
          }
        }
      })
      .catch(() => {
        /* API em baixo/offline: os campos ficam manuais, sem ruído */
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [postalCode]);

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
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              <label
                htmlFor='phone-national'
                style={{ fontSize: '13px', fontWeight: 500, color: '#3A3F4A' }}
              >
                Telemóvel
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  aria-label='Indicativo do país'
                  value={dial}
                  onChange={e => setDial(e.target.value)}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid #D8DEEF',
                    padding: '9px 8px',
                    fontSize: '14px',
                    color: '#1B2A6B',
                    backgroundColor: '#FFFFFF',
                    maxWidth: 150,
                  }}
                >
                  {DIAL_CODES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                  <option value='other'>🌍 Outro (+…)</option>
                </select>
                <input
                  id='phone-national'
                  type='tel'
                  value={nationalNumber}
                  onChange={e => setNationalNumber(e.target.value)}
                  placeholder={
                    dial === 'other' ? '+ indicativo e número' : '912 345 678'
                  }
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: '8px',
                    border: '1px solid #D8DEEF',
                    padding: '9px 12px',
                    fontSize: '14px',
                    color: '#1B2A6B',
                    backgroundColor: '#FFFFFF',
                  }}
                />
              </div>
              {/* O que o server valida/normaliza (E.164) */}
              <input type='hidden' name='phone' value={composedPhone} />
              <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                Usado para confirmações e lembretes WhatsApp
              </p>
            </div>
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
              value={street}
              onChange={e => {
                streetTouched.current = true;
                setStreet(e.target.value);
              }}
              placeholder='Rua, nº, andar'
            />
            <Input
              id='postalCode'
              name='postalCode'
              label='Código postal'
              maxLength={8}
              value={postalCode}
              onChange={e => setPostalCode(e.target.value)}
              placeholder='0000-000'
              help='Ao completar, a localidade preenche-se automaticamente'
            />
            <Input
              id='city'
              name='city'
              label='Localidade'
              maxLength={100}
              value={city}
              onChange={e => {
                cityTouched.current = true;
                setCity(e.target.value);
              }}
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
