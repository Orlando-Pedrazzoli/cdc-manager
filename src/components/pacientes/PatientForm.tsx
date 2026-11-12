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

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
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
import {
  MARITAL_STATUSES,
  MARITAL_STATUS_LABEL,
  SEXES,
  SEX_LABEL,
} from '@/lib/domain';
import {
  RelativesEditor,
  type RelativeRow,
} from '@/components/pacientes/RelativesEditor';
import { Modal } from '@/components/ui/Modal';
import {
  listTabletsAction,
  type TabletOption,
} from '@/actions/signature-requests';

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
  maritalStatus: string;
  nationality: string;
  referredBy: string;
  // --- Fase 3 ---
  sex: string;
  snsNumber: string;
  homePhone: string;
  emergencyName: string;
  emergencyPhone: string;
  insuranceCompany: string;
  insuranceCardNumber: string;
  relatives: RelativeRow[];
  deceased: boolean;
  preferredChannel: string;
  preferredDoctorId: string;
  notes: string;
  hasConsentData: boolean;
  hasConsentReminders: boolean;
  hasConsentMarketing: boolean;
  // 6.ª ronda/07: "não indica NIF" / "não tem"
  noNif?: boolean;
  noSnsNumber?: boolean;
  noPhone?: boolean;
  noEmail?: boolean;
}

const EMPTY: PatientFormInitial = {
  name: '',
  birthDate: '',
  nif: '',
  phone: '',
  email: '',
  maritalStatus: '',
  nationality: '',
  referredBy: '',
  sex: '',
  snsNumber: '',
  homePhone: '',
  emergencyName: '',
  emergencyPhone: '',
  insuranceCompany: '',
  insuranceCardNumber: '',
  relatives: [],
  deceased: false,
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

// -----------------------------------------------------------------------------
// 6.ª ronda/07 (Victor, nov. 2026): campos obrigatórios em destaque
// -----------------------------------------------------------------------------
// "Os campos obrigatórios (*) aparecem com cor destacada. A ficha só é
// guardada depois de preenchidos." Caixa âmbar enquanto falta o valor,
// verde-claro quando está resolvido (preenchido ou "não tem").
const NATIONALITIES = [
  'Portuguesa',
  'Brasileira',
  'Angolana',
  'Cabo-verdiana',
  'Guineense',
  'Moçambicana',
  'São-tomense',
  'Ucraniana',
  'Romena',
  'Espanhola',
  'Francesa',
  'Italiana',
  'Britânica',
  'Alemã',
  'Indiana',
  'Nepalesa',
  'Bangladechiana',
  'Chinesa',
  'Venezuelana',
] as const;

function RequiredBox({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        borderRadius: '10px',
        padding: '8px 10px',
        border: `1.5px solid ${done ? '#BFE3CC' : '#F0B429'}`,
        backgroundColor: done ? '#F4FBF6' : '#FFF8E1',
      }}
    >
      {children}
    </div>
  );
}

