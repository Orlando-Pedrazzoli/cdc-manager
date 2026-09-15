// 📄 src/lib/data/atlas-flow.ts
// =============================================================================
// CDC Manager — Atlas Dentário: dados do FLUXO de conversa (v2)
// -----------------------------------------------------------------------------
// Complementa lib/data/atlas.ts (que não muda): para cada sintoma, UMA
// pergunta de seguimento cujas respostas realçam possibilidades; a lista
// "o que estamos a tentar perceber" (respondido na consulta vs. só com RX);
// a recomendação de exame com o PORQUÊ; comparação visual dos exames; e um
// glossário em linguagem simples. Continua a ser uma árvore EDUCATIVA — o
// Atlas não diagnostica nem grava nada.
// =============================================================================

export interface FollowUpOption {
  key: string;
  label: string;
  /** Frase que aparece depois de escolher (em linguagem de paciente) */
  note: string;
  /** Substrings dos títulos das causas a realçar como "frequentemente associado" */
  emphasize: string[];
}
export interface FollowUp {
  question: string;
  options: FollowUpOption[];
}

export const FOLLOW_UPS: Record<string, FollowUp> = {
  'frio-doce': {
    question: 'Quando o frio ou o doce tocam no dente, a dor…',
    options: [
      {
        key: 'curta',
        label: 'Passa logo (segundos)',
        note: 'Uma dor curta que desaparece com o estímulo aponta para irritação da superfície ou do nervo ainda reversível.',
        emphasize: ['Retração', 'Cárie em fase inicial'],
      },
      {
        key: 'fica',
        label: 'Fica alguns segundos a minutos',
        note: 'Quando a dor se prolonga um pouco, o nervo pode já estar inflamado — importa perceber se ainda recupera.',
        emphasize: ['pulpite reversível', 'Cárie'],
      },
      {
        key: 'nao-sei',
        label: 'Não tenho a certeza',
        note: 'Sem problema — o exame clínico e o teste ao frio esclarecem.',
        emphasize: [],
      },
    ],
  },
  'dor-prolongada': {
    question: 'A dor aparece sozinha, sem tocar em nada?',
    options: [
      {
        key: 'espontanea',
        label: 'Sim, e acorda-me de noite',
        note: 'Dor espontânea e noturna é o sinal clássico de nervo inflamado de forma irreversível.',
        emphasize: ['irreversível'],
      },
      {
        key: 'estimulo',
        label: 'Só depois de comer/beber, mas demora a passar',
        note: 'A dor que persiste depois do estímulo indica que o nervo já não está a reagir de forma normal.',
        emphasize: ['irreversível'],
      },
      {
        key: 'latejar',
        label: 'É um latejar constante, com pressão',
        note: 'Latejar constante pode significar que a infeção já chegou à ponta da raiz.',
        emphasize: ['ponta da raiz'],
      },
    ],
  },
  mastigar: {
    question:
      'A dor aparece quando morde, ou principalmente quando larga a mordida?',
    options: [
      {
        key: 'largar',
        label: 'Quando largo a mordida',
        note: 'Dor ao largar é típica de uma fenda no dente que "abre e fecha" ao mastigar.',
        emphasize: ['fissurado'],
      },
      {
        key: 'morder',
        label: 'Quando mordo',
        note: 'Dor ao apertar aponta para o ligamento à volta da raiz ou para um contacto alto.',
        emphasize: ['ligamento', 'coroa alta'],
      },
      {
        key: 'nao-sei',
        label: 'Não tenho a certeza',
        note: 'O teste de mordida na consulta distingue estas situações em poucos segundos.',
        emphasize: [],
      },
    ],
  },
  inchaco: {
    question: 'Onde sente o inchaço?',
    options: [
      {
        key: 'gengiva-dente',
        label: 'Na gengiva, junto à ponta da raiz / "borbulha"',
        note: 'Uma fístula ou inchaço junto à raiz costuma vir do interior do dente.',
        emphasize: ['periapical'],
      },
      {
        key: 'gengiva-bolsa',
        label: 'Na gengiva, entre o dente e a gengiva',
        note: 'Inchaço na "bolsa" da gengiva aponta para uma infeção de origem periodontal.',
        emphasize: ['periodontal'],
      },
      {
        key: 'cara',
        label: 'Na cara / não consigo abrir bem a boca',
        note: 'Inchaço facial é sinal de infeção em expansão — não deve esperar.',
        emphasize: ['periapical'],
      },
    ],
  },
  gengiva: {
    question: 'Além do sangramento, sente algum dente menos firme?',
    options: [
      {
        key: 'so-sangra',
        label: 'Só sangra ao escovar',
        note: 'Sangramento sem mobilidade é, muitas vezes, gengivite — reversível com higiene e limpeza.',
        emphasize: ['Gengivite'],
      },
      {
        key: 'abana',
        label: 'Sim, sinto dentes a abanar',
        note: 'Mobilidade significa que o osso de suporte pode já estar afetado.',
        emphasize: ['Periodontite'],
      },
      {
        key: 'recuou',
        label: 'A gengiva recuou / dentes parecem maiores',
        note: 'A retração é um sinal de perda de suporte que a radiografia mede.',
        emphasize: ['Periodontite'],
      },
    ],
  },
  trauma: {
    question: 'O que aconteceu ao dente?',
    options: [
      {
        key: 'partiu',
        label: 'Partiu um bocado / está solto',
        note: 'Quando se parte, importa saber se a fratura chega à raiz — isso só a radiografia mostra.',
        emphasize: ['Fratura'],
      },
      {
        key: 'escureceu',
        label: 'Levou uma pancada há tempos e escureceu',
        note: 'Um dente que escurece depois de uma pancada pode ter perdido a vitalidade sem doer.',
        emphasize: ['silencioso'],
      },
      {
        key: 'range',
        label: 'Range/aperta os dentes, desgaste',
        note: 'O desgaste por bruxismo afeta vários dentes e a articulação.',
        emphasize: ['Bruxismo'],
      },
    ],
  },
  desvitalizado: {
    question: 'O que mudou no dente desvitalizado?',
    options: [
      {
        key: 'partiu',
        label: 'Partiu',
        note: 'Dentes desvitalizados são mais frágeis — a pergunta é se a fratura envolve a raiz.',
        emphasize: ['Fratura'],
      },
      {
        key: 'sabor',
        label: 'Mau sabor / voltou a incomodar',
        note: 'Pode significar que o selamento deixou de vedar ou que a infeção na raiz voltou.',
        emphasize: ['Infiltração', 'Reinfeção'],
      },
      {
        key: 'morder',
        label: 'Dói ao morder num ponto',
        note: 'Dor localizada ao morder num dente desvitalizado obriga a excluir fratura vertical da raiz.',
        emphasize: ['vertical'],
      },
    ],
  },
  siso: {
    question: 'O que sente ao fundo da boca?',
    options: [
      {
        key: 'gengiva',
        label: 'A gengiva por cima do siso incha / dói a engolir',
        note: 'A gengiva que cobre parcialmente o siso inflama com facilidade — pericoronarite.',
        emphasize: ['Pericoronarite'],
      },
      {
        key: 'pressao',
        label: 'Pressão nos dentes da frente / dor no vizinho',
        note: 'Um siso deitado pode empurrar e danificar o dente ao lado.',
        emphasize: ['incluso'],
      },
      {
        key: 'nada',
        label: 'Nada agora — é para avaliar',
        note: 'Avaliar a posição dos sisos antes de darem problemas é prevenção.',
        emphasize: ['incluso'],
      },
    ],
  },
};

