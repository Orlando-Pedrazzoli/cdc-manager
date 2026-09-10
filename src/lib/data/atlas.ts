// 📄 src/lib/data/atlas.ts
// =============================================================================
// CDC Manager — Atlas Dentário: conteúdo clínico-educativo
// -----------------------------------------------------------------------------
// Base de dados da página /doutor/atlas — a ferramenta de "cadeira": o
// médico abre à frente do paciente, seleciona o dente da queixa e o
// sintoma, e explica com linguagem simples as causas possíveis e o que a
// radiografia revela que o olho não vê. O objetivo é CONSENTIMENTO
// INFORMADO visual — informação honesta convence melhor do que pressão.
//
// Fontes do conteúdo: conhecimento clínico consolidado (pulpite
// reversível/irreversível, síndrome do dente fissurado — ~5% dos adultos/
// ano, mais comum em molares inferiores e dentes restaurados —, abcessos
// periapicais/periodontais, pericoronarite, periodontite, dor referida do
// seio maxilar). Conteúdo EDUCATIVO de apoio — o diagnóstico é sempre do
// médico, na consulta.
// =============================================================================

// --- Anatomia por posição no quadrante (último dígito FDI) -------------------
export type ToothAnatomy = {
  /** Nome anatómico (sem lateralidade) */
  name: string;
  /** Função mastigatória em linguagem simples */
  role: string;
  /** Raízes e canais — superior vs inferior quando difere */
  roots: { upper: string; lower: string };
  /** Nota clínica relevante para a conversa de cadeira */
  note: string | null;
};

export const TOOTH_ANATOMY: Record<number, ToothAnatomy> = {
  1: {
    name: 'Incisivo central',
    role: 'Corta os alimentos e define o sorriso',
    roots: { upper: '1 raiz · 1 canal', lower: '1 raiz · 1 canal' },
    note: 'Muito exposto a pancadas e fraturas — qualquer traumatismo aqui justifica radiografia para ver a raiz.',
  },
  2: {
    name: 'Incisivo lateral',
    role: 'Corta os alimentos, ao lado do central',
    roots: { upper: '1 raiz · 1 canal', lower: '1 raiz · 1 canal' },
    note: 'Raiz fina — fissuras e lesões na ponta da raiz podem não doer durante muito tempo.',
  },
  3: {
    name: 'Canino',
    role: 'Rasga os alimentos e guia a mordida',
    roots: { upper: '1 raiz · 1 canal', lower: '1 raiz · 1 canal' },
    note: 'A raiz mais longa da boca — é o "pilar" da arcada; desgaste aqui altera toda a mordida.',
  },
  4: {
    name: '1.º pré-molar',
    role: 'Começa a triturar os alimentos',
    roots: {
      upper: 'Frequentemente 2 raízes · 2 canais',
      lower: '1 raiz · 1–2 canais',
    },
    note: 'No superior, a segunda raiz só se vê na radiografia — importa para qualquer tratamento.',
  },
  5: {
    name: '2.º pré-molar',
    role: 'Tritura os alimentos com o 1.º pré-molar',
    roots: { upper: '1 raiz · 1–2 canais', lower: '1 raiz · 1–2 canais' },
    note: 'A variação do número de canais é comum — a radiografia é o mapa antes de tratar.',
  },
  6: {
    name: '1.º molar',
    role: 'O principal "moinho" da mastigação',
    roots: {
      upper: '3 raízes · 3–4 canais (perto do seio maxilar)',
      lower: '2 raízes · 3–4 canais',
    },
    note: 'É o primeiro dente definitivo a nascer (~6 anos) e o que mais trabalha — o mais tratado de toda a boca.',
  },
  7: {
    name: '2.º molar',
    role: 'Reforça a trituração ao fundo',
    roots: {
      upper: '3 raízes · 3–4 canais (perto do seio maxilar)',
      lower: '2 raízes · 3–4 canais',
    },
    note: 'Zona difícil de limpar e de ver — cáries entre dentes aqui são achado frequente de radiografia.',
  },
  8: {
    name: 'Dente do siso (3.º molar)',
    role: 'O último a nascer (17–25 anos) — nem sempre tem espaço',
    roots: {
      upper: 'Anatomia muito variável',
      lower: 'Anatomia muito variável · próximo do nervo alveolar',
    },
    note: 'Frequentemente incluso ou semi-incluso — a posição real e a relação com o nervo só se veem na panorâmica.',
  },
};

// --- Sintomas (chips) e causas possíveis -------------------------------------
export type CauseSignal = 'reversivel' | 'atencao' | 'urgente';

export type Cause = {
  title: string;
  /** Explicação de cadeira, em linguagem de paciente */
  explain: string;
  /** O que a radiografia mostra neste cenário */
  rx: string;
  signal: CauseSignal;
  /** Restringe a posições FDI (1–8); ausente = qualquer dente */
  positions?: number[];
  /** Restringe à arcada; ausente = ambas */
  arch?: 'upper' | 'lower';
};

export type Symptom = {
  id: string;
  label: string;
  /** Pergunta de cadeira que o médico faz ao paciente */
  ask: string;
  causes: Cause[];
};

export const SYMPTOMS: Symptom[] = [
  {
    id: 'frio-doce',
    label: 'Sensibilidade ao frio / doce',
    ask: 'A dor é curta e passa logo que o estímulo desaparece?',
    causes: [
      {
        title: 'Retração da gengiva com raiz exposta',
        explain:
          'A gengiva recuou e deixou a raiz — que não tem esmalte — a descoberto. O frio e o doce tocam diretamente no dente "vivo".',
        rx: 'A radiografia mostra o nível do osso de suporte e exclui cárie escondida na zona.',
        signal: 'reversivel',
      },
      {
        title: 'Cárie em fase inicial',
        explain:
          'Uma cárie a atravessar o esmalte começa por dar exatamente esta sensibilidade — antes de doer "a sério".',
        rx: 'A radiografia apanha cáries entre os dentes e por baixo de restaurações antigas, invisíveis a olho nu — e mostra a que distância estão do nervo.',
        signal: 'atencao',
      },
      {
        title: 'Inflamação reversível do nervo (pulpite reversível)',
        explain:
          'O nervo está irritado mas ainda recupera — se tratarmos a causa agora, o dente salva-se sem desvitalizar.',
        rx: 'A radiografia confirma a profundidade da causa (cárie ou restauração funda) e que a ponta da raiz ainda está saudável.',
        signal: 'atencao',
      },
    ],
  },
  {
    id: 'dor-prolongada',
    label: 'Dor prolongada / noturna',
    ask: 'A dor continua depois do estímulo, aparece sozinha ou acorda-o de noite?',
    causes: [
      {
        title: 'Inflamação irreversível do nervo (pulpite irreversível)',
        explain:
          'O nervo do dente está inflamado sem retorno — a dor espontânea e noturna é o sinal típico. O dente salva-se, mas normalmente com desvitalização.',
        rx: 'A radiografia mostra a cárie a chegar ao nervo e o estado da ponta da raiz — e é o mapa dos canais para o tratamento.',
        signal: 'urgente',
      },
      {
        title: 'Infeção na ponta da raiz em formação',
        explain:
          'Quando o nervo morre, a infeção desce para o osso na ponta da raiz — pode estar a crescer em silêncio há meses.',
        rx: 'É EXATAMENTE isto que a radiografia revela antes de haver inchaço: uma sombra escura na ponta da raiz que o olho nunca veria.',
        signal: 'urgente',
      },
    ],
  },
  {
    id: 'mastigar',
    label: 'Dor ao morder / mastigar',
    ask: 'Dói ao trincar em algo duro, às vezes só num ponto certo?',
    causes: [
      {
        title: 'Dente fissurado (fenda invisível)',
        explain:
          'Uma fissura fina abre ao mastigar e fecha logo — dor num ponto, difícil de localizar. Afeta ~5% dos adultos por ano, sobretudo molares inferiores e dentes com restaurações grandes.',
        rx: 'A inspeção visual não chega — a radiografia avalia a profundidade, o estado do nervo e exclui fratura da raiz.',
        signal: 'atencao',
        positions: [4, 5, 6, 7],
      },
      {
        title: 'Inflamação do ligamento na ponta da raiz',
        explain:
          'O "amortecedor" que segura o dente está inflamado — geralmente porque a infeção do nervo já chegou ao osso.',
        rx: 'A radiografia mostra o espaço do ligamento alargado e alterações no osso à volta da raiz.',
        signal: 'urgente',
      },
      {
        title: 'Restauração ou coroa alta',
        explain:
          'Um "chumbo" ou coroa meio milímetro acima do normal faz o dente bater primeiro — e doer ao mastigar.',
        rx: 'A radiografia confirma que não há infeção por baixo antes de simplesmente ajustar a altura.',
        signal: 'reversivel',
      },
    ],
  },
  {
    id: 'inchaco',
    label: 'Inchaço / abcesso / mau sabor',
    ask: 'Há inchaço na gengiva ou na cara, uma "borbulha" que rebenta, ou mau sabor?',
    causes: [
      {
        title: 'Abcesso na ponta da raiz (periapical)',
        explain:
          'Infeção com pus a partir de um nervo morto. Pode doer muito — ou quase nada, se o pus encontrar por onde drenar. Sem tratamento, a infeção pode espalhar-se.',
        rx: 'A radiografia mostra a dimensão real da infeção no osso e qual o dente de origem — nem sempre é o que parece à vista.',
        signal: 'urgente',
      },
      {
        title: 'Abcesso da gengiva (periodontal)',
        explain:
          'A infeção vem da "bolsa" entre a gengiva e o dente, não do nervo — o tratamento é completamente diferente.',
        rx: 'A radiografia distingue os dois tipos de abcesso ao mostrar de onde vem a perda de osso — e disso depende o tratamento certo.',
        signal: 'urgente',
      },
    ],
  },
  {
    id: 'gengiva',
    label: 'Gengiva a sangrar / dente a abanar',
    ask: 'A gengiva sangra ao escovar? Sente algum dente menos firme?',
    causes: [
      {
        title: 'Gengivite',
        explain:
          'Inflamação só da gengiva, causada pela placa bacteriana — totalmente reversível com higienização profissional e boa escovagem.',
        rx: 'A radiografia confirma que o osso por baixo ainda está intacto — é a fronteira entre gengivite e periodontite.',
        signal: 'reversivel',
      },
      {
        title: 'Periodontite (perda do osso de suporte)',
        explain:
          'A inflamação já desceu ao osso que segura os dentes. O osso perdido não volta — mas o processo trava-se, e quanto mais cedo, mais dente se salva.',
        rx: 'A radiografia mede exatamente quanto osso resta em cada dente — é o mapa que define o plano de tratamento.',
        signal: 'urgente',
      },
    ],
  },
  {
    id: 'trauma',
    label: 'Pancada / fratura / desgaste',
    ask: 'Houve uma queda ou pancada? Partiu um bocado? Range os dentes?',
    causes: [
      {
        title: 'Fratura da coroa ou da raiz',
        explain:
          'A parte visível pode estar inteira e a raiz partida — ou o contrário. O destino do dente depende de onde passa a linha de fratura.',
        rx: 'Só a radiografia mostra fraturas da raiz e desvios do dente no osso — decide entre restaurar, desvitalizar ou extrair.',
        signal: 'urgente',
        positions: [1, 2, 3],
      },
      {
        title: 'Dente "morto" silencioso pós-trauma',
        explain:
          'Depois de uma pancada, o nervo pode morrer meses ou anos mais tarde sem doer — o dente vai escurecendo e a infeção instala-se em silêncio.',
        rx: 'A radiografia de controlo apanha estas lesões silenciosas na ponta da raiz muito antes de darem sintomas.',
        signal: 'atencao',
      },
      {
        title: 'Bruxismo (ranger/apertar os dentes)',
        explain:
          'Apertar e ranger — sobretudo a dormir — desgasta, lasca e fissura os dentes, e sobrecarrega a articulação da mandíbula.',
        rx: 'A radiografia avalia o desgaste, fissuras associadas e o efeito da sobrecarga no osso e nas articulações.',
        signal: 'atencao',
      },
    ],
  },
  {
    id: 'desvitalizado',
    label: 'Dente com canal feito — partiu / voltou a doer',
    ask: 'O dente já foi desvitalizado e agora partiu, escureceu, tem mau sabor ou voltou a incomodar?',
    causes: [
      {
        title: 'Fratura do dente desvitalizado',
        explain:
          'Um dente sem nervo fica mais seco e quebradiço — e normalmente já perdeu muita estrutura antes do canal. Partir uma parede ou uma cúspide é o desfecho mais comum destes dentes. Nota importante: como o nervo foi removido, o dente NÃO avisa com sensibilidade ao frio — a dor, quando existe, vem do ligamento e do osso à volta.',
        rx: 'A radiografia mostra até onde chega a linha de fratura — se fica na coroa, o dente reconstrói-se (normalmente com coroa); se atinge a raiz, muda tudo.',
        signal: 'atencao',
      },
      {
        title: 'Infiltração marginal (o selamento deixou de vedar)',
        explain:
          'Com o tempo, a restauração ou coroa pode "descolar" microscopicamente nas margens. As bactérias entram por essa fenda invisível, criam cárie POR BAIXO da restauração e recontaminam o canal que estava limpo — tudo sem dor, porque não há nervo para avisar.',
        rx: 'A radiografia apanha a cárie escondida sob a restauração/coroa e avalia a qualidade do tratamento de canal existente (comprimento, falhas, canais por tratar) — impossível de ver na consulta.',
        signal: 'atencao',
      },
      {
        title: 'Reinfeção na ponta da raiz (canal a precisar de retratamento)',
        explain:
          'Se as bactérias voltaram a entrar — por infiltração ou por um canal extra que ficou escondido — a infeção reinstala-se no osso, na ponta da raiz. Cresce em silêncio: muitas vezes o primeiro sinal é uma "borbulha" na gengiva ou um inchaço. As opções vão do retratamento do canal à cirurgia da ponta da raiz — e a extração só em último caso.',
        rx: 'A radiografia mostra a "sombra" da infeção na ponta da raiz e o estado da obturação antiga — é ela que decide entre retratar, operar ou extrair.',
        signal: 'urgente',
      },
      {
        title: 'Fratura vertical da raiz',
        explain:
          'O cenário mais sério dos dentes desvitalizados, sobretudo nos que têm espigão: uma fenda ao alto na própria raiz. Dá sinais discretos — desconforto ao mastigar, uma fístula que aparece e desaparece, uma bolsa funda na gengiva num ponto só. Infelizmente, quando confirmada, o dente raramente se salva — e quanto mais cedo se souber, menos osso se perde para o futuro implante.',
        rx: 'A radiografia mostra o padrão típico de perda de osso ao longo da raiz e a posição do espigão; em casos duvidosos pode ser preciso um exame 3D (CBCT). Sem imagem, este diagnóstico é praticamente impossível.',
        signal: 'urgente',
        positions: [4, 5, 6, 7],
      },
    ],
  },
  {
    id: 'siso',
    label: 'Dor ao fundo da boca (siso)',
    ask: 'Dói atrás de tudo, a gengiva por cima do último dente incha ou custa a abrir a boca?',
    causes: [
      {
        title: 'Pericoronarite (gengiva sobre o siso inflamada)',
        explain:
          'O siso semi-nascido fica com uma "capa" de gengiva onde se acumulam restos e bactérias — inflama, dói e pode infetar.',
        rx: 'A panorâmica mostra a posição real do siso: se vai nascer bem, se está encravado, e se a solução é vigiar ou extrair.',
        signal: 'atencao',
        positions: [8],
      },
      {
        title: 'Siso incluso a empurrar o vizinho',
        explain:
          'Um siso deitado pode pressionar e até cariar a raiz do dente do lado — sem dar qualquer sinal visível.',
        rx: 'Na panorâmica vê-se a inclinação exata, o contacto com o 2.º molar e — nos inferiores — a distância ao nervo, essencial antes de extrair.',
        signal: 'atencao',
        positions: [7, 8],
      },
    ],
  },
];

