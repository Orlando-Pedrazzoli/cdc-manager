// 📄 src/lib/anamnesis.ts
// =============================================================================
// CDC Manager — Ficha de Anamnese do Centro Dentário Colombo (Fase 3B, E19)
// -----------------------------------------------------------------------------
// Transcrição 1:1 da ficha em papel anexada pela Isabel:
//   · ANAMNESE GERAL — Medicina Dentária (história médica, medicação e
//     alergias, história de medicina dentária, higiene oral, sintomas orais)
//   · ANAMNESE — ODONTOPEDIATRIA (hábitos, comportamento, dados médicos,
//     higiene e alimentação) — só para menores de 18
//   · ANAMNESE — HARMONIZAÇÃO OROFACIAL (satisfação, objetivos,
//     procedimentos anteriores, contraindicações) — só quando aplicável
//
// Fonte ÚNICA de: catálogo de campos (labels PT), schema Zod, regra de
// validade (anual) e derivação dos alertas de segurança (alergias/condições
// → ClinicalRecord.allergies/systemicConditions que alimentam o banner da
// consulta). Usado pelo form (staff/médico/portal), pela leitura na ficha
// e, na Fase 5, pelo PDF.
// =============================================================================

import { z } from 'zod';

// -----------------------------------------------------------------------------
// Catálogos (a ordem é a da ficha em papel)
// -----------------------------------------------------------------------------
export const CONDITIONS = [
  ['hipertensao', 'Hipertensão'],
  ['doenca-renal', 'Doença renal'],
  ['osteoporose', 'Osteoporose'],
  ['diabetes', 'Diabetes'],
  ['doenca-hepatica', 'Doença hepática'],
  ['cancro', 'Cancro'],
  ['doenca-cardiovascular', 'Doença cardiovascular'],
  ['doenca-tiroide', 'Doença da tiroide'],
  ['epilepsia', 'Epilepsia'],
  ['avc', 'AVC'],
  ['doenca-autoimune', 'Doença autoimune'],
  ['asma', 'Asma'],
  ['disturbios-gi', 'Distúrbios gastrointestinais'],
  ['ansiedade', 'Ansiedade'],
  ['apneia-sono', 'Apneia do sono'],
  ['fibromialgia', 'Fibromialgia'],
  ['depressao', 'Depressão'],
] as const;

export const ALLERGIES = [
  ['medicamentos', 'Medicamentos'],
  ['anestesicos', 'Anestésicos'],
  ['latex', 'Látex'],
  ['cloro', 'Cloro'],
  ['alimentos', 'Alimentos'],
  ['parabenos', 'Parabenos'],
  ['metais', 'Metais'],
] as const;

export const DENTAL_FREQUENCY = [
  ['semestral', 'Semestral'],
  ['anual', 'Anual'],
  ['quando-necessario', 'Apenas quando necessário'],
] as const;

export const TREATMENTS_DONE = [
  ['cirurgia-oral', 'Cirurgia Oral'],
  ['ortodontia', 'Ortodontia'],
  ['periodontal', 'Tratamento Periodontal'],
  ['caries', 'Cáries'],
  ['implantes', 'Implantes'],
  ['endodontia', 'Endodontia'],
  ['higiene-oral', 'Higiene oral'],
] as const;

export const ORAL_HAS = [
  ['amalgamas', 'Amálgamas'],
  ['aparelho-ortodontico', 'Aparelho ortodôntico'],
  ['disfuncao-atm', 'Disfunção ATM'],
  ['proteses', 'Próteses'],
  ['implantes', 'Implantes'],
  ['bruxismo', 'Bruxismo'],
] as const;

export const ORAL_SYMPTOMS = [
  ['sangramento-gengival', 'Sangramento gengival'],
  ['boca-seca', 'Boca seca'],
  ['estalidos-mandibular', 'Estalidos mandibular'],
  ['ronco', 'Ronco'],
  ['mau-halito', 'Mau hálito'],
  ['dificuldade-mastigatoria', 'Dificuldade mastigatória'],
  ['refluxo', 'Refluxo'],
  ['apneia-sono', 'Apneia do sono'],
  ['sensibilidade-dentaria', 'Sensibilidade dentária'],
  ['dor-facial', 'Dor facial'],
  ['desgaste-dentario', 'Desgaste dentário'],
] as const;

// --- Odontopediatria ---
export const PED_HABITS = [
  ['chupeta', 'Chupeta'],
  ['dedo', 'Dedo'],
  ['labio', 'Lábio'],
  ['nao-se-aplica', 'Não se aplica'],
] as const;
export const PED_BREATHING = [
  ['nasal', 'Nasal'],
  ['oral', 'Oral'],
  ['mista', 'Mista'],
  ['nao-sei', 'Não sei'],
] as const;
export const YES_NO_UNKNOWN = [
  ['sim', 'Sim'],
  ['nao', 'Não'],
  ['nao-sei', 'Não sei'],
] as const;
export const PED_BEHAVIOR = [
  ['calmo', 'Calmo'],
  ['ansioso', 'Ansioso'],
  ['medo-dentistas', 'Medo de dentistas'],
  ['abordagem-especial', 'Necessita de abordagem especial'],
] as const;
export const PED_BRUSHINGS = [
  ['1', '1'],
  ['2', '2'],
  ['3+', '3 ou mais'],
] as const;
export const FREQ3 = [
  ['nunca', 'Nunca'],
  ['raro', 'Raro'],
  ['frequente', 'Frequente'],
] as const;