// --- "O que estamos a tentar perceber?" -------------------------------------
export interface InvestigationItem {
  label: string;
  /** 'clinic' = a consulta responde; 'rx' = só a radiografia responde */
  via: 'clinic' | 'rx';
}
export const INVESTIGATION: Record<string, InvestigationItem[]> = {
  'frio-doce': [
    { label: 'Onde está a sensibilidade', via: 'clinic' },
    { label: 'Se há cárie entre os dentes ou sob restaurações', via: 'rx' },
    { label: 'A que distância a cárie está do nervo', via: 'rx' },
    { label: 'O nível do osso e da gengiva', via: 'rx' },
  ],
  'dor-prolongada': [
    { label: 'Se o nervo ainda responde', via: 'clinic' },
    { label: 'Se há infeção na ponta da raiz', via: 'rx' },
    { label: 'Como são as raízes e os canais', via: 'rx' },
  ],
  mastigar: [
    { label: 'Em que dente e em que ponto dói', via: 'clinic' },
    { label: 'Se a mordida está alta', via: 'clinic' },
    { label: 'Se há inflamação na ponta da raiz', via: 'rx' },
    { label: 'Se há fenda ou fratura na raiz', via: 'rx' },
  ],
  inchaco: [
    { label: 'De onde vem o inchaço', via: 'clinic' },
    { label: 'A extensão da infeção no osso', via: 'rx' },
    { label: 'Se o dente pode ser salvo', via: 'rx' },
  ],
  gengiva: [
    { label: 'Como está a gengiva', via: 'clinic' },
    { label: 'Quanto osso segura cada dente', via: 'rx' },
    { label: 'Se há tártaro por baixo da gengiva', via: 'rx' },
  ],
  trauma: [
    { label: 'O que partiu e o que está solto', via: 'clinic' },
    { label: 'Se a raiz está fraturada', via: 'rx' },
    { label: 'Se o dente continua vivo', via: 'clinic' },
  ],
  desvitalizado: [
    { label: 'Se o dente está fraturado', via: 'clinic' },
    { label: 'Se a infeção na raiz voltou', via: 'rx' },
    { label: 'Se a raiz está inteira', via: 'rx' },
  ],
  siso: [
    { label: 'Como está a gengiva sobre o siso', via: 'clinic' },
    { label: 'A posição do siso', via: 'rx' },
    { label: 'A relação com o dente vizinho e com o nervo', via: 'rx' },
  ],
};

