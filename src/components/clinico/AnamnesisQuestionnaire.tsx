// 📄 src/components/clinico/AnamnesisQuestionnaire.tsx
// =============================================================================
// CDC Manager — Ficha de anamnese completa (Fase 3B, E19) — Client Component
// -----------------------------------------------------------------------------
// Um formulário para três contextos (`mode`):
//   staff   — receção/admin na ficha (saveQuestionnaireAction)
//   doctor  — médico na ficha (fica logo validada)
//   patient — portal (savePortalQuestionnaireAction; fica "por validar")
// Reproduz a ficha em papel bloco a bloco: Geral → Odontopediatria (só
// menores de 18, ou se o utilizador ligar) → Harmonização Orofacial (ligável).
// Campos uncontrolled com nomes por prefixo ("g.x", "p.x", "a.x"; listas com
// "[]") — o servidor faz o parse (lib/anamnesis.ts).
// =============================================================================

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  saveQuestionnaireAction,
  savePortalQuestionnaireAction,
  type AnamnesisActionState,
} from '@/actions/anamnesis';
import {
  CONDITIONS,
  ALLERGIES,
  DENTAL_FREQUENCY,
  TREATMENTS_DONE,
  ORAL_HAS,
  ORAL_SYMPTOMS,
  PED_HABITS,
  PED_BREATHING,
  YES_NO_UNKNOWN,
  PED_BEHAVIOR,
  PED_BRUSHINGS,
  FREQ3,
  SMILE_SATISFACTION,
  HOF_IMPROVE,
  HOF_PROCEDURES,
  HOF_CONTRAINDICATIONS,
  type QuestionnaireData,
} from '@/lib/anamnesis';
import { Button } from '@/components/ui/Button';

type Catalog = readonly (readonly [string, string])[];