// --- Harmonização Orofacial ---
export const SMILE_SATISFACTION = [
  ['muito-satisfeito', 'Muito satisfeito'],
  ['satisfeito', 'Satisfeito'],
  ['pouco-satisfeito', 'Pouco satisfeito'],
  ['insatisfeito', 'Insatisfeito'],
] as const;
export const HOF_IMPROVE = [
  ['cor-dentes', 'Cor dos dentes'],
  ['alinhamento', 'Alinhamento'],
  ['forma-dentes', 'Forma dos dentes'],
  ['gengiva', 'Gengiva'],
  ['volume-labial', 'Volume labial'],
  ['simetria-facial', 'Simetria facial'],
  ['harmonizacao-facial', 'Harmonização facial'],
  ['rugas', 'Rugas'],
] as const;
export const HOF_PROCEDURES = [
  ['botox', 'Toxina Botulínica (Botox)'],
  ['acido-hialuronico', 'Ácido Hialurónico (Preenchimento)'],
  ['bioestimuladores', 'Bio Estimuladores de Colagénio'],
  ['fios-sustentacao', 'Fios de Sustentação'],
  ['microagulhamento', 'Micro-Agulhamento'],
  ['peeling-laser', 'Peeling / Laser'],
  ['nenhum', 'Nenhum'],
] as const;
export const HOF_CONTRAINDICATIONS = [
  ['gravidez-amamentacao', 'Gravidez ou amamentação'],
  ['herpes-labial', 'Herpes labial recorrente'],
  ['doencas-autoimunes', 'Doenças autoimunes'],
  ['disfuncao-coagulacao', 'Disfunção da coagulação'],
  ['anticoagulantes', 'Em uso de anticoagulantes'],
  ['queloides', 'Tendência para queloides'],
] as const;

type Catalog = readonly (readonly [string, string])[];
export const labelOf = (cat: Catalog, key: string) =>
  cat.find(([k]) => k === key)?.[1] ?? key;
const keysOf = (cat: Catalog) => cat.map(([k]) => k) as [string, ...string[]];

// -----------------------------------------------------------------------------
// Schema Zod — o que se guarda em ClinicalRecord.questionnaire.data
// -----------------------------------------------------------------------------
const text = (max: number) =>
  z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().default(null),
  );
const yesNo = z.preprocess(
  v => (v === 'sim' ? true : v === 'nao' ? false : null),
  z.boolean().nullable().default(null),
);
const oneOf = (cat: Catalog) =>
  z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.enum(keysOf(cat)).nullable().default(null),
  );
const manyOf = (cat: Catalog) =>
  z.preprocess(
    v => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
    z.array(z.enum(keysOf(cat))).default([]),
  );
const dateStr = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .nullable()
    .default(null),
);

export const generalSchema = z.object({
  reason: text(300), // motivo da consulta
  conditions: manyOf(CONDITIONS),
  conditionsOther: text(200),
  surgeryLast12m: yesNo,
  surgeryWhich: text(200),
  anesthesiaBefore: yesNo,
  anesthesiaWhich: text(200),
  anesthesiaReaction: yesNo,
  anesthesiaReactionWhich: text(200),
  medicalObservations: text(500),
  takesMedication: yesNo,
  medicationWhich: text(300),
  takesSupplements: yesNo,
  supplementsWhich: text(300),
  allergies: manyOf(ALLERGIES),
  allergiesOther: text(200),
  lastDentalVisit: dateStr,
  frequency: oneOf(DENTAL_FREQUENCY),
  treatmentsDone: manyOf(TREATMENTS_DONE),
  treatmentsOther: text(200),
  brushingsPerDay: text(40),
  flossDaily: yesNo,
  interdentalBrushes: yesNo,
  mouthwash: yesNo,
  has: manyOf(ORAL_HAS),
  symptoms: manyOf(ORAL_SYMPTOMS),
  symptomsOther: text(200),
});

export const pediatricSchema = z.object({
  habits: manyOf(PED_HABITS),
  habitsOther: text(120),
  breathing: oneOf(PED_BREATHING),
  nocturnalBruxism: oneOf(YES_NO_UNKNOWN),
  clenching: oneOf(YES_NO_UNKNOWN),
  speechSwallow: oneOf(YES_NO_UNKNOWN),
  sleepProblems: yesNo,
  sleepWhich: text(200),
  behavior: manyOf(PED_BEHAVIOR),
  behaviorOther: text(120),
  negativeExperience: yesNo,
  negativeWhich: text(200),
  childhoodDiseases: yesNo,
  childhoodWhich: text(200),
  allergies: yesNo,
  allergiesWhich: text(200),
  infectious: yesNo,
  infectiousWhich: text(200),
  brushedBy: text(120),
  brushingsPerDay: oneOf(PED_BRUSHINGS),
  floss: yesNo,
  fluorideToothpaste: yesNo,
  sugar: oneOf(FREQ3),
  sodas: oneOf(FREQ3),
  dietRestrictions: yesNo,
  dietWhich: text(200),
});