function NoneOption({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#6B4E00',
        cursor: 'pointer',
      }}
    >
      <input
        type='checkbox'
        name={name}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
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
  completing = false,
}: {
  mode: 'create' | 'edit';
  patientId?: string; // obrigatório em edit
  initial?: PatientFormInitial;
  doctors: { id: string; name: string }[];
  /** Ficha de pré-marcação a ser completada: vale como ficha nova
   *  (campos obrigatórios + RGPD para o tablet + nº de processo no fim) */
  completing?: boolean;
}) {
  const router = useRouter();
  const values = initial ?? EMPTY;

  // 6.ª ronda/07: obrigatórios aplicam-se à ficha nova e à pré-marcação
  // que se completa; nas fichas antigas ficam só assinalados.
  const strict = mode === 'create' || completing;
  const [name, setName] = useState(values.name);
  const [birthDate, setBirthDate] = useState(values.birthDate);
  const [nif, setNif] = useState(values.nif);
  const [noNif, setNoNif] = useState(Boolean(values.noNif));
  const [sex, setSex] = useState(values.sex);
  const [sns, setSns] = useState(values.snsNumber);
  const [noSns, setNoSns] = useState(Boolean(values.noSnsNumber));
  const [noPhone, setNoPhone] = useState(Boolean(values.noPhone));
  const [email, setEmail] = useState(values.email);
  const [noEmail, setNoEmail] = useState(Boolean(values.noEmail));
  const knownNationality = (NATIONALITIES as readonly string[]).includes(
    values.nationality,
  );
  const [natChoice, setNatChoice] = useState<string>(
    values.nationality === ''
      ? mode === 'create'
        ? 'Portuguesa'
        : ''
      : knownNationality
        ? values.nationality
        : 'other',
  );
  const [natOther, setNatOther] = useState(
    knownNationality ? '' : values.nationality,
  );
  const nationality = natChoice === 'other' ? natOther.trim() : natChoice;

  // RGPD: tablets ligados nas clínicas deste utilizador (ficha nova)
  const [tablets, setTablets] = useState<TabletOption[]>([]);
  const [tabletClinicId, setTabletClinicId] = useState('');
  useEffect(() => {
    if (!strict) return;
    let alive = true;
    listTabletsAction()
      .then(list => {
        if (!alive) return;
        setTablets(list);
        setTabletClinicId(prev => prev || (list[0]?.clinicId ?? ''));
      })
      .catch(() => {
        /* sem tablets: o RGPD continua disponível no botão da ficha */
      });
    return () => {
      alive = false;
    };
  }, [strict]);

  const action =
    mode === 'edit' && patientId
      ? updatePatientAction.bind(null, patientId)
      : createPatientAction;

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
  // Efeitos do resultado (aviso, código manual, navegação) no próprio
  // callback da action — sem useEffect a observar `state`
  const [state, formAction, pending] = useActionState<
    PatientFormState,
    FormData
  >(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result || 'error' in result) return result; // erro mostrado inline

    if (result.warning) toast(result.warning, { icon: '⚠️', duration: 6000 });

    if (result.manualCode) {
      // Segurar a navegação até a receção copiar o código
      setManualCode(result.manualCode);
      setPendingNavId(result.patientId);
      return result;
    }

    if (result.gdprSentToTablet) {
      toast.success('Consentimento RGPD enviado para o tablet.', {
        duration: 6000,
      });
    }

    if (mode === 'create') {
      toast.success(`Paciente criado (processo nº ${result.processNumber})`);
      // Fechar o formulário: voltar à LISTA (pedido da direção pós-demo —
      // ficar no formulário deixava dúvida se tinha gravado)
      router.push('/admin/pacientes');
    } else {
      toast.success(
        completing && result.processNumber != null
          ? `Ficha completa — processo nº ${result.processNumber}`
          : 'Ficha atualizada.',
      );
      router.refresh();
    }
    return result;
  }, undefined);

  const closeManualCode = () => {
    const navId = pendingNavId;
    setManualCode(null);
    setPendingNavId(null);
    if (mode === 'create' && navId) {
      router.push('/admin/pacientes');
    } else {
      router.refresh();
    }
  };

  return (
    <>
      <form
        // Submissão MANUAL (preventDefault + startTransition): o React 19
        // faz reset automático de campos não controlados quando a action é
        // invocada via atributo action={} — incluindo em ERRO de validação.
        // Foi isso que apagou o formulário na demo de 09/09/2026. Invocada
        // assim, os valores preenchidos ficam SEMPRE intactos.
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => {
            formAction(fd);
          });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        {/* --- Identificação -------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Identificação</h3>
          <div style={grid2}>
            <RequiredBox done={name.trim().length >= 3}>
              <Input
                id='name'
                name='name'
                label='Nome completo *'
                required
                minLength={3}
                maxLength={160}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder='Maria da Silva'
              />
            </RequiredBox>
            <RequiredBox done={birthDate !== ''}>
              <Input
                id='birthDate'
                name='birthDate'
                label='Data de nascimento *'
                type='date'
                required={strict}
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
              />
            </RequiredBox>
            <RequiredBox done={nif.trim() !== '' || noNif}>
              <Input
                id='nif'
                name='nif'
                label='NIF *'
                inputMode='numeric'
                maxLength={9}
                required={strict && !noNif}
                readOnly={noNif}
                value={noNif ? '' : nif}
                onChange={e => setNif(e.target.value)}
                placeholder='9 dígitos'
                help={
                  noNif
                    ? 'A fatura sai como Consumidor final. A partir de 1.000 € é pedida a morada.'
                    : 'Vai nas faturas para dedução no IRS'
                }
              />
              <NoneOption
                name='noNif'
                label='Paciente não indica NIF'
                checked={noNif}
                onChange={setNoNif}
              />
            </RequiredBox>
            <RequiredBox done={sex !== ''}>
              <Select
                id='sex'
                name='sex'
                label='Sexo *'
                required={strict}
                value={sex}
                onChange={e => setSex(e.target.value)}
              >
                <option value=''>— Selecionar —</option>
                {SEXES.map(x => (
                  <option key={x} value={x}>
                    {SEX_LABEL[x]}
                  </option>
                ))}
              </Select>
            </RequiredBox>
            <RequiredBox done={sns.trim() !== '' || noSns}>
              <Input
                id='snsNumber'
                name='snsNumber'
                label='Nº de utente (SNS) *'
                inputMode='numeric'
                maxLength={9}
                required={strict && !noSns}
                readOnly={noSns}
                value={noSns ? '' : sns}
                onChange={e => setSns(e.target.value)}
                placeholder='9 dígitos'
              />
              <NoneOption
                name='noSnsNumber'
                label='Não tem'
                checked={noSns}
                onChange={setNoSns}
              />
            </RequiredBox>
            <RequiredBox done={nationality !== ''}>
              <Select
                id='nationalityChoice'
                label='Nacionalidade *'
                required={strict}
                value={natChoice}
                onChange={e => setNatChoice(e.target.value)}
              >
                <option value=''>— Selecionar —</option>
                {NATIONALITIES.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value='other'>Outra…</option>
              </Select>
              {natChoice === 'other' && (
                <Input
                  id='nationalityOther'
                  aria-label='Outra nacionalidade'
                  maxLength={60}
                  required={strict}
                  value={natOther}
                  onChange={e => setNatOther(e.target.value)}
                  placeholder='Escreva a nacionalidade'
                />
              )}
              <input type='hidden' name='nationality' value={nationality} />
            </RequiredBox>
            <Input
              id='profession'
              name='profession'
              label='Profissão'
              maxLength={100}
              defaultValue={values.profession}
            />
            <Select
              id='maritalStatus'
              name='maritalStatus'
              label='Estado civil'
              defaultValue={values.maritalStatus}
            >
              <option value=''>—</option>
              {MARITAL_STATUSES.map(m => (
                <option key={m} value={m}>
                  {MARITAL_STATUS_LABEL[m]}
                </option>
              ))}
            </Select>
            <Input
              id='referredBy'
              name='referredBy'
              label='Indicado por'
              maxLength={120}
              defaultValue={values.referredBy}
              placeholder='Outro paciente, Google, seguro...'
              help='Como conheceu a clínica — alimenta o relatório de origem'
            />
          </div>
        </section>

        {/* --- Contactos ------------------------------------------------------ */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Contactos</h3>
          <div style={grid2}>
            <RequiredBox done={composedPhone !== '' || noPhone}>
              <label
                htmlFor='phone-national'
                style={{ fontSize: '13px', fontWeight: 500, color: '#3A3F4A' }}
              >
                Telemóvel *
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
                  value={noPhone ? '' : nationalNumber}
                  onChange={e => setNationalNumber(e.target.value)}
                  required={strict && !noPhone}
                  disabled={noPhone}
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
              <input
                type='hidden'
                name='phone'
                value={noPhone ? '' : composedPhone}
              />
              <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                Usado para confirmações e lembretes WhatsApp
              </p>
              <NoneOption
                name='noPhone'
                label='Não tem telemóvel'
                checked={noPhone}
                onChange={setNoPhone}
              />
            </RequiredBox>
            <RequiredBox done={email.trim() !== '' || noEmail}>
              <Input
                id='email'
                name='email'
                label='Email *'
                type='email'
                required={strict && !noEmail}
                readOnly={noEmail}
                value={noEmail ? '' : email}
                onChange={e => setEmail(e.target.value)}
                placeholder='paciente@exemplo.pt'
              />
              <NoneOption
                name='noEmail'
                label='Não tem email'
                checked={noEmail}
                onChange={setNoEmail}
              />
            </RequiredBox>
          </div>
          <div style={grid2}>
            <Input
              id='homePhone'
              name='homePhone'
              label='Contacto de casa'
              inputMode='tel'
              maxLength={30}
              defaultValue={values.homePhone}
            />
            <div style={grid2}>
              <Input
                id='emergencyName'
                name='emergencyName'
                label='Contacto de emergência'
                maxLength={120}
                defaultValue={values.emergencyName}
                placeholder='Nome'
              />
              <Input
                id='emergencyPhone'
                name='emergencyPhone'
                label='Telefone de emergência'
                inputMode='tel'
                maxLength={30}
                defaultValue={values.emergencyPhone}
              />
            </div>
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
              inputMode='numeric'
              value={postalCode}
              onChange={e => {
                // Máscara CP7: só dígitos, hífen inserido automaticamente
                // após os 4 primeiros — "1234567" e "1234-567" dão o mesmo
                const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
                setPostalCode(
                  digits.length > 4
                    ? `${digits.slice(0, 4)}-${digits.slice(4)}`
                    : digits,
                );
              }}
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

        {mode === 'edit' && (
          <section
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <Checkbox
              id='deceased'
              name='deceased'
              label='Paciente falecido'
              defaultChecked={values.deceased}
              help='Ao marcar: os recalls abertos são dispensados e nenhum novo convite/lembrete será gerado. A ficha e o histórico mantêm-se intactos.'
            />
          </section>
        )}

        {/* --- Seguradora (E12) ----------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Seguradora (opcional)</h3>
          <div style={grid2}>
            <Input
              id='insuranceCompany'
              name='insuranceCompany'
              label='Seguradora / subsistema'
              maxLength={120}
              defaultValue={values.insuranceCompany}
              placeholder='ex.: Médis, Multicare, ADSE'
              help='Opcional. Só sai na fatura quando o paciente pede, para tentar o reembolso junto do seguro'
            />
            <Input
              id='insuranceCardNumber'
              name='insuranceCardNumber'
              label='Nº do cartão / beneficiário'
              maxLength={60}
              defaultValue={values.insuranceCardNumber}
            />
          </div>
        </section>

        {/* --- Familiares (E11) ----------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <h3 style={sectionTitle}>Familiares e contactos de referência</h3>
          <RelativesEditor initial={values.relatives} />
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
          {/* 6.ª ronda/07: ao criar a ficha, o consentimento segue para o
              tablet; assinado, fica no separador Documentos */}
          {strict &&
            (tablets.length === 0 ? (
              <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>
                Sem tablet de assinatura ligado — depois de guardar, use o
                botão RGPD da ficha para o paciente assinar.
              </p>
            ) : (
              <Select
                id='gdprTabletClinicId'
                name='gdprTabletClinicId'
                label='Consentimento RGPD — enviar para o tablet'
                value={tabletClinicId}
                onChange={e => setTabletClinicId(e.target.value)}
                help='Ao guardar, o consentimento aparece no tablet. O paciente assina e o documento fica no separador Documentos.'
              >
                {tablets.map(t => (
                  <option key={t.clinicId} value={t.clinicId}>
                    Tablet · {t.label}
                  </option>
                ))}
                <option value=''>Não enviar agora</option>
              </Select>
            ))}
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

        {strict && (
          <p style={{ margin: 0, fontSize: '12px', color: '#6B4E00' }}>
            * Campos obrigatórios (em destaque). A ficha só é guardada depois
            de preenchidos ou de assinalada a opção ao lado.
          </p>
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
            {mode === 'create'
              ? 'Criar paciente'
              : completing
                ? 'Guardar ficha completa'
                : 'Guardar alterações'}
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
