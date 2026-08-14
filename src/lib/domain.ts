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
  // Acrescentadas na importação da tabela real do Dentoral (ago/2026):
  // CIRURGIA ORAL tem 111 atos e IMAGIOLOGIA 36 — especialidades reais
  // sem correspondência no enum original.
  'cirurgia-oral',
  'imagiologia',
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
// CATÁLOGO DE ATOS — constantes partilhadas (client: forms de Configurações)
// Canónicos aqui; models/TreatmentType re-exporta.
// =============================================================================

/** Granularidade da grelha de slots (minutos) — regra global do motor */
export const SLOT_GRANULARITY_MIN = 15;

export const DURATION_SOURCES = [
  'benchmark',
  'clinic-confirmed',
  // Atos vindos da tabela de preços real do Dentoral (import ago/2026).
  // Ficam com banner amarelo no catálogo até a clínica confirmar
  // duração/flags → passam a 'clinic-confirmed'.
  'imported',
] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];

export const DURATION_SOURCE_LABEL: Record<DurationSource, string> = {
  benchmark: 'Benchmark',
  'clinic-confirmed': 'Confirmado pela clínica',
  imported: 'Importado do Dentoral',
};

/**
 * Tipos de tratamento do Dentoral (22 categorias, verbatim do report da
 * tabela de preços). Guardados em TreatmentType.category como TEXTO (não
 * enum) — fidelidade total ao sistema antigo, familiares ao Victor, e a
 * clínica pode criar categorias novas sem deploy (datalist no form, como
 * as famílias do stock). Esta lista alimenta o datalist e os filtros.
 */
export const TREATMENT_CATEGORIES = [
  'CIRURGIA ORAL',
  'CONSULTAS',
  'DENTISTERIA OPERATORIA',
  'DIVERSOS DE PROTESE',
  'ENDODONTIA - SESSAO MULTIPLA',
  'ENDODONTIA - SESSAO UNICA',
  'HARMONIZAÇÃO OROFACIAL',
  'IMAGIOLOGIA',
  'IMPLANTOLOGIA',
  'MEDICINA DENTARIA PREVENTIVA',
  'MICROCIRURGIA ENDODÔNTICA',
  'OCLUSAO',
  'ORTODONTIA',
  'PERIODONTOLOGIA',
  'PROTESE ACRILICA',
  'PROTESE CROMO COBALTO',
  'PROTESE EM NYLON',
  'PROTESE EM TITANIO',
  'PROTESE FIXA',
  'RETRATAMENTO - SESSAO MULTIPLA',
  'RETRATAMENTO - SESSAO UNICA',
  'TRATAMENTO FACIAL',
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

// =============================================================================
// STOCK — constantes partilhadas (client: forms do módulo Stock)
// Canónicas aqui; models Product/StockMovement re-exportam.
// =============================================================================

export const PRODUCT_UNITS = ['un', 'ml', 'g', 'caixa'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_UNIT_LABEL: Record<ProductUnit, string> = {
  un: 'Unidade',
  ml: 'Mililitro (ml)',
  g: 'Grama (g)',
  caixa: 'Caixa',
};

export const STOCK_MOVEMENT_TYPES = [
  'purchase',
  'consumption',
  'adjustment-in',
  'adjustment-out',
  'transfer-in',
  'transfer-out',
  'waste',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Tipos que somam ao saldo; os restantes subtraem */
export const STOCK_INBOUND_TYPES: readonly StockMovementType[] = [
  'purchase',
  'adjustment-in',
  'transfer-in',
] as const;

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  purchase: 'Compra',
  consumption: 'Consumo',
  'adjustment-in': 'Acerto (+)',
  'adjustment-out': 'Acerto (−)',
  'transfer-in': 'Transferência (entrada)',
  'transfer-out': 'Transferência (saída)',
  waste: 'Quebra / validade',
};

/** Tipos que a receção regista manualmente nos modais Entrada/Saída */
export const MANUAL_IN_TYPES = ['purchase', 'adjustment-in'] as const;
export const MANUAL_OUT_TYPES = [
  'consumption',
  'adjustment-out',
  'waste',
] as const;

// -----------------------------------------------------------------------------
// DOCUMENTOS CLÍNICOS (migrado de models/Document.ts — o client precisa das
// categorias em runtime no select de upload; o model importa daqui e
// RE-EXPORTA, código server continua a importar do model)
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// ESTADO CIVIL do paciente (paridade Dentoral — ficha do paciente)
// -----------------------------------------------------------------------------
export const MARITAL_STATUSES = [
  'solteiro',
  'casado',
  'uniao-de-facto',
  'divorciado',
  'viuvo',
  'outro',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABEL: Record<MaritalStatus, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  'uniao-de-facto': 'União de facto',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  outro: 'Outro',
};

export const DOCUMENT_CATEGORIES = [
  'xray', // radiografia (periapical, panorâmica)
  'cbct', // TAC / CBCT
  'photo', // fotografia clínica
  'consent', // consentimento informado assinado
  'report', // relatório/carta externa
  'prescription', // receita (PDF gerado)
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  xray: 'Radiografia',
  cbct: 'TAC / CBCT',
  photo: 'Fotografia clínica',
  consent: 'Consentimento assinado',
  report: 'Relatório externo',
  prescription: 'Receita',
  other: 'Outro',
};

// -----------------------------------------------------------------------------
// Raio-X — pedidos do médico à sala de RX (módulo de imagiologia)
// -----------------------------------------------------------------------------
// Modalidades alinhadas com o equipamento real das clínicas (email PCM
// 05/08/2026): sensores intraorais MyRay/RVG5200 (periapical, bitewing) e
// panorâmica Kodak/Carestream.
export const RX_MODALITIES = ['periapical', 'bitewing', 'panoramica'] as const;
export type RxModality = (typeof RX_MODALITIES)[number];

export const RX_MODALITY_LABEL: Record<RxModality, string> = {
  periapical: 'Periapical',
  bitewing: 'Bitewing (interproximal)',
  panoramica: 'Panorâmica',
};

// Máquina de estados do pedido: o médico pede na consulta; o operador da
// sala de RX inicia e conclui; o médico pode cancelar enquanto não iniciado.
export const RX_STATUS = [
  'requested', // pedido pelo médico; na fila da sala de RX
  'in-progress', // operador iniciou a captação
  'done', // captado; imagens ficarão associadas (ponte iRYS/CS Imaging)
  'cancelled', // cancelado pelo médico antes de iniciado (nunca apagamos)
] as const;
export type RxStatus = (typeof RX_STATUS)[number];

export const RX_STATUS_LABEL: Record<RxStatus, string> = {
  requested: 'Pedido',
  'in-progress': 'Em captação',
  done: 'Concluído',
  cancelled: 'Cancelado',
};

export const RX_TRANSITIONS: Record<RxStatus, RxStatus[]> = {
  requested: ['in-progress', 'done', 'cancelled'], // done direto: captação rápida
  'in-progress': ['done'],
  done: [],
  cancelled: [],
};

export function canTransitionRx(from: RxStatus, to: RxStatus): boolean {
  return RX_TRANSITIONS[from]?.includes(to) ?? false;
}

// Texto legal do consentimento RX (art. 101º DL 108/2018) — o MESMO que o
// Dentoral embutia no nome dos 31 atos de imagiologia (desdobrado na
// importação para TreatmentType.notes). Snapshot guardado no Document de
// cada consentimento assinado — prova imutável do texto apresentado.
export const RX_CONSENT_LEGAL_TEXT =
  'Paciente consente o exame consoante as orientações de benefícios e ' +
  'riscos (cfr. artigo 101º do DL 108/2018).';
