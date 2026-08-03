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

// =============================================================================
// ODONTOGRAMA — estados de dente, condições de face e faces (notação FDI)
// Canónicos aqui (o Odontograma é client); models/Odontogram re-exporta.
// =============================================================================

export const TOOTH_STATUS = [
  'present', // são/presente
  'missing', // ausente
  'implant',
  'crown',
  'bridge-pontic', // pôntico de ponte
  'root-only', // resto radicular
  'to-extract',
] as const;
export type ToothStatus = (typeof TOOTH_STATUS)[number];

export const TOOTH_STATUS_LABEL: Record<ToothStatus, string> = {
  present: 'Presente',
  missing: 'Ausente',
  implant: 'Implante',
  crown: 'Coroa',
  'bridge-pontic': 'Pôntico de ponte',
  'root-only': 'Resto radicular',
  'to-extract': 'A extrair',
};

export const FACE_CONDITIONS = [
  'caries',
  'restoration', // restauração existente
  'fracture',
  'sealant',
  'wear', // desgaste/erosão
] as const;
export type FaceCondition = (typeof FACE_CONDITIONS)[number];

export const FACE_CONDITION_LABEL: Record<FaceCondition, string> = {
  caries: 'Cárie',
  restoration: 'Restauração',
  fracture: 'Fratura',
  sealant: 'Selante',
  wear: 'Desgaste',
};

export const TOOTH_FACES = ['O', 'M', 'D', 'V', 'L'] as const;
export type ToothFace = (typeof TOOTH_FACES)[number];

export const TOOTH_FACE_LABEL: Record<ToothFace, string> = {
  O: 'Oclusal',
  M: 'Mesial',
  D: 'Distal',
  V: 'Vestibular',
  L: 'Lingual/Palatina',
};

/** Dentição definitiva na ordem de exibição do odontograma (FDI) */
export const UPPER_TEETH = [
  '18',
  '17',
  '16',
  '15',
  '14',
  '13',
  '12',
  '11',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
] as const;
export const LOWER_TEETH = [
  '48',
  '47',
  '46',
  '45',
  '44',
  '43',
  '42',
  '41',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
] as const;

// =============================================================================
// COBRANÇA — meios de pagamento no balcão (client: CheckoutModal)
// =============================================================================
export const PAYMENT_METHODS = [
  'cash', // numerário
  'card', // multibanco/cartão no TPA
  'mbway', // MB WAY
  'transfer', // transferência bancária
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Numerário',
  card: 'Multibanco / cartão',
  mbway: 'MB WAY',
  transfer: 'Transferência',
};