export function AnamnesisQuestionnaire({
  mode,
  patientId,
  initial,
  isMinor,
  onSaved,
}: {
  mode: 'staff' | 'doctor' | 'patient';
  patientId?: string; // obrigatório em staff/doctor
  initial: QuestionnaireData | null;
  isMinor: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const action =
    mode === 'patient'
      ? savePortalQuestionnaireAction
      : saveQuestionnaireAction;
  const [state, formAction, pending] = useActionState<
    AnamnesisActionState,
    FormData
  >(action, undefined);
  const handled = useRef<AnamnesisActionState>(undefined);
  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;
    if ('error' in state) {
      toast.error(state.error);
      return;
    }
    toast.success(
      mode === 'patient'
        ? 'Ficha enviada. Obrigado — o seu médico vai validá-la na consulta.'
        : 'Ficha de anamnese guardada.',
    );
    router.refresh();
    onSaved?.();
  }, [state, router, mode, onSaved]);

  const [includePediatric, setIncludePediatric] = useState(
    initial?.pediatric != null || isMinor,
  );
  const [includeAesthetic, setIncludeAesthetic] = useState(
    initial?.aesthetic != null,
  );

  const g = initial?.general;
  const p = initial?.pediatric;
  const a = initial?.aesthetic;

  return (
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: 22 }}
    >
      {patientId && <input type='hidden' name='patientId' value={patientId} />}

      {/* ================= ANAMNESE GERAL ================= */}
      <Block title='Anamnese geral · Medicina dentária'>
        <Field label='Motivo da consulta'>
          <TextInput name='g.reason' defaultValue={g?.reason} maxLength={300} />
        </Field>

        <Group title='História médica — assinale se possui ou já possuiu'>
          <CheckGrid
            name='g.conditions[]'
            cat={CONDITIONS}
            selected={g?.conditions}
          />
          <Field label='Outra'>
            <TextInput
              name='g.conditionsOther'
              defaultValue={g?.conditionsOther}
            />
          </Field>
        </Group>

        <Group title='Cirurgia e anestesia'>
          <YesNoWhich
            label='Fez alguma cirurgia nos últimos 12 meses?'
            name='g.surgeryLast12m'
            whichName='g.surgeryWhich'
            value={g?.surgeryLast12m}
            which={g?.surgeryWhich}
          />
          <YesNoWhich
            label='Já foi submetido(a) a anestesia?'
            name='g.anesthesiaBefore'
            whichName='g.anesthesiaWhich'
            value={g?.anesthesiaBefore}
            which={g?.anesthesiaWhich}
          />
          <YesNoWhich
            label='Teve alguma reação ou complicação anestésica?'
            name='g.anesthesiaReaction'
            whichName='g.anesthesiaReactionWhich'
            value={g?.anesthesiaReaction}
            which={g?.anesthesiaReactionWhich}
            danger
          />
        </Group>

        <Group title='Medicação e alergias'>
          <Field label='Observações médicas relevantes'>
            <TextInput
              name='g.medicalObservations'
              defaultValue={g?.medicalObservations}
              maxLength={500}
            />
          </Field>
          <YesNoWhich
            label='Toma medicação regularmente?'
            name='g.takesMedication'
            whichName='g.medicationWhich'
            value={g?.takesMedication}
            which={g?.medicationWhich}
          />
          <YesNoWhich
            label='Toma suplementos?'
            name='g.takesSupplements'
            whichName='g.supplementsWhich'
            value={g?.takesSupplements}
            which={g?.supplementsWhich}
          />
          <p style={subLabel}>Alergias ou intolerâncias</p>
          <CheckGrid
            name='g.allergies[]'
            cat={ALLERGIES}
            selected={g?.allergies}
            danger
          />
          <Field label='Outra — qual?'>
            <TextInput
              name='g.allergiesOther'
              defaultValue={g?.allergiesOther}
            />
          </Field>
        </Group>

        <Group title='História de medicina dentária'>
          <div style={grid2}>
            <Field label='Última consulta de medicina dentária'>
              <TextInput
                type='date'
                name='g.lastDentalVisit'
                defaultValue={g?.lastDentalVisit}
              />
            </Field>
            <Field label='Frequência'>
              <RadioRow
                name='g.frequency'
                cat={DENTAL_FREQUENCY}
                value={g?.frequency}
              />
            </Field>
          </div>
          <p style={subLabel}>Tratamentos realizados</p>
          <CheckGrid
            name='g.treatmentsDone[]'
            cat={TREATMENTS_DONE}
            selected={g?.treatmentsDone}
          />
          <Field label='Outro'>
            <TextInput
              name='g.treatmentsOther'
              defaultValue={g?.treatmentsOther}
            />
          </Field>
        </Group>

        <Group title='Higiene oral'>
          <div style={grid2}>
            <Field label='Escovagem por dia'>
              <TextInput
                name='g.brushingsPerDay'
                defaultValue={g?.brushingsPerDay}
                maxLength={40}
                placeholder='ex.: 2'
              />
            </Field>
            <YesNo
              label='Usa fio dentário diariamente?'
              name='g.flossDaily'
              value={g?.flossDaily}
            />
            <YesNo
              label='Escovilhões?'
              name='g.interdentalBrushes'
              value={g?.interdentalBrushes}
            />
            <YesNo
              label='Elixir para bochechar?'
              name='g.mouthwash'
              value={g?.mouthwash}
            />
          </div>
          <p style={subLabel}>Possui</p>
          <CheckGrid name='g.has[]' cat={ORAL_HAS} selected={g?.has} />
        </Group>

        <Group title='Sintomas orais'>
          <CheckGrid
            name='g.symptoms[]'
            cat={ORAL_SYMPTOMS}
            selected={g?.symptoms}
          />
          <Field label='Outros'>
            <TextInput name='g.symptomsOther' defaultValue={g?.symptomsOther} />
          </Field>
        </Group>
      </Block>

      {/* ================= ODONTOPEDIATRIA ================= */}
      <Block
        title='Anamnese · Odontopediatria'
        toggle={{
          name: 'includePediatric',
          checked: includePediatric,
          onChange: setIncludePediatric,
          label: isMinor
            ? 'Paciente menor de 18 — bloco aplicável'
            : 'Aplicar bloco de odontopediatria',
        }}
      >
        {includePediatric && (
          <>
            <Group title='Hábitos'>
              <CheckGrid
                name='p.habits[]'
                cat={PED_HABITS}
                selected={p?.habits}
              />
              <Field label='Outro'>
                <TextInput name='p.habitsOther' defaultValue={p?.habitsOther} />
              </Field>
              <div style={grid2}>
                <Field label='Respiração'>
                  <RadioRow
                    name='p.breathing'
                    cat={PED_BREATHING}
                    value={p?.breathing}
                  />
                </Field>
                <Field label='Bruxismo noturno'>
                  <RadioRow
                    name='p.nocturnalBruxism'
                    cat={YES_NO_UNKNOWN}
                    value={p?.nocturnalBruxism}
                  />
                </Field>
                <Field label='Range ou aperta os dentes'>
                  <RadioRow
                    name='p.clenching'
                    cat={YES_NO_UNKNOWN}
                    value={p?.clenching}
                  />
                </Field>
                <Field label='Fala ou deglutição alterada'>
                  <RadioRow
                    name='p.speechSwallow'
                    cat={YES_NO_UNKNOWN}
                    value={p?.speechSwallow}
                  />
                </Field>
              </div>
              <YesNoWhich
                label='Problemas de sono?'
                name='p.sleepProblems'
                whichName='p.sleepWhich'
                value={p?.sleepProblems}
                which={p?.sleepWhich}
              />
            </Group>

            <Group title='Comportamento'>
              <CheckGrid
                name='p.behavior[]'
                cat={PED_BEHAVIOR}
                selected={p?.behavior}
              />
              <Field label='Outro — qual?'>
                <TextInput
                  name='p.behaviorOther'
                  defaultValue={p?.behaviorOther}
                />
              </Field>
              <YesNoWhich
                label='Já teve alguma experiência negativa no dentista?'
                name='p.negativeExperience'
                whichName='p.negativeWhich'
                value={p?.negativeExperience}
                which={p?.negativeWhich}
              />
            </Group>

            <Group title='Dados médicos'>
              <YesNoWhich
                label='Doenças infantis?'
                name='p.childhoodDiseases'
                whichName='p.childhoodWhich'
                value={p?.childhoodDiseases}
                which={p?.childhoodWhich}
              />
              <YesNoWhich
                label='Alergias?'
                name='p.allergies'
                whichName='p.allergiesWhich'
                value={p?.allergies}
                which={p?.allergiesWhich}
                danger
              />
              <YesNoWhich
                label='Doenças infectocontagiosas?'
                name='p.infectious'
                whichName='p.infectiousWhich'
                value={p?.infectious}
                which={p?.infectiousWhich}
              />
            </Group>

            <Group title='Higiene e alimentação'>
              <div style={grid2}>
                <Field label='Quem realiza a escovagem'>
                  <TextInput name='p.brushedBy' defaultValue={p?.brushedBy} />
                </Field>
                <Field label='Escovagens por dia'>
                  <RadioRow
                    name='p.brushingsPerDay'
                    cat={PED_BRUSHINGS}
                    value={p?.brushingsPerDay}
                  />
                </Field>
                <YesNo
                  label='Usa fio dentário?'
                  name='p.floss'
                  value={p?.floss}
                />
                <YesNo
                  label='Usa dentífrico fluoretado?'
                  name='p.fluorideToothpaste'
                  value={p?.fluorideToothpaste}
                />
                <Field label='Consumo de açúcar / doces'>
                  <RadioRow name='p.sugar' cat={FREQ3} value={p?.sugar} />
                </Field>
                <Field label='Bebidas açucaradas / refrigerantes'>
                  <RadioRow name='p.sodas' cat={FREQ3} value={p?.sodas} />
                </Field>
              </div>
              <YesNoWhich
                label='Restrições alimentares?'
                name='p.dietRestrictions'
                whichName='p.dietWhich'
                value={p?.dietRestrictions}
                which={p?.dietWhich}
              />
            </Group>
          </>
        )}
      </Block>

      {/* ================= HARMONIZAÇÃO OROFACIAL ================= */}
      <Block
        title='Anamnese · Harmonização orofacial'
        toggle={{
          name: 'includeAesthetic',
          checked: includeAesthetic,
          onChange: setIncludeAesthetic,
          label: 'Aplicar bloco de harmonização / estética',
        }}
      >
        {includeAesthetic && (
          <>
            <Field label='Qual o grau de satisfação com o seu sorriso?'>
              <RadioRow
                name='a.satisfaction'
                cat={SMILE_SATISFACTION}
                value={a?.satisfaction}
              />
            </Field>
            <p style={subLabel}>O que gostaria de melhorar?</p>
            <CheckGrid
              name='a.improve[]'
              cat={HOF_IMPROVE}
              selected={a?.improve}
            />
            <p style={subLabel}>Procedimentos anteriores</p>
            <CheckGrid
              name='a.procedures[]'
              cat={HOF_PROCEDURES}
              selected={a?.procedures}
            />
            <Field label='Outro — qual?'>
              <TextInput
                name='a.proceduresOther'
                defaultValue={a?.proceduresOther}
              />
            </Field>
            <p style={subLabel}>Contraindicações / histórico</p>
            <CheckGrid
              name='a.contraindications[]'
              cat={HOF_CONTRAINDICATIONS}
              selected={a?.contraindications}
              danger
            />
          </>
        )}
      </Block>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          bottom: 0,
          padding: '10px 0',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #EEF1F8',
        }}
      >
        <span style={{ fontSize: '12px', color: '#6A7186' }}>
          {mode === 'patient'
            ? 'Ao enviar, declara que as respostas são verdadeiras.'
            : 'Guardar substitui a ficha anterior e renova a validade por 1 ano.'}
        </span>
        <Button type='submit' loading={pending}>
          {mode === 'patient' ? 'Enviar ficha' : 'Guardar anamnese'}
        </Button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Building blocks (estilos inline — convenção do projeto)