// Causa extra dependente da arcada: dor referida do seio maxilar
export const SINUS_CAUSE: Cause = {
  title: 'Dor referida do seio maxilar (sinusite)',
  explain:
    'As raízes dos molares superiores ficam encostadas ao seio maxilar — uma sinusite pode "imitar" dor de dentes em vários dentes de cima ao mesmo tempo.',
  rx: 'A panorâmica mostra a relação das raízes com o seio e ajuda a distinguir dor de origem dentária de dor de origem sinusal — evita tratar o dente errado.',
  signal: 'reversivel',
  positions: [5, 6, 7],
  arch: 'upper',
};

// --- O que a radiografia revela (painel geral) -------------------------------
export const RX_REVEALS: { title: string; detail: string }[] = [
  {
    title: 'Cáries escondidas',
    detail:
      'Entre os dentes e por baixo de restaurações antigas — invisíveis a olho nu até estarem grandes.',
  },
  {
    title: 'Infeções silenciosas na raiz',
    detail:
      'A "sombra" na ponta da raiz aparece na radiografia meses antes do inchaço ou da dor forte.',
  },
  {
    title: 'Osso de suporte',
    detail:
      'Quanto osso segura cada dente — a diferença entre gengivite reversível e periodontite.',
  },
  {
    title: 'Fissuras e fraturas da raiz',
    detail:
      'A parte do dente que nunca se vê na consulta — decide se o dente se salva.',
  },
  {
    title: 'O mapa das raízes e canais',
    detail:
      'Número e forma reais — indispensável antes de desvitalizar ou extrair.',
  },
  {
    title: 'Sisos e o nervo',
    detail:
      'Na panorâmica: posição dos sisos, relação com o nervo e com os dentes vizinhos.',
  },
];

// Periapical vs panorâmica — para o médico explicar a escolha do exame
export const RX_TYPES: { name: string; what: string }[] = [
  {
    name: 'RX periapical (pequeno, do dente)',
    what: 'Fotografia detalhada de 1–3 dentes, da coroa à ponta da raiz — o exame do dente da queixa.',
  },
  {
    name: 'Panorâmica (ortopantomografia)',
    what: 'A boca inteira numa imagem: todos os dentes, sisos, ossos e articulações — a visão de conjunto e de planeamento.',
  },
];

export const SIGNAL_META: Record<
  CauseSignal,
  { label: string; bg: string; fg: string }
> = {
  reversivel: { label: 'Reversível', bg: '#E7F6EC', fg: '#1B7A3D' },
  atencao: { label: 'Requer avaliação', bg: '#FFF4E0', fg: '#9A6700' },
  urgente: { label: 'Não adiar', bg: '#FDEDED', fg: '#B3261E' },
};