export const aestheticSchema = z.object({
  satisfaction: oneOf(SMILE_SATISFACTION),
  improve: manyOf(HOF_IMPROVE),
  procedures: manyOf(HOF_PROCEDURES),
  proceduresOther: text(120),
  contraindications: manyOf(HOF_CONTRAINDICATIONS),
});

export const questionnaireSchema = z.object({
  general: generalSchema,
  pediatric: pediatricSchema.nullable().default(null),
  aesthetic: aestheticSchema.nullable().default(null),
});
export type QuestionnaireData = z.infer<typeof questionnaireSchema>;
export type GeneralData = z.infer<typeof generalSchema>;
export type PediatricData = z.infer<typeof pediatricSchema>;
export type AestheticData = z.infer<typeof aestheticSchema>;

export const QUESTIONNAIRE_VERSION = 1;

/**
 * FormData → objeto por prefixo ("g.conditions", "p.habits", "a.improve").
 * Checkboxes com o mesmo name chegam repetidos → getAll.
 */
export function parseQuestionnaireForm(fd: FormData): QuestionnaireData {
  const pick = (prefix: string) => {
    const obj: Record<string, unknown> = {};
    for (const key of new Set(Array.from(fd.keys()))) {
      if (!key.startsWith(prefix + '.')) continue;
      const isList = key.endsWith('[]');
      const field = key.slice(prefix.length + 1, isList ? -2 : undefined);
      const all = fd.getAll(key).map(v => String(v));
      // listas ("[]") são sempre array, mesmo com um só valor
      obj[field] = isList ? all : (all[0] ?? '');
    }
    return obj;
  };
  const includePediatric = fd.get('includePediatric') === 'on';
  const includeAesthetic = fd.get('includeAesthetic') === 'on';
  const raw = {
    general: pick('g'),
    pediatric: includePediatric ? pick('p') : null,
    aesthetic: includeAesthetic ? pick('a') : null,
  };
  return questionnaireSchema.parse(raw);
}

// -----------------------------------------------------------------------------
// Validade — E19: "deverá despoletar um aviso anualmente"
// -----------------------------------------------------------------------------
export const ANAMNESIS_VALID_DAYS = 365;

export type AnamnesisStatus =
  | { state: 'missing' }
  | { state: 'expired'; completedAt: Date; days: number }
  | { state: 'unreviewed'; completedAt: Date } // preenchida pelo paciente, sem revisão do médico
  | { state: 'ok'; completedAt: Date; daysLeft: number };

export function anamnesisStatus(
  q:
    | {
        completedAt?: Date | null;
        completedByRole?: string | null;
        reviewedAt?: Date | null;
      }
    | null
    | undefined,
  now = new Date(),
): AnamnesisStatus {
  if (!q?.completedAt) return { state: 'missing' };
  const days = Math.floor(
    (now.getTime() - new Date(q.completedAt).getTime()) / 86_400_000,
  );
  if (days >= ANAMNESIS_VALID_DAYS) {
    return { state: 'expired', completedAt: q.completedAt, days };
  }
  if (q.completedByRole === 'patient' && !q.reviewedAt) {
    return { state: 'unreviewed', completedAt: q.completedAt };
  }
  return {
    state: 'ok',
    completedAt: q.completedAt,
    daysLeft: ANAMNESIS_VALID_DAYS - days,
  };
}

export const ANAMNESIS_STATUS_LABEL: Record<AnamnesisStatus['state'], string> =
  {
    missing: 'Anamnese em falta',
    expired: 'Anamnese desatualizada (mais de 1 ano)',
    unreviewed: 'Anamnese preenchida pelo paciente — por validar pelo médico',
    ok: 'Anamnese válida',
  };

/**
 * Deriva os ALERTAS DE SEGURANÇA (banner da consulta) a partir do
 * questionário: alergias marcadas + "outra", condições marcadas + "outra".
 * A ação faz UNIÃO com o que o médico já tinha — nunca remove.
 */
export function deriveSafetyAlerts(q: QuestionnaireData): {
  allergies: string[];
  conditions: { condition: string; detail: string | null }[];
  medications: string[];
} {
  const allergies = q.general.allergies.map(k => labelOf(ALLERGIES, k));
  if (q.general.allergiesOther) allergies.push(q.general.allergiesOther);
  if (q.pediatric?.allergies && q.pediatric.allergiesWhich) {
    allergies.push(q.pediatric.allergiesWhich);
  }
  const conditions = q.general.conditions.map(k => ({
    condition: labelOf(CONDITIONS, k),
    detail: null,
  }));
  if (q.general.conditionsOther) {
    conditions.push({ condition: q.general.conditionsOther, detail: null });
  }
  const medications: string[] = [];
  if (q.general.takesMedication && q.general.medicationWhich) {
    medications.push(q.general.medicationWhich);
  }
  return { allergies, conditions, medications };
}