// -----------------------------------------------------------------------------
const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '12px 18px',
};
const subLabel: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1B2A6B',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1.5px solid #B9C3E0',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '14px',
  color: '#1B2A6B',
  backgroundColor: '#FBFCFF',
};

function Block({
  title,
  toggle,
  children,
}: {
  title: string;
  toggle?: {
    name: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
  };
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid #EEF1F8',
        borderRadius: '14px',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          backgroundColor: '#1B2A6B',
          color: '#FFFFFF',
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
        }}
      >
        <span>{title}</span>
        {toggle && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'none',
              letterSpacing: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type='checkbox'
              name={toggle.name}
              checked={toggle.checked}
              onChange={e => toggle.onChange(e.target.checked)}
              style={{ accentColor: '#FFFFFF' }}
            />
            {toggle.label}
          </label>
        )}
      </div>
      {(!toggle || toggle.checked) && (
        <div
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderTop: '1px dashed #E3E8F5',
        paddingTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <h4
        style={{
          margin: 0,
          fontSize: '13px',
          fontWeight: 700,
          color: '#2743A6',
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#3A3F4A' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  defaultValue,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue'> & {
  defaultValue?: string | null;
}) {
  return (
    <input
      className='cdc-field'
      style={inputStyle}
      defaultValue={defaultValue ?? ''}
      {...rest}
    />
  );
}

function CheckGrid({
  name,
  cat,
  selected,
  danger,
}: {
  name: string;
  cat: Catalog;
  selected?: readonly string[] | null;
  danger?: boolean;
}) {
  const set = new Set(selected ?? []);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '6px 14px',
      }}
    >
      {cat.map(([k, label]) => (
        <label
          key={k}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '13.5px',
            color: '#1C2233',
            cursor: 'pointer',
          }}
        >
          <input
            type='checkbox'
            name={name}
            value={k}
            defaultChecked={set.has(k)}
            style={{
              width: 16,
              height: 16,
              accentColor: danger ? '#B3261E' : '#2743A6',
            }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function RadioRow({
  name,
  cat,
  value,
}: {
  name: string;
  cat: Catalog;
  value?: string | null;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 4 }}>
      {cat.map(([k, label]) => (
        <label
          key={k}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '13.5px',
            cursor: 'pointer',
          }}
        >
          <input
            type='radio'
            name={name}
            value={k}
            defaultChecked={value === k}
            style={{ accentColor: '#2743A6' }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function YesNo({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value?: boolean | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#3A3F4A' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 14 }}>
        {(['nao', 'sim'] as const).map(v => (
          <label
            key={v}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '13.5px',
              cursor: 'pointer',
            }}
          >
            <input
              type='radio'
              name={name}
              value={v}
              defaultChecked={value === (v === 'sim')}
              style={{ accentColor: '#2743A6' }}
            />
            {v === 'sim' ? 'Sim' : 'Não'}
          </label>
        ))}
      </div>
    </div>
  );
}

function YesNoWhich({
  label,
  name,
  whichName,
  value,
  which,
  danger,
}: {
  label: string;
  name: string;
  whichName: string;
  value?: boolean | null;
  which?: string | null;
  danger?: boolean;
}) {
  const [yes, setYes] = useState(value === true);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          'minmax(220px, 1fr) minmax(120px, auto) minmax(200px, 2fr)',
        gap: '6px 14px',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: '13.5px', color: '#1C2233' }}>{label}</span>
      <div style={{ display: 'flex', gap: 14 }}>
        {(['nao', 'sim'] as const).map(v => (
          <label
            key={v}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '13.5px',
              cursor: 'pointer',
            }}
          >
            <input
              type='radio'
              name={name}
              value={v}
              defaultChecked={value === (v === 'sim')}
              onChange={() => setYes(v === 'sim')}
              style={{ accentColor: danger ? '#B3261E' : '#2743A6' }}
            />
            {v === 'sim' ? 'Sim' : 'Não'}
          </label>
        ))}
      </div>
      <input
        className='cdc-field'
        name={whichName}
        defaultValue={which ?? ''}
        placeholder='Qual?'
        disabled={!yes}
        style={{ ...inputStyle, opacity: yes ? 1 : 0.5 }}
      />
    </div>
  );
}