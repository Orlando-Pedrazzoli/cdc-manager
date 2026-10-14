// 📄 src/lib/data/orientacoes-pos-procedimento.ts
// =============================================================================
// CDC Manager — Orientações pós-procedimento da clínica (3.ª reunião, 09/10)
// -----------------------------------------------------------------------------
// Transcrição fiel dos DOCX enviados por Victor Ruiz ("substituem as
// anteriores"): 06 extração simples, 07 dentes do siso, 08 implantes.
// Estrutura comum: identificação (paciente, nº, data, médico, cédula OMD),
// introdução, 5 secções, "contacte-nos imediatamente se", rodapé de contactos.
// Importados pela chave com scripts/import-orientacoes.ts (upsert — correr
// de novo substitui o texto; a administração continua a poder editá-los em
// /admin/modelos). O modelo antigo 'pos-operatorio-extracao' é desativado.
// =============================================================================

import type { DefaultTemplate } from '@/lib/data/document-templates';

/** Bloco de identificação comum (mesma ordem dos DOCX) */
const IDENTIFICACAO = `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º de paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}`;

/** Rodapé comum */
const RODAPE = `DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`;

/** Chave do modelo antigo que estas orientações substituem */
export const ORIENTACOES_SUBSTITUEM = ['pos-operatorio-extracao'];

export const ORIENTACOES_POS_PROCEDIMENTO: DefaultTemplate[] = [
  {
    key: 'orientacoes-06-extracao-simples',
    kind: 'pos-operatorio',
    title: 'Orientações após extração dentária simples',
    body: `ORIENTAÇÕES PÓS-PROCEDIMENTO
ORIENTAÇÕES APÓS EXTRAÇÃO DENTÁRIA SIMPLES

${IDENTIFICACAO}

Os cuidados nas primeiras 24 a 48 horas são fundamentais para uma boa cicatrização do alvéolo e para prevenir complicações como a alveolite.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme e constante durante 30 a 45 minutos, sem a remover antes desse tempo.
• Aplique gelo (de acordo com a orientação do seu médico dentista).
• Mantenha a cabeça elevada, mesmo durante o repouso, nas primeiras horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• A partir do dia seguinte, pode iniciar bochechos suaves (de acordo com a orientação do seu médico dentista).
• Alimente-se com dieta mole e fria nas primeiras 24 horas (iogurte, puré, sopa morna), evoluindo gradualmente para a alimentação normal.
• Retome a escovagem normal dos restantes dentes desde logo, evitando apenas a zona da extração no primeiro dia.

O QUE DEVE EVITAR
• Não bocheche, cuspa com força nem use palhinha nas primeiras 24 horas, para não deslocar o coágulo sanguíneo.
• Não fume nem consuma álcool nas primeiras 48 a 72 horas, pois atrasam a cicatrização e aumentam o risco de alveolite.
• Evite exercício físico intenso e exposição solar prolongada nas primeiras 24 a 48 horas.
• Evite tocar a zona da extração com a língua, dedos ou objetos.

MEDICAÇÃO
Tome a medicação analgésica e/ou antibiótica apenas conforme prescrita pelo médico dentista, respeitando doses e horários, mesmo que os sintomas melhorem antes do fim do tratamento.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia abundante que não cede à compressão com gaze após várias tentativas.
• Dor intensa que surge 2 a 4 dias após a extração (possível sinal de alveolite seca).
• Inchaço progressivo, febre ou mau odor/sabor na zona da extração.
• Dificuldade em abrir a boca, engolir ou respirar.

${RODAPE}`,
  },
  {
    key: 'orientacoes-07-dentes-do-siso',
    kind: 'pos-operatorio',
    title: 'Orientações após cirurgia de extração de dentes do siso',
    body: `ORIENTAÇÕES PÓS-PROCEDIMENTO
ORIENTAÇÕES APÓS CIRURGIA DE EXTRAÇÃO DE DENTES DO SISO

${IDENTIFICACAO}

A recuperação após a extração de dentes inclusos ou semi-inclusos (siso) é habitualmente mais prolongada do que numa extração simples, com inchaço e desconforto esperados nos primeiros dias.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme durante 30 a 45 minutos após a cirurgia.
• Aplique gelo na face (de acordo com a orientação do seu médico dentista).
• Repouse com a cabeça elevada nas primeiras 24 a 48 horas, evitando esforços.

CUIDADOS GERAIS E RECOMENDAÇÕES
• O inchaço é normal e tende a aumentar até ao 2.º ou 3.º dia, diminuindo progressivamente a partir do 4.º dia.
• A partir do dia seguinte à cirurgia, faça bochechos suaves (de acordo com a orientação do seu médico dentista).
• Alimente-se com dieta mole, fria ou morna nos primeiros dias (sopas, puré, iogurte, batido), evoluindo gradualmente conforme o conforto permitir.
• Mantenha a higiene oral geral, evitando apenas escovar diretamente a zona operada nos primeiros dias.

O QUE DEVE EVITAR
• Não bocheche com força, não cuspa nem use palhinha nas primeiras 24 a 48 horas.
• Não fume nem consuma álcool durante pelo menos 72 horas.
• Evite esforço físico intenso, exercício e exposição solar direta durante a primeira semana.
• Evite abrir muito a boca (bocejar, gritar) nos primeiros dias, sobretudo se houve pontos de sutura.

MEDICAÇÃO
Tome a medicação analgésica, anti-inflamatória e/ou antibiótica exatamente conforme prescrita, respeitando os horários, mesmo que os sintomas melhorem antes do fim do tratamento.

REAVALIAÇÃO E ACOMPANHAMENTO
Se foram colocados pontos não reabsorvíveis, será agendada consulta para a sua remoção, habitualmente entre 7 e 10 dias após a cirurgia.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia abundante que não cede à compressão com gaze.
• Inchaço que continua a aumentar após o 3.º ou 4.º dia, ou febre.
• Dor intensa que surge alguns dias após a cirurgia (possível alveolite seca).
• Dormência do lábio, queixo ou língua que persiste para além do esperado.
• Dificuldade progressiva em abrir a boca, engolir ou respirar.

${RODAPE}`,
  },
  {
    key: 'orientacoes-08-implantes-dentarios',
    kind: 'pos-operatorio',
    title: 'Orientações após colocação de implantes dentários',
    body: `ORIENTAÇÕES PÓS-PROCEDIMENTO
ORIENTAÇÕES APÓS COLOCAÇÃO DE IMPLANTES DENTÁRIOS

${IDENTIFICACAO}

Nos primeiros dias após a cirurgia de colocação do implante é normal algum inchaço, sensibilidade e um pequeno hematoma na zona tratada.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme durante 30 a 45 minutos.
• Aplique gelo na face (de acordo com a orientação do seu médico dentista).
• Repouse com a cabeça elevada nas primeiras 24 a 48 horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Faça bochechos suaves (com indicação do seu médico dentista), ou com o colutório indicado pelo médico dentista, a partir do dia seguinte à cirurgia.
• Mantenha uma dieta mole e fria nos primeiros dias, evoluindo gradualmente conforme o conforto permitir.
• Escove os restantes dentes normalmente, evitando apenas trauma direto na zona operada nos primeiros dias.
• Respeite rigorosamente o período de osteointegração indicado pelo médico dentista antes da colocação da coroa/prótese definitiva.

O QUE DEVE EVITAR
• Não fume durante o período de cicatrização, uma vez que o tabaco compromete significativamente a osteointegração do implante.
• Evite mastigar diretamente sobre a zona do implante enquanto não for autorizado pelo médico dentista.
• Evite exercício físico intenso e esforços durante a primeira semana.
• Evite tocar ou pressionar a zona operada com a língua ou dedos.

MEDICAÇÃO
Tome a medicação analgésica, anti-inflamatória e/ou antibiótica exatamente conforme prescrita pelo médico dentista.

REAVALIAÇÃO E ACOMPANHAMENTO
Serão agendadas consultas de controlo periódicas para acompanhar a cicatrização e a osteointegração, até à fase de reabilitação protética definitiva.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia abundante ou persistente.
• Inchaço ou dor que aumentam progressivamente após o 3.º ou 4.º dia.
• Febre, mau odor ou saída de secreção na zona do implante.
• Mobilidade percetível do implante.
• Dormência do lábio ou queixo que persiste para além do esperado.

${RODAPE}`,
  },
];
