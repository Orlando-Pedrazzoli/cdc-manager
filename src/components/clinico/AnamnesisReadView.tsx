// 📄 src/components/clinico/AnamnesisReadView.tsx
// =============================================================================
// CDC Manager — Leitura compacta da ficha de anamnese (Fase 3B)
// Mostra SÓ o que está marcado/preenchido (a ficha em branco é ruído).
// Server-safe. Usado na ficha do médico ("anamnese de fácil acesso", P12).
// =============================================================================

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
  labelOf,
  type QuestionnaireData,
} from '@/lib/anamnesis';

type Cat = readonly (readonly [string, string])[];
const list = (cat: Cat, keys: readonly string[] | null | undefined) =>
  (keys ?? []).map(k => labelOf(cat, k)).join(', ');
const yn = (v: boolean | null | undefined, which?: string | null) =>
  v == null ? null : v ? `Sim${which ? ` — ${which}` : ''}` : 'Não';

function Row({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | null | undefined;
  danger?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        gap: 10,
        fontSize: '13px',
      }}
    >
      <span style={{ color: '#6A7186' }}>{label}</span>
      <span
        style={{
          color: danger ? '#B3261E' : '#1C2233',
          fontWeight: danger ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}
function Sect({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h4
        style={{
          margin: '6px 0 2px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#2743A6',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

export function AnamnesisReadView({ data }: { data: QuestionnaireData }) {
  const g = data.general;
  const p = data.pediatric;
  const a = data.aesthetic;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Sect title='Geral'>
        <Row label='Motivo da consulta' value={g.reason} />
        <Row
          label='História médica'
          value={[list(CONDITIONS, g.conditions), g.conditionsOther]
            .filter(Boolean)
            .join(', ')}
          danger={g.conditions.length > 0}
        />
        <Row
          label='Cirurgia últimos 12 meses'
          value={yn(g.surgeryLast12m, g.surgeryWhich)}
        />
        <Row
          label='Anestesia anterior'
          value={yn(g.anesthesiaBefore, g.anesthesiaWhich)}
        />
        <Row
          label='Reação anestésica'
          value={yn(g.anesthesiaReaction, g.anesthesiaReactionWhich)}
          danger={!!g.anesthesiaReaction}
        />
        <Row label='Observações médicas' value={g.medicalObservations} />
        <Row
          label='Medicação'
          value={yn(g.takesMedication, g.medicationWhich)}
        />
        <Row
          label='Suplementos'
          value={yn(g.takesSupplements, g.supplementsWhich)}
        />
        <Row
          label='Alergias'
          value={[list(ALLERGIES, g.allergies), g.allergiesOther]
            .filter(Boolean)
            .join(', ')}
          danger
        />
        <Row
          label='Última consulta dentária'
          value={
            g.lastDentalVisit
              ? g.lastDentalVisit.split('-').reverse().join('/')
              : null
          }
        />
        <Row
          label='Frequência'
          value={g.frequency ? labelOf(DENTAL_FREQUENCY, g.frequency) : null}
        />
        <Row
          label='Tratamentos realizados'
          value={[list(TREATMENTS_DONE, g.treatmentsDone), g.treatmentsOther]
            .filter(Boolean)
            .join(', ')}
        />
        <Row
          label='Higiene'
          value={[
            g.brushingsPerDay ? `${g.brushingsPerDay}× escovagem/dia` : null,
            g.flossDaily ? 'fio dentário' : null,
            g.interdentalBrushes ? 'escovilhões' : null,
            g.mouthwash ? 'elixir' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Row label='Possui' value={list(ORAL_HAS, g.has)} />
        <Row
          label='Sintomas orais'
          value={[list(ORAL_SYMPTOMS, g.symptoms), g.symptomsOther]
            .filter(Boolean)
            .join(', ')}
        />
      </Sect>
      {p && (
        <Sect title='Odontopediatria'>
          <Row
            label='Hábitos'
            value={[list(PED_HABITS, p.habits), p.habitsOther]
              .filter(Boolean)
              .join(', ')}
          />
          <Row
            label='Respiração'
            value={p.breathing ? labelOf(PED_BREATHING, p.breathing) : null}
          />
          <Row
            label='Bruxismo noturno'
            value={
              p.nocturnalBruxism
                ? labelOf(YES_NO_UNKNOWN, p.nocturnalBruxism)
                : null
            }
          />
          <Row
            label='Range/aperta os dentes'
            value={p.clenching ? labelOf(YES_NO_UNKNOWN, p.clenching) : null}
          />
          <Row
            label='Fala/deglutição alterada'
            value={
              p.speechSwallow ? labelOf(YES_NO_UNKNOWN, p.speechSwallow) : null
            }
          />
          <Row
            label='Problemas de sono'
            value={yn(p.sleepProblems, p.sleepWhich)}
          />
          <Row
            label='Comportamento'
            value={[list(PED_BEHAVIOR, p.behavior), p.behaviorOther]
              .filter(Boolean)
              .join(', ')}
          />
          <Row
            label='Experiência negativa'
            value={yn(p.negativeExperience, p.negativeWhich)}
          />
          <Row
            label='Doenças infantis'
            value={yn(p.childhoodDiseases, p.childhoodWhich)}
          />
          <Row
            label='Alergias'
            value={yn(p.allergies, p.allergiesWhich)}
            danger={!!p.allergies}
          />
          <Row
            label='Infectocontagiosas'
            value={yn(p.infectious, p.infectiousWhich)}
          />
          <Row
            label='Escovagem'
            value={[
              p.brushedBy ? `por ${p.brushedBy}` : null,
              p.brushingsPerDay
                ? `${labelOf(PED_BRUSHINGS, p.brushingsPerDay)}×/dia`
                : null,
              p.floss ? 'fio' : null,
              p.fluorideToothpaste ? 'fluoretado' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Row
            label='Açúcar / refrigerantes'
            value={[
              p.sugar ? `doces: ${labelOf(FREQ3, p.sugar)}` : null,
              p.sodas ? `refrigerantes: ${labelOf(FREQ3, p.sodas)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Row
            label='Restrições alimentares'
            value={yn(p.dietRestrictions, p.dietWhich)}
          />
        </Sect>
      )}
      {a && (
        <Sect title='Harmonização orofacial'>
          <Row
            label='Satisfação com o sorriso'
            value={
              a.satisfaction
                ? labelOf(SMILE_SATISFACTION, a.satisfaction)
                : null
            }
          />
          <Row
            label='Gostaria de melhorar'
            value={list(HOF_IMPROVE, a.improve)}
          />
          <Row
            label='Procedimentos anteriores'
            value={[list(HOF_PROCEDURES, a.procedures), a.proceduresOther]
              .filter(Boolean)
              .join(', ')}
          />
          <Row
            label='Contraindicações'
            value={list(HOF_CONTRAINDICATIONS, a.contraindications)}
            danger={a.contraindications.length > 0}
          />
        </Sect>
      )}
    </div>
  );
}