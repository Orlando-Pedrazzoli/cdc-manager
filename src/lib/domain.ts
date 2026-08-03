// 📄 src/lib/domain.ts
// =============================================================================
// CDC Manager — Constantes de DOMÍNIO partilhadas client ↔ server
// -----------------------------------------------------------------------------
// CONVENÇÃO (obrigatória): qualquer enum/constante de domínio que um Client
// Component precise em RUNTIME vive AQUI — nunca num model. Os models importam
// mongoose, e importar um VALOR de um model num 'use client' arrasta o
// mongoose inteiro para o bundle do browser (rebenta com "Can't resolve
// 'async_hooks'", porque mongoose só corre em Node).
//
// Regras:
//   · Este ficheiro tem ZERO imports — importável de qualquer lado
//   · Os models importam daqui e RE-EXPORTAM (código server continua a poder
//     importar do model; nada quebra)
//   · `import type { X } from '@/models/...'` em client components é SEGURO
//     (tipos são apagados na compilação) — o problema são só os VALORES
//
// À medida que o Sprint 3 avança, TOOTH_STATUS / FACE_CONDITIONS / etc.
// migram para aqui quando o Odontograma (client) precisar deles.
// =============================================================================

/** Especialidades praticadas nas clínicas (valores canónicos do domínio) */
export const SPECIALTIES = [
  'dentisteria',
  'estetica-dentaria',
  'endodontia',
  'implantologia',
  'odontopediatria',
  'ortodontia',
  'periodontologia',
  'proteses-dentarias',
  'higiene-oral',
  'harmonizacao-orofacial',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

/**
 * Condições sistémicas relevantes em medicina dentária (checklist da
 * anamnese). Valores canónicos guardados no ClinicalRecord; o detalhe
 * livre por condição vive ao lado no sub-schema.
 */
export const SYSTEMIC_CONDITIONS = [
  'diabetes',
  'hipertensao',
  'doenca-cardiaca',
  'protese-valvular',
  'problemas-coagulacao',
  'anticoagulantes',
  'bifosfonatos-osteoporose',
  'epilepsia',
  'asma',
  'hepatite',
  'hiv',
  'gravidez',
  'alergia-anestesicos',
  'refluxo-gastrico',
] as const;
export type SystemicCondition = (typeof SYSTEMIC_CONDITIONS)[number];

export const SYSTEMIC_CONDITION_LABEL: Record<SystemicCondition, string> = {
  diabetes: 'Diabetes',
  hipertensao: 'Hipertensão',
  'doenca-cardiaca': 'Doença cardíaca',
  'protese-valvular': 'Prótese valvular cardíaca',
  'problemas-coagulacao': 'Problemas de coagulação',
  anticoagulantes: 'Toma anticoagulantes',
  'bifosfonatos-osteoporose': 'Bifosfonatos / osteoporose',
  epilepsia: 'Epilepsia',
  asma: 'Asma',
  hepatite: 'Hepatite',
  hiv: 'HIV',
  gravidez: 'Gravidez',
  'alergia-anestesicos': 'Alergia a anestésicos',
  'refluxo-gastrico': 'Refluxo gástrico',
};