// --- Que exame responde à nossa dúvida? ---------------------------------------
export type ExamKind = 'periapical' | 'panoramica';
export interface ExamRecommendation {
  exam: ExamKind;
  why: string;
  /** Focos de interesse (3 no máximo) — para o médico apontar */
  focus: string[];
}
export function recommendExam(
  symptomId: string,
  position: number,
  arch: 'upper' | 'lower',
): ExamRecommendation {
  if (symptomId === 'siso' || position === 8) {
    return {
      exam: 'panoramica',
      why: 'Aqui interessa-nos não só este dente mas a posição do siso, o dente vizinho e, no inferior, a relação com o nervo do maxilar. A panorâmica dá-nos essa visão de conjunto.',
      focus: [
        'posição do siso',
        'dente vizinho',
        arch === 'lower' ? 'nervo do maxilar' : 'seio maxilar',
      ],
    };
  }
  if (symptomId === 'gengiva') {
    return {
      exam: 'panoramica',
      why: 'A doença da gengiva raramente é de um dente só. Queremos ver o nível do osso em toda a boca para saber onde se perdeu suporte.',
      focus: ['osso de suporte', 'tártaro sob a gengiva', 'todos os dentes'],
    };
  }
  if (symptomId === 'trauma' || symptomId === 'inchaco') {
    return {
      exam: 'periapical',
      why: 'Queremos ver este dente com o maior detalhe: a raiz inteira e o osso mesmo à volta, para perceber se há fratura ou infeção.',
      focus: ['raiz', 'osso à volta da raiz', 'fratura'],
    };
  }
  return {
    exam: 'periapical',
    why: 'Queremos observar este dente de perto — da coroa à ponta da raiz — e o osso imediatamente à sua volta.',
    focus: ['coroa e cárie', 'raízes e canais', 'ponta da raiz'],
  };
}

export const EXAM_COMPARE: Record<
  ExamKind,
  { name: string; tagline: string; sees: string[]; scope: string }
> = {
  periapical: {
    name: 'RX do dente (periapical)',
    tagline: 'Vê de perto',
    sees: ['coroa', 'raízes', 'ponta das raízes', 'osso à volta'],
    scope: '1 a 3 dentes',
  },
  panoramica: {
    name: 'Panorâmica',
    tagline: 'Vê a boca como um todo',
    sees: ['todos os dentes', 'sisos', 'maxilares e seios', 'nervo do maxilar'],
    scope: 'a boca inteira',
  },
};

// --- Glossário em linguagem simples ("?") --------------------------------------
export const GLOSSARY: Record<string, string> = {
  periapical:
    'Junto à ponta da raiz, dentro do osso. Uma "lesão periapical" é uma alteração nessa zona, normalmente por inflamação ou infeção que vem do interior do dente.',
  periodontal: 'Do tecido que segura o dente: gengiva, ligamento e osso.',
  periodontite:
    'Doença em que o osso que segura os dentes se vai perdendo. Não dói no início — vê-se na radiografia.',
  gengivite:
    'Inflamação só da gengiva, sem perda de osso. Reversível com limpeza e escovagem.',
  pulpite:
    'Inflamação do nervo do dente (a "polpa"). Pode ser reversível — recupera — ou irreversível — o dente precisa de ser desvitalizado.',
  polpa: 'O interior vivo do dente: nervo e vasos sanguíneos.',
  abcesso:
    'Bolsa de pus criada por uma infeção. Precisa de tratamento — não desaparece sozinha.',
  pericoronarite:
    'Inflamação da gengiva que cobre parcialmente um siso a nascer.',
  incluso:
    'Dente que não conseguiu nascer por completo e ficou dentro do osso ou da gengiva.',
  fístula:
    'Pequena "borbulha" na gengiva por onde a infeção drena. Sinal de infeção crónica na raiz.',
  desvitalizado:
    'Dente a que se removeu o nervo (tratamento de canal). Continua funcional mas fica mais frágil.',
  retratamento: 'Repetir o tratamento de canal quando a infeção voltou.',
  'seio maxilar':
    'Cavidade cheia de ar por cima dos dentes de cima, atrás da bochecha. Uma sinusite pode "imitar" dor de dentes.',
  'nervo alveolar':
    'Nervo que passa dentro do maxilar inferior e dá sensibilidade ao lábio e queixo. Nos sisos inferiores, a proximidade das raízes a este nervo importa para o planeamento.',
  panorâmica:
    'Radiografia que mostra a boca inteira numa só imagem: todos os dentes, maxilares e articulações.',
  bruxismo:
    'Ranger ou apertar os dentes, muitas vezes a dormir, sem dar conta.',
  ligamento: 'Fibras finas que ligam a raiz ao osso e amortecem a mordida.',
  restauração:
    'O "chumbo" ou o composto que preenche um dente depois de tratar uma cárie.',
};

export const SYMPTOM_ICON: Record<string, string> = {
  'frio-doce': '❄️',
  'dor-prolongada': '⚡',
  mastigar: '🦷',
  inchaco: '🔥',
  gengiva: '🩸',
  trauma: '💥',
  desvitalizado: '🔄',
  siso: '🦷',
};
