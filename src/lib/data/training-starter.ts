// 📄 src/lib/data/training-starter.ts
// =============================================================================
// CDC Manager — Conteúdo inicial do Treinamento (8.ª ronda/08)
// -----------------------------------------------------------------------------
// Victor (17/11/2026): "O conteúdo pode ser gerado com o Claude, área a área,
// e depois revisto por nós antes de publicar." Estes textos são carregados
// como RASCUNHO pelo botão "Carregar conteúdo inicial" e só ficam visíveis à
// equipa depois de a gestão os rever e publicar. Descrevem o sistema tal como
// estava a 17/11/2026.
// =============================================================================

import type { KnowledgeAudience } from '@/lib/knowledge';

export interface TrainingStarter {
  slug: string;
  audience: KnowledgeAudience;
  title: string;
  keywords: string;
  body: string;
}

export const TRAINING_STARTER: TrainingStarter[] = [
  {
    slug: 'rececao-01-entrar',
    audience: 'reception',
    title: '1. Entrar no sistema e conhecer o ecrã',
    keywords: 'login senha entrar menu pesquisa',
    body: `PARA QUE SERVE
O CDC Manager junta num só sítio a agenda, as fichas dos pacientes, as cobranças e os documentos das duas clínicas.

COMO ENTRAR
Abra cdcclinicas.com e escreva o seu nome de utilizador e a senha. Se se esquecer da senha, peça à gestão para a repor em Configurações.

O ECRÃ
· À esquerda está o menu. O botão no canto superior esquerdo esconde e volta a mostrar o menu.
· No topo há a pesquisa de pacientes: procure por nome, número do paciente, telemóvel, NIF ou data de nascimento.
· O Dashboard é a primeira página: mostra o que acontece hoje, quem falta confirmar para amanhã, os aniversários e as faltas do dia.

BOA PRÁTICA
Cada pessoa usa a sua própria conta. Tudo o que se faz fica registado com o nome de quem fez.`,
  },
  {
    slug: 'rececao-02-agenda',
    audience: 'reception',
    title: '2. Agenda: ver o dia e marcar uma consulta',
    keywords: 'agenda marcar marcação consulta horário cores vista compacta',
    body: `PARA QUE SERVE
Ver as marcações de cada médico e marcar, remarcar ou cancelar consultas.

VER O DIA
· No topo escolhe-se a clínica e o dia. Cada coluna é um médico que trabalha nesse dia.
· As cores mostram o estado: amarelo por confirmar, verde confirmada, roxo chegou, turquesa em consulta, cinzento por fechar, azul concluída, laranja falta, vermelho cancelada.
· "Vista compacta" encolhe a agenda para caber o dia inteiro no ecrã.

MARCAR
1. Clique no horário livre do médico (ou em "Nova marcação").
2. Procure o paciente. Se ainda não tem ficha, escolha "Sem ficha" e escreva nome, apelido e telemóvel (ou marque "Não tem telemóvel").
3. Escolha o ato e confirme a hora. Só aparecem os horários realmente livres.
4. Se houver trabalho de laboratório, marque essa opção.
5. Carregue em "Criar marcação".

ATENÇÃO
Ao escolher o paciente pode abrir uma janela de avisos (faltas, valores por regularizar, observações da equipa). Leia antes de marcar.`,
  },
  {
    slug: 'rececao-03-dia-da-consulta',
    audience: 'reception',
    title: '3. No dia da consulta: chegada, sala de espera e fecho',
    keywords: 'chegou sala de espera tudo ok fechar atendimento falta',
    body: `QUANDO O PACIENTE CHEGA
Abra a marcação e carregue em "Chegou — enviar ao médico". O paciente passa para a sala de espera e o médico vê-o no ecrã dele.

SE O PACIENTE NÃO PUDER ESPERAR
Use "Anular chegada". A marcação volta ao estado anterior.

SE O PACIENTE FALTAR
Marque "Falta". No Dashboard, em "Faltas e cancelamentos hoje", pode enviar-lhe uma mensagem por WhatsApp ou email.

DEPOIS DA CONSULTA
1. Registe a cobrança em Cobranças.
2. Volte à marcação e carregue em "Tudo OK — fechar atendimento". A marcação passa de cinzento a azul e fica registado quem fechou.

DURANTE A CONSULTA
A marcação em curso mostra uma barra de tempo: fica âmbar nos últimos minutos e vermelha quando passa da hora.`,
  },
  {
    slug: 'rececao-04-remarcar-cancelar',
    audience: 'reception',
    title: '4. Remarcar, cancelar e lista de espera',
    keywords: 'remarcar cancelar cancelamento lista de espera outro horário vaga',
    body: `REMARCAR
Abra a marcação e carregue em "Remarcar". Escolha o médico e o dia: só aparecem os horários livres.

CANCELAR
Abra a marcação, carregue em "Cancelar marcação", indique quem cancelou (paciente ou clínica) e escreva o motivo. A marcação fica na agenda a vermelho, com o motivo, até alguém a retirar para libertar o horário. O registo fica sempre na caixa "Canceladas", por baixo do calendário.

LISTA DE ESPERA
Se o paciente quer uma vaga mais cedo ou mais tarde:
1. Abra a marcação dele e carregue em "Paciente quer outro horário".
2. Escolha "Quer mais cedo", "Quer mais tarde" ou "Qualquer outro horário".
Quando abrir uma vaga com esse médico, o paciente aparece na caixa "Lista de espera" da agenda desse dia, com o telemóvel. Ligue-lhe e use "Abrir a marcação para remarcar".`,
  },
  {
    slug: 'rececao-05-ficha',
    audience: 'reception',
    title: '5. Ficha do paciente',
    keywords: 'ficha paciente nif rgpd consentimento tablet campos obrigatórios próximas consultas',
    body: `PARA QUE SERVE
Guardar os dados do paciente, os consentimentos e o histórico de consultas.

CRIAR OU COMPLETAR UMA FICHA
· Os campos obrigatórios aparecem em destaque: data de nascimento, NIF, sexo, número de utente, nacionalidade, telemóvel e email.
· Se o paciente não quiser indicar o NIF ou não tiver telemóvel ou email, marque a opção correspondente em vez de inventar um valor.
· O número do paciente é atribuído quando a ficha completa é gravada.

RGPD E CONSENTIMENTOS
Ao criar a ficha, o consentimento RGPD pode ser enviado para o tablet da receção, para o paciente assinar.

VER AS PRÓXIMAS CONSULTAS
Na pesquisa do topo, o botão "Consultas" abre a ficha rápida. Clique numa das próximas consultas para ir à agenda desse dia, já com a marcação aberta.`,
  },
  {
    slug: 'rececao-06-cobrancas',
    audience: 'reception',
    title: '6. Cobranças e venda de produtos',
    keywords: 'cobrança cobrar pagamento fatura produto venda balcão',
    body: `COBRANÇAS
· Em Cobranças aparecem os atos realizados que ainda não foram cobrados.
· Use os filtros (dia, paciente, médico, tratamento) para encontrar o que procura.
· Antes de registar, o sistema mostra um resumo para confirmar: paciente, NIF, atos, total, valor pago e o que fica em dívida.
· Uma fatura de 1 000 € ou mais sem NIF exige a morada na ficha.

ANULAR
Só a gestão pode anular uma fatura ou emitir nota de crédito.

PRODUTOS
Em Produtos regista-se a venda ao balcão (por exemplo, o gel branqueador). Escolha o produto, a quantidade e o meio de pagamento. A venda não tem médico associado e não conta para as comissões.`,
  },
  {
    slug: 'rececao-07-documentos-recalls',
    audience: 'reception',
    title: '7. Documentos, recalls e laboratório',
    keywords: 'documento modelo atestado comparecimento recall laboratório prótese',
    body: `DOCUMENTOS
Na ficha do paciente, "Emitir documento" mostra os modelos por pasta (Geral, Cirurgia, Ortodontia…). O documento abre em "Modelo padrão", com o texto fixo. A aba "Editável" permite alterar o texto só para esse documento. A receção só vê os modelos que a gestão autorizou, como o atestado de comparecimento.

RECALLS
Em Recalls está a lista de pacientes a contactar. Depois de cada contacto registe o resultado (marcou, não atende, não tem interesse, número errado…). Fica guardado quem ligou e quando.

LABORATÓRIO
Numa marcação, "Trabalho de laboratório" regista o pedido ao laboratório ligado a essa consulta. Em "Outro trabalho" é obrigatório descrever o que é.`,
  },
  {
    slug: 'medicos-01-o-meu-dia',
    audience: 'doctor',
    title: '1. O meu dia e a sala de espera',
    keywords: 'o meu dia sala de espera chamar paciente agenda',
    body: `PARA QUE SERVE
"O meu dia" mostra as suas consultas de hoje e quem já está à espera.

SALA DE ESPERA
Quando a receção regista a chegada, o paciente aparece na sua sala de espera em poucos segundos. Pode chamar qualquer paciente da lista com "Chamar paciente", pela ordem que entender.

AGENDA
Em Agenda vê as suas marcações, com as mesmas cores da receção: verde confirmada, roxo chegou, turquesa em consulta.

OS SEUS DOCUMENTOS
Se um documento seu (seguro, cédula, ficha de aptidão) estiver a 30 dias de expirar, ou já vencido, aparece um aviso no topo desta página. Fale com a gestão para o atualizar.`,
  },
  {
    slug: 'medicos-02-consulta',
    audience: 'doctor',
    title: '2. Consulta e anamnese',
    keywords: 'consulta anamnese alergias medicação barra de tempo',
    body: `INICIAR A CONSULTA
Ao iniciar a consulta de um paciente sem anamnese, ou com a anamnese feita há mais de 12 meses, a ficha de anamnese abre sozinha e só fecha depois de gravada. Isto vale também para as urgências.

ANAMNESE
Os quatro campos obrigatórios aparecem a amarelo e passam a verde quando preenchidos. Há a opção "Sem alergias conhecidas". Na revisão anual a ficha já vem com as respostas anteriores.

DURANTE A CONSULTA
As alergias, a medicação e a reação anestésica aparecem no topo do ecrã. A barra de tempo mostra quanto falta para o fim da consulta: fica âmbar nos últimos minutos e vermelha quando passa da hora.`,
  },
  {
    slug: 'medicos-03-odontograma',
    audience: 'doctor',
    title: '3. Odontograma e lançamento de atos',
    keywords: 'odontograma dente ato lançar corrigir infantil 3d',
    body: `PARA QUE SERVE
Registar o estado de cada dente e lançar os atos realizados.

AS VISTAS
· Anatómico: os dentes desenhados com a forma real. O dente selecionado e o histórico ficam ao lado.
· Paciente 3D: a boca aberta, para explicar ao paciente.
· Em crianças, o seletor "Definitiva / Infantil (de leite)" mostra a dentição de leite.

AVISOS
Ao abrir o odontograma pode aparecer a janela de avisos do paciente. O botão "Avisos" volta a abri-la.

CORRIGIR UM LANÇAMENTO
O que fica registado não se apaga. Um lançamento errado que ainda não foi faturado pode ser anulado por si ou pela gestão; fica guardado quem anulou e porquê.`,
  },
  {
    slug: 'medicos-04-documentos-planos',
    audience: 'doctor',
    title: '4. Documentos e planos de tratamento',
    keywords: 'documento consentimento atestado orçamento plano de tratamento',
    body: `DOCUMENTOS
Em "Emitir documento" os modelos estão por pasta. "Modelo padrão" tem o texto fixo da clínica; "Editável" permite acrescentar ou tirar informação só para aquele paciente (um dente, uma orientação específica). Os consentimentos podem ser enviados para o tablet, para o paciente assinar.

PLANOS DE TRATAMENTO E ORÇAMENTOS
Ao apresentar um plano ao paciente, ele fica registado como orçamento entregue. A clínica acompanha os orçamentos pendentes e a receção contacta os pacientes que ainda não responderam. Quando o tratamento começa, o plano passa a "em curso" e sai da lista de pendentes.`,
  },
  {
    slug: 'portal-01-o-que-e',
    audience: 'portal',
    title: '1. Área do cliente: o que o paciente recebe',
    keywords: 'paciente cliente confirmação marcação tablet assinatura mensagem',
    body: `O QUE O PACIENTE VÊ
O paciente não entra no CDC Manager. O contacto com ele faz-se de três formas:

· Confirmação de marcação: recebe uma mensagem com uma ligação para confirmar a consulta. Quando confirma, a marcação passa a verde na agenda.
· Tablet da receção: assina o consentimento RGPD e os consentimentos informados no tablet. O documento assinado fica guardado na ficha.
· Mensagens da clínica: parabéns no aniversário e contacto depois de uma falta, enviados pela receção a partir do Dashboard.

A REVER PELA GESTÃO
Este texto descreve o que existe hoje. Completem-no com as regras da clínica sobre o que dizer ao paciente em cada caso.`,
  },
];
