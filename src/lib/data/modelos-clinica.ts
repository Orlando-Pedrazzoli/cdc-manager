// 📄 src/lib/data/modelos-clinica.ts
// =============================================================================
// CDC Manager — Modelos de documentos da clínica (9.ª ronda (c), 27/11/2026)
// -----------------------------------------------------------------------------
// Transcrição dos 56 modelos Word enviados por Victor Ruiz a 27/11/2026 (C1):
//   · 28 consentimentos informados (01 a 28) + 2 termos (29 recusa de
//     tratamento, 30 interrupção de tratamento);
//   · 24 orientações pós-procedimento (01 a 24) — as 06, 07 e 08 SUBSTITUEM
//     as de 09/10 (mesmas chaves em orientacoes-pos-procedimento.ts);
//   · Atestado médico e Encaminhamento clínico.
// O texto é o dos documentos, palavra por palavra (conferido por script
// contra os .docx). O que muda é só a forma, igual à das orientações 06–08:
//   · o cabeçalho com o logótipo, o TÍTULO, a data e as linhas de assinatura
//     são postos pelo PDF do sistema e por isso não vêm no texto (as duas
//     linhas de título do Word — "CONSENTIMENTO INFORMADO" + nome — ficam
//     no campo `title`; repeti-las no texto fazia o título sair duas vezes);
//   · a caixa "Identificação" passa a linhas com os campos {{...}};
//   · "Telefone: ____ · Email: ____" passa a {{clinica.telefone}} /
//     {{clinica.email}} (cada clínica sai com os seus contactos);
//   · as caixas de assinalar ☐ passam a "[ ]" (a letra do PDF não tem ☐).
// Este ficheiro só é lido por scripts/import-modelos-clinica.ts (upsert por
// chave). NÃO é importado pela aplicação — não pesa no bundle.
// =============================================================================

import type {
  TemplateFolder,
  TemplateKind,
} from '@/lib/data/document-templates';

export interface ClinicTemplate {
  key: string;
  kind: TemplateKind;
  folder: TemplateFolder;
  title: string;
  body: string;
}

export const MODELOS_CLINICA: ClinicTemplate[] = [
  {
    // 01_Consentimento_Informado_Geral.docx
    key: 'consentimento-01-geral',
    kind: 'consentimento',
    folder: 'geral',
    title: 'Consentimento informado geral',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O presente documento visa informar o paciente sobre a natureza geral dos cuidados de medicina dentária prestados na clínica, incluindo anamnese, exame clínico e exames complementares de diagnóstico (radiografias, fotografias, entre outros), elaboração de plano de tratamento e procedimentos de rotina, previamente à realização de qualquer tratamento específico, para o qual será solicitado consentimento informado próprio e individualizado, com descrição dos riscos específicos desse tratamento.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Reações a produtos, materiais ou substâncias utilizados na consulta (ex.: anestésicos tópicos, luvas de látex, desinfetantes, flúor).
• Desconforto, sensibilidade dentária ou gengival transitória decorrente do exame clínico ou de procedimentos de rotina (destartarização, polimento).
• Exposição a radiação ionizante em dose reduzida e controlada, em caso de realização de radiografias.
• Deteção, durante o exame, de patologias que necessitem de tratamento adicional não previsto na consulta inicial.
• Reações vasovagais (mal-estar, tonturas) associadas ao contexto da consulta, sobretudo em pacientes ansiosos.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (admissão e acompanhamento clínico do paciente).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 02_Consentimento_para_Uso_de_Imagem.docx
    key: 'consentimento-02-uso-de-imagem',
    kind: 'consentimento',
    folder: 'geral',
    title: 'Consentimento para uso de imagem',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
Este documento formaliza a autorização, por parte do paciente, para a captação de fotografias e/ou vídeos, antes, durante e depois de procedimentos clínicos, destinados a registo clínico, estudo de caso, formação de profissionais, divulgação científica, redes sociais e materiais promocionais da clínica, podendo as imagens ser recortadas, editadas ou associadas a informação clínica geral (sem identificação do nome do paciente), salvo indicação em contrário.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Possibilidade de identificação do paciente por terceiros através de características faciais ou contexto da imagem, ainda que sem menção do nome.
• Utilização das imagens por período indeterminado nos suportes de divulgação da clínica, nos termos aqui autorizados.

REVOGAÇÃO E LIMITES DA AUTORIZAÇÃO
O paciente pode, a qualquer momento, solicitar a remoção de imagens específicas dos canais de divulgação da clínica (ex.: redes sociais), sem prejuízo da manutenção das imagens já integradas no seu processo clínico.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (captação e utilização de imagem).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.

Ao assinar o presente consentimento informado, o(a) paciente (ou o seu responsável legal) autoriza, de forma livre, esclarecida e automática, a captação e utilização da sua imagem (fotografias e/ou vídeos, antes, durante e/ou depois do procedimento) para fins de registo clínico, estudo de caso, formação, divulgação científica, redes sociais e materiais promocionais da CENTRO DENTÁRIO COLOMBO, não sendo necessária qualquer autorização adicional.`,
  },
  {
    // 03_Consentimento_para_Radiografia_Tomografia_Computorizada_de_Feixe_Conico_CBCT.docx
    key: 'consentimento-03-radiografia-cbct',
    kind: 'consentimento',
    folder: 'geral',
    title: 'Consentimento para radiografia / tomografia computorizada de feixe cónico (CBCT)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na realização de exame(s) radiográfico(s) (radiografia periapical, bitewing, ortopantomografia) e/ou tomografia computorizada de feixe cónico (Cone Beam CT), com exposição a radiação ionizante em dose controlada e ajustada ao mínimo necessário, com o objetivo de obter imagens bidimensionais e/ou tridimensionais das estruturas dentárias, ósseas e anatómicas circundantes, essenciais ao diagnóstico e ao planeamento de tratamentos (ex.: implantes, cirurgia oral, ortodontia, endodontia).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Exposição a radiação ionizante, em dose superior à de uma radiografia convencional no caso da tomografia, ainda que dentro dos limites de segurança recomendados.
• Necessidade de repetição do exame em caso de movimento do paciente ou qualidade insuficiente da imagem obtida.
• Desconforto transitório associado à posição ou ao dispositivo de imobilização durante a aquisição da imagem.
• Deteção incidental de achados fora do âmbito da consulta dentária (ex.: alterações nos seios perinasais ou na coluna cervical), com eventual necessidade de encaminhamento a outra especialidade médica.

ALTERNATIVAS DE TRATAMENTO
• Radiografia convencional bidimensional, quando suficiente para o diagnóstico pretendido, em alternativa à tomografia computorizada.
• Não realização do exame, com correspondente limitação da informação diagnóstica disponível para o planeamento do tratamento.

ADVERTÊNCIA ESPECIAL
Grávidas ou pacientes com suspeita de gravidez devem informar previamente o médico dentista, uma vez que a realização de exames radiográficos nestas circunstâncias exige avaliação individualizada do risco-benefício e proteção adequada.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (realização de exame(s) radiográfico(s) e/ou tomografia computorizada de feixe cónico (CBCT)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 04_Consentimento_para_Anestesia_Local.docx
    key: 'consentimento-04-anestesia-local',
    kind: 'consentimento',
    folder: 'geral',
    title: 'Consentimento para anestesia local',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento envolve a administração de anestesia local, por via injetável e/ou tópica, com o objetivo de eliminar ou reduzir a sensibilidade dolorosa na zona a tratar, permitindo a realização do tratamento dentário com o máximo conforto possível. Poderão ser utilizadas diferentes técnicas anestésicas (infiltrativa, troncular/locorregional, intraligamentar) consoante a zona e o procedimento a realizar.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, hematoma ou inchaço no local da injeção.
• Reação alérgica ao anestésico local, ao vasoconstritor ou a outros componentes da solução.
• Parestesia (dormência, formigueiro ou alteração de sensibilidade) transitória e, raramente, permanente, do lábio, língua, queixo ou face.
• Trismo (dificuldade ou limitação na abertura da boca) transitório.
• Lesão de tecidos moles (lábio, bochecha, língua) por mordedura acidental enquanto persiste o efeito anestésico, sobretudo em crianças.
• Injeção intravascular acidental, com possível taquicardia ou palidez transitória.
• Falha ou eficácia parcial da anestesia, com necessidade de reforço anestésico.
• Reações sistémicas raras mas graves (síncope, reação anafilática), com necessidade de assistência médica de urgência.

ALTERNATIVAS DE TRATAMENTO
• Sedação consciente associada à anestesia local, em casos de ansiedade acentuada.
• Anestesia geral em ambiente hospitalar, em casos clinicamente justificados.
• Não realização do procedimento, com os riscos clínicos daí decorrentes.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (administração de anestesia local).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 05_Restauracao_Dentaria.docx
    key: 'consentimento-05-restauracao-dentaria',
    kind: 'consentimento',
    folder: 'dentisteria',
    title: 'Consentimento para restauração dentária',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento consiste na remoção de tecido dentário cariado, fraturado ou danificado e na sua substituição por material restaurador (resina composta, amálgama, cerâmica ou outro), sob anestesia local quando indicado, com o objetivo de restabelecer a forma, a função e a estética do dente e interromper a progressão do processo de cárie ou de fratura.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Sensibilidade dentária pós-operatória ao frio, calor ou pressão mastigatória, geralmente transitória.
• Necessidade de tratamento endodôntico (do canal radicular) caso a lesão de cárie seja mais profunda do que o previsto ou surja inflamação pulpar após a restauração.
• Fratura, desgaste, descoloração ou descolagem do material restaurador ao longo do tempo, com necessidade de substituição futura.
• Reação alérgica a componentes do material restaurador utilizado.
• Lesão inadvertida de tecidos moles adjacentes (gengiva, bochecha, língua) durante o procedimento.
• Dor ou desconforto na articulação temporomandibular decorrente do tempo de abertura bucal prolongado.

ALTERNATIVAS DE TRATAMENTO
• Colocação de coroa ou onlay/inlay em dentes com perda de estrutura mais extensa.
• Extração do dente e posterior reabilitação protética, em casos de destruição dentária muito extensa.
• Não realização do tratamento, com risco de progressão da cárie, dor e perda dentária.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (restauração dentária (obturação)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 06_Consentimento_para_Tratamento_Endodontico.docx
    key: 'consentimento-06-tratamento-endodontico',
    kind: 'consentimento',
    folder: 'endodontia',
    title: 'Consentimento para tratamento endodôntico',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento endodôntico consiste na remoção da polpa dentária infetada, inflamada ou necrosada, na limpeza, desinfeção e modelação dos canais radiculares e no seu posterior preenchimento com material obturador, com o objetivo de eliminar a infeção/inflamação, aliviar a sintomatologia e preservar o dente na arcada, evitando a sua extração.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, sensibilidade ou desconforto no período pós-operatório, por vezes com necessidade de medicação analgésica/anti-inflamatória.
• Fratura de instrumentos endodônticos no interior do canal radicular, podendo exigir técnicas de remoção adicionais ou encaminhamento a especialista.
• Perfuração radicular ou lesão de estruturas anatómicas adjacentes durante a instrumentação dos canais.
• Persistência ou recidiva da infeção, com insucesso do tratamento e necessidade de retratamento endodôntico, cirurgia apical (apicectomia) ou extração.
• Fratura do dente tratado endodonticamente, sobretudo na ausência de reforço protético adequado (coroa).
• Escurecimento (alteração de cor) do dente tratado.
• Extrusão de material obturador ou de soluções irrigadoras para além do ápice radicular, com possível desconforto pós-operatório.
• Impossibilidade de conclusão do tratamento numa única sessão, com necessidade de sessões adicionais (ex.: presença de infeção ativa, anatomia radicular complexa).

ALTERNATIVAS DE TRATAMENTO
• Extração do dente e posterior reabilitação com implante, prótese fixa ou prótese removível.
• Encaminhamento para especialista em Endodontia em casos de maior complexidade anatómica.
• Não realização do tratamento, com risco de agravamento da infeção, dor e perda do dente.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (tratamento de canal radicular (endodontia)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 07_Consentimento_para_Branqueamento_Dentario.docx
    key: 'consentimento-07-branqueamento',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para branqueamento dentário',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na aplicação de agentes branqueadores à base de peróxido de hidrogénio ou peróxido de carbamida, em ambiente clínico (branqueamento de consultório) e/ou com recurso a moldeiras individuais para uso ambulatório, com o objetivo de clarear a cor natural dos dentes, sendo o resultado dependente da causa e do grau de descoloração inicial.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Sensibilidade dentária durante e após o tratamento, geralmente transitória.
• Irritação, queimadura química ou branqueamento transitório dos tecidos moles (gengiva, lábios) em caso de contacto com o agente branqueador.
• Resultado estético variável e imprevisível consoante a coloração inicial, a causa da descoloração (intrínseca vs. extrínseca) e a resposta individual do esmalte/dentina.
• Ausência de efeito sobre restaurações, coroas, facetas ou outros materiais protéticos previamente existentes, podendo gerar desarmonia de cor após o branqueamento dos dentes naturais.
• O branqueamento não é permanente: foi explicado que é normal que os dentes voltem gradualmente a ficar um pouco mais escuros com o passar do tempo, com eventual necessidade de sessões de manutenção.
• Desconforto gengival por sobreextensão de moldeiras mal ajustadas, no caso de branqueamento ambulatório.
• Alguns dentes são naturalmente mais escuros, principalmente junto à gengiva. Esta região pode necessitar de mais tempo para branquear do que as restantes áreas do dente e pode ficar ligeiramente mais escura mesmo após o término do branqueamento.
• Manchas brancas já existentes ou que surjam durante o tratamento podem acentuar-se no início, mas tendem a uniformizar com a cor do dente após o branqueamento. Se persistirem, poderá ser necessário outro tipo de tratamento adicional.
• Contraindicação: mulheres grávidas ou a amamentar não devem realizar branqueamento dentário.

ALTERNATIVAS DE TRATAMENTO
• Facetas ou coroas cerâmicas, em casos de descoloração intrínseca severa não responsiva ao branqueamento.
• Não realização do procedimento, mantendo-se a coloração dentária atual.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (branqueamento dentário clínico e/ou ambulatório).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 08_Consentimento_para_Facetas_Dentarias_Ceramica_eou_Resina_Composta.docx
    key: 'consentimento-08-facetas',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para facetas dentárias (cerâmica e/ou resina composta)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento consiste na colocação de facetas (peças finas de cerâmica ou resina composta) na face vestibular dos dentes, com o objetivo de corrigir alterações de cor, forma, tamanho ou alinhamento dentário, implicando, na maioria dos casos, um desgaste mínimo e controlado do esmalte dentário, recolha de impressões/digitalização, prova estética (mock-up) quando aplicável, uso de facetas provisórias e posterior cimentação definitiva.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Sensibilidade dentária após o desgaste do esmalte e durante o período de uso das facetas provisórias.
• Necessidade de tratamento endodôntico, em casos raros, por proximidade excessiva à polpa dentária.
• Fratura, descolagem ou desgaste das facetas ao longo do tempo, sobretudo em pacientes com hábitos parafuncionais (bruxismo) não controlados.
• Resultado estético dependente de fatores subjetivos (forma, cor, alinhamento), podendo não corresponder integralmente à expectativa do paciente apesar do planeamento prévio.
• Irreversibilidade do desgaste dentário efetuado, ainda que mínimo.
• Reação alérgica a materiais utilizados (cerâmica, resina composta, cimento adesivo).

ALTERNATIVAS DE TRATAMENTO
• Branqueamento dentário, em casos de alteração exclusivamente de cor, sem necessidade de desgaste dentário.
• Coroas cerâmicas de cobertura total, em casos de maior destruição ou fragilidade da estrutura dentária.
• Não realização do tratamento, mantendo-se o aspeto dentário atual.

AUTORIZAÇÃO DE USO DE IMAGEM
O(A) paciente declara que autoriza a divulgação das imagens (fotografias e/ou vídeos) respeitantes ao seu procedimento estético, com preservação da sua identidade, para divulgação em redes sociais e demais meios de comunicação da clínica, nos termos do artigo 79.º do Código Civil (direito à imagem) e do artigo 6.º, n.º 1, alínea a), do Regulamento Geral sobre a Proteção de Dados. O(A) paciente concorda ainda que esta utilização não implica qualquer forma de encargo financeiro para a clínica, não conferindo direito a remuneração ou compensação. Esta autorização pode ser revogada a qualquer momento, mediante comunicação escrita à clínica, sem efeitos retroativos.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (colocação de facetas dentárias em cerâmica e/ou resina composta).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 09_Consentimento_para_Exodontia_Extracao_Dentaria_Simples.docx
    key: 'consentimento-09-extracao-simples',
    kind: 'consentimento',
    folder: 'cirurgia',
    title: 'Consentimento para exodontia (extração dentária simples)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na remoção cirúrgica de um dente, sob anestesia local, indicada por razões clínicas como cárie extensa não restaurável, doença periodontal avançada, fratura dentária, razões ortodônticas, protéticas ou infeciosas, mediante utilização de instrumental próprio (alavancas, fórceps).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço (edema) e/ou hematoma no pós-operatório.
• Hemorragia pós-operatória imediata ou tardia.
• Infeção do alvéolo dentário (alveolite seca) ou dos tecidos moles adjacentes.
• Lesão de dentes ou restaurações vizinhas durante a manobra de extração.
• Parestesia (dormência) transitória ou, raramente, permanente, sobretudo em dentes inferiores próximos do nervo alveolar inferior.
• Fratura radicular com necessidade de acesso cirúrgico adicional para remoção de fragmentos.
• Comunicação oro-sinusal, em extrações de dentes superiores posteriores próximos do seio maxilar.
• Reabsorção óssea progressiva do rebordo alveolar após a extração, com eventual necessidade de reabilitação futura.

ALTERNATIVAS DE TRATAMENTO
• Tratamento conservador (endodôntico, periodontal ou restaurador), quando clinicamente viável, em alternativa à extração.
• Encaminhamento para cirurgia oral em casos de maior complexidade.
• Não realização da extração, com risco de agravamento da infeção, dor ou disseminação da doença periodontal.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (extração dentária simples).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 10_Consentimento_para_Cirurgia_de_Extracao_de_Dentes_Inclusos_Siso.docx
    key: 'consentimento-10-dentes-inclusos-siso',
    kind: 'consentimento',
    folder: 'cirurgia',
    title: 'Consentimento para cirurgia de extração de dentes inclusos / siso',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento cirúrgico visa a remoção de dente(s) incluso(s) ou semi-incluso(s), nomeadamente dentes do siso, através de acesso cirúrgico com eventual necessidade de incisão, descolamento de retalho mucoperiosteal, remoção de tecido ósseo circundante e/ou secção do dente em fragmentos, sob anestesia local, podendo ser associada sedação consciente quando indicado.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço (edema) e trismo (limitação da abertura da boca) no pós-operatório, que podem durar vários dias.
• Hemorragia e hematoma, intra ou extraoral.
• Infeção pós-operatória, incluindo alveolite seca.
• Lesão do nervo alveolar inferior ou do nervo lingual, com parestesia (dormência) do lábio, queixo ou língua, transitória ou, em casos raros, permanente.
• Comunicação oro-antral (dentes superiores) com o seio maxilar, ou fratura da tuberosidade maxilar/mandíbula (complicações raras).
• Lesão de dentes ou restaurações adjacentes.
• Deiscência (abertura) da sutura, com atraso na cicatrização.
• Limitação temporária da função mastigatória e da fala durante a recuperação.

ALTERNATIVAS DE TRATAMENTO
• Monitorização clínica e radiográfica periódica, sem extração, em casos selecionados sem sintomatologia nem patologia associada.
• Encaminhamento para cirurgia maxilofacial em casos de maior complexidade anatómica.
• Não realização da cirurgia, com risco de infeções recorrentes, reabsorção de dentes adjacentes, quistos ou outras complicações.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (cirurgia de extração de dente incluso / siso).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 11_Consentimento_para_Colocacao_de_Implantes_Dentarios.docx
    key: 'consentimento-11-implantes',
    kind: 'consentimento',
    folder: 'implantologia',
    title: 'Consentimento para colocação de implantes dentários',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na colocação cirúrgica de implante(s) de titânio (ou outro material biocompatível) no osso maxilar e/ou mandibular, sob anestesia local, com o objetivo de substituir a(s) raiz(es) de dente(s) ausente(s) e suportar posteriormente uma reabilitação protética (coroa, ponte ou prótese sobre implantes), após o período de osseointegração.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Falha de osseointegração e perda do implante, com necessidade de remoção e eventual nova tentativa de colocação.
• Infeção, deiscência da sutura ou peri-implantite (inflamação dos tecidos ao redor do implante) a curto, médio ou longo prazo.
• Lesão de estruturas nervosas (nervo alveolar inferior, nervo mentoniano) com parestesia transitória ou, raramente, permanente.
• Perfuração do seio maxilar ou de estruturas anatómicas adjacentes (fossa nasal, canal mandibular).
• Necessidade de procedimentos adicionais não previstos inicialmente (enxerto ósseo, elevação de seio maxilar, regeneração óssea guiada).
• Hemorragia e hematoma pós-operatório, podendo ser significativo em determinadas localizações anatómicas.
• Fratura do implante ou dos seus componentes protéticos a longo prazo.
• Insucesso estético e/ou funcional da reabilitação final, dependente de fatores biológicos individuais (qualidade e quantidade óssea, hábitos, higiene oral, tabagismo).

ALTERNATIVAS DE TRATAMENTO
• Reabilitação com prótese fixa convencional (ponte) sobre dentes naturais, quando clinicamente viável.
• Reabilitação com prótese removível (total ou parcial).
• Não realização da reabilitação, mantendo-se o espaço edêntulo.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (colocação de implante(s) dentário(s)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 12_Consentimento_para_Enxerto_Osseo_Levantamento_de_Seio_Maxilar.docx
    key: 'consentimento-12-enxerto-osseo-seio-maxilar',
    kind: 'consentimento',
    folder: 'implantologia',
    title: 'Consentimento para enxerto ósseo / levantamento de seio maxilar',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento tem como objetivo aumentar o volume e/ou a qualidade óssea disponível através da colocação de material de enxerto (osso autólogo, heterólogo, aloplástico/sintético ou combinação destes), possibilitando a posterior colocação de implantes dentários em zonas com deficiência óssea, incluindo técnicas de elevação do seio maxilar por via lateral ou crestal quando indicado.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Perfuração da membrana sinusal (membrana de Schneider), com risco de sinusite maxilar aguda ou crónica.
• Exposição, infeção, deiscência ou perda parcial/total do material de enxerto.
• Hemorragia, hematoma e inchaço pós-operatório, por vezes de maior intensidade e duração do que em cirurgias convencionais.
• Necessidade de período de cicatrização e integração óssea prolongado (habitualmente vários meses) antes da colocação de implantes.
• Insucesso parcial ou total do procedimento, com necessidade de nova intervenção.
• Dor, desconforto sinusal, congestão nasal ou epistaxis (hemorragia nasal) transitória.
• Lesão de dentes adjacentes ou de estruturas anatómicas vizinhas (nervo infraorbitário).

ALTERNATIVAS DE TRATAMENTO
• Utilização de implantes curtos, estreitos ou inclinados, quando a anatomia o permitir, evitando o enxerto.
• Reabilitação com prótese removível, sem recurso a implantes.
• Não realização do procedimento, limitando as opções de reabilitação implanto-suportada na zona em causa.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (enxerto ósseo e/ou levantamento (elevação) do seio maxilar).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 13_Consentimento_para_Biopsia_Oral.docx
    key: 'consentimento-13-biopsia-oral',
    kind: 'consentimento',
    folder: 'cirurgia',
    title: 'Consentimento para biópsia oral',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na recolha cirúrgica, sob anestesia local, de uma amostra de tecido (mucosa oral, lesão ou outra estrutura), total (excisional) ou parcial (incisional), para posterior análise histopatológica em laboratório de anatomia patológica, com o objetivo de esclarecer o diagnóstico de lesões suspeitas.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço e hemorragia no local da biópsia.
• Infeção da ferida cirúrgica.
• Cicatriz residual, com eventual alteração de sensibilidade local.
• Necessidade de sutura e respetiva remoção em consulta de reavaliação.
• Resultado histopatológico inconclusivo, com necessidade de nova biópsia.
• Necessidade de tratamento adicional ou encaminhamento para especialidade médica consoante o resultado da análise.

ALTERNATIVAS DE TRATAMENTO
• Observação clínica periódica da lesão, sem biópsia imediata, quando clinicamente aceitável.
• Referenciação a consulta de especialidade hospitalar para biópsia e/ou tratamento.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (biópsia de tecido oral).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 14_Consentimento_para_Tratamento_Periodontal.docx
    key: 'consentimento-14-tratamento-periodontal',
    kind: 'consentimento',
    folder: 'periodontia',
    title: 'Consentimento para tratamento periodontal',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento consiste na remoção mecânica de placa bacteriana, tártaro e toxinas bacterianas acima e abaixo da linha gengival (raspagem e alisamento radicular), com recurso a instrumentos manuais e/ou ultrassónicos, sob anestesia local quando indicado, com o objetivo de tratar e controlar a doença periodontal (gengivite/periodontite) e travar a sua progressão.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Sensibilidade dentária pós-tratamento, particularmente ao frio.
• Hemorragia gengival durante e após o procedimento.
• Recessão gengival com eventual exposição radicular e impacto estético.
• Mobilidade dentária transitória durante a fase inicial de cicatrização.
• Necessidade de sessões de manutenção periódica (destartarização de suporte) para controlo a longo prazo.
• Persistência ou progressão da doença em casos de higiene oral insuficiente ou fatores de risco não controlados (tabagismo, diabetes).

ALTERNATIVAS DE TRATAMENTO
• Cirurgia periodontal, em bolsas periodontais que não respondam ao tratamento não cirúrgico.
• Extração dos dentes com prognóstico periodontal reservado e posterior reabilitação.
• Não realização do tratamento, com risco de progressão da doença e perda dentária.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (tratamento periodontal não cirúrgico (raspagem e alisamento radicular)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 15_Consentimento_para_Cirurgia_Periodontal.docx
    key: 'consentimento-15-cirurgia-periodontal',
    kind: 'consentimento',
    folder: 'periodontia',
    title: 'Consentimento para cirurgia periodontal',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento cirúrgico, sob anestesia local, tem como objetivo o tratamento de bolsas periodontais profundas e/ou a correção de defeitos ósseos e/ou gengivais associados à doença periodontal, podendo incluir cirurgia de acesso (retalho), regeneração tecidual guiada, enxertos ósseos ou enxertos gengivais (de tecido conjuntivo ou epitelizado).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço e hematoma pós-operatório.
• Recessão gengival e exposição radicular, com aumento de sensibilidade dentária e possível impacto estético.
• Hemorragia e infeção da ferida cirúrgica.
• Mobilidade dentária transitória no pós-operatório.
• Insucesso parcial do procedimento, com necessidade de reintervenção.
• Resultado estético e funcional variável consoante a gravidade da doença periodontal inicial e a resposta individual à cicatrização.
• Necessidade de área doadora adicional (habitualmente palato) em procedimentos com enxerto gengival, com desconforto pós-operatório nessa zona.

ALTERNATIVAS DE TRATAMENTO
• Tratamento periodontal não cirúrgico (raspagem e alisamento radicular), quando clinicamente suficiente.
• Extração dos dentes com prognóstico periodontal reservado e posterior reabilitação.
• Não realização da cirurgia, com risco de progressão da doença periodontal.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (cirurgia periodontal).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 16_Consentimento_para_Reabilitacao_Protetica_Fixa.docx
    key: 'consentimento-16-protese-fixa',
    kind: 'consentimento',
    folder: 'protese',
    title: 'Consentimento para reabilitação protética fixa',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento consiste na confeção e colocação de prótese(s) fixa(s) (coroas unitárias e/ou pontes dentárias), implicando o eventual desgaste (preparação) de estrutura dentária remanescente, recolha de impressões e/ou digitalização intraoral, utilização de prótese provisória durante a confeção laboratorial e posterior cimentação definitiva da prótese final.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Sensibilidade dentária, por vezes prolongada, após a preparação dos dentes pilares.
• Necessidade de tratamento endodôntico em dentes preparados, em casos de proximidade excessiva à polpa dentária.
• Descimentação, fratura ou desajuste da prótese ao longo do tempo, com necessidade de reparação ou substituição.
• Reação alérgica a materiais utilizados na confeção da prótese (metais, cerâmicas, resinas).
• Inflamação gengival ou periodontal na margem da prótese em caso de higiene oral inadequada.
• Alteração transitória da oclusão (mordida) durante o período de adaptação à nova prótese.

ALTERNATIVAS DE TRATAMENTO
• Reabilitação com prótese removível (total ou parcial).
• Reabilitação implanto-suportada, quando clinicamente indicada.
• Não realização da reabilitação, mantendo-se a situação clínica atual.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (reabilitação protética fixa (coroas, pontes)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 17_Consentimento_para_Protese_Total_Parcial_Removivel.docx
    key: 'consentimento-17-protese-removivel',
    kind: 'consentimento',
    folder: 'protese',
    title: 'Consentimento para prótese total / parcial removível',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento consiste na confeção e adaptação de prótese removível (total ou parcial, em resina acrílica e/ou estrutura metálica), com o objetivo de substituir dente(s) ausente(s) e restabelecer função mastigatória, fonética e estética, envolvendo habitualmente várias sessões de moldagem, prova e ajuste.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Desconforto, lesões ou úlceras na mucosa oral durante o período de adaptação inicial.
• Alterações transitórias na fala e/ou na perceção do paladar.
• Náusea ou reflexo de vómito durante o uso, sobretudo em próteses totais superiores.
• Necessidade de ajustes e/ou reembasamentos periódicos, à medida que a boca sofre alterações anatómicas, podendo ainda ser necessário enxerto ósseo em caso de reabsorção significativa.
• Reabsorção óssea progressiva do rebordo alveolar ao longo do tempo, podendo alterar o ajuste e a retenção da prótese e exigir reembasamento periódico ou nova prótese.
• Fratura da prótese em caso de queda ou uso inadequado.

ALTERNATIVAS DE TRATAMENTO
• Reabilitação com prótese fixa e/ou implantes dentários, quando clinicamente viável.
• Não realização da reabilitação, mantendo-se os espaços edêntulos.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (reabilitação com prótese removível total ou parcial).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 18_Consentimento_para_Tratamento_Ortodontico.docx
    key: 'consentimento-18-tratamento-ortodontico',
    kind: 'consentimento',
    folder: 'ortodontia',
    title: 'Consentimento para tratamento ortodôntico',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O tratamento tem como objetivo a correção de más posições dentárias e/ou problemas oclusais, através da utilização de aparelho fixo (brackets e arcos) e/ou alinhadores removíveis transparentes, ao longo de um período prolongado de acordo com a complexidade do caso e a resposta biológica individual, com necessidade de consultas de acompanhamento e ativação/troca de alinhadores regulares, seguido de fase de contenção.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Desconforto e sensibilidade dentária após colocação, ativações ou ajustes do aparelho.
• Reabsorção radicular (encurtamento das raízes dentárias), habitualmente ligeira, podendo em casos raros ser mais acentuada.
• Descalcificação do esmalte (manchas brancas) e/ou aumento do risco de cárie por higiene oral deficiente durante o tratamento.
• Problemas gengivais e periodontais: inflamação, sangramento, aumento do volume gengival, recessão gengival ou perda de suporte periodontal.
• Alterações na articulação temporomandibular (ATM): possibilidade de persistência, aparecimento ou agravamento de sintomas como dor, estalidos ou limitação dos movimentos mandibulares. Não existe garantia de que o tratamento ortodôntico resolva essas alterações.
• Lesões ou irritação da mucosa oral (lábios, bochechas) por atrito com os componentes do aparelho.
• Recidiva (perda parcial ou total dos resultados obtidos) na ausência de uso adequado do dispositivo de contenção pós-tratamento.
• Alterações temporárias na fala durante o período de adaptação, sobretudo com alinhadores.
• Necessidade de colaboração ativa e cumprimento rigoroso das indicações clínicas (tempo de uso, higiene) para o sucesso do tratamento.
• Em casos com componente esquelética significativa, possível necessidade de tratamento combinado com cirurgia ortognática.

ALTERNATIVAS DE TRATAMENTO
• Abordagem exclusivamente estética (ex.: facetas), sem correção da posição dentária, em casos selecionados.
• Tratamento ortodôntico-cirúrgico combinado, em casos com componente esquelética relevante.
• Não realização do tratamento, mantendo-se a situação oclusal atual.
• Fui informado(a) sobre as alternativas terapêuticas existentes, incluindo a possibilidade de não realização do tratamento ortodôntico, tendo sido esclarecido(a) das possíveis consequências desta decisão.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (tratamento ortodôntico (aparelho fixo ou alinhadores)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.

Consentimento prestado de acordo com a Ordem dos Médicos Dentistas, artigos 22.º e 26.º do Código Deontológico.`,
  },
  {
    // 19_Consentimento_para_Selantes_de_Fissuras_e_Fluorterapia_OdontopediatriaPrevencao.docx
    key: 'consentimento-19-selantes-fluorterapia',
    kind: 'consentimento',
    folder: 'odontopediatria',
    title: 'Consentimento para selantes de fissuras e fluorterapia (odontopediatria/prevenção)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na aplicação de selante de resina nas fissuras e sulcos de dentes posteriores (molares e pré-molares) e/ou na aplicação tópica de flúor (verniz, gel ou solução), com o objetivo de prevenir o aparecimento de cárie dentária, sendo especialmente indicado em crianças, adolescentes e pacientes com risco de cárie elevado.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Descolagem parcial ou total do selante ao longo do tempo, com necessidade de reaplicação periódica.
• Reação alérgica aos componentes do selante ou do produto fluoretado aplicado.
• Náusea ou desconforto transitório durante a aplicação, sobretudo em crianças pequenas.
• Ingestão inadvertida de pequena quantidade de produto durante o procedimento.
• Falso sentido de proteção total, sendo a manutenção de uma correta higiene oral e alimentação equilibrada indispensável mesmo após a aplicação.

ALTERNATIVAS DE TRATAMENTO
• Reforço exclusivo da higiene oral, da dieta e dos hábitos de escovagem, sem aplicação de selantes/flúor.
• Não realização do procedimento, mantendo-se o risco de cárie sem esta medida preventiva adicional.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (aplicação de selantes de fissuras e/ou flúor tópico com finalidade preventiva).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 20_Consentimento_para_Tratamento_de_Menores.docx
    key: 'consentimento-20-tratamento-de-menores',
    kind: 'consentimento',
    folder: 'odontopediatria',
    title: 'Consentimento para tratamento de menores',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Nome completo do responsável legal / encarregado de educação: ________________
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência do responsável legal: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O(a) menor identificado(a) neste documento será submetido(a) a exame clínico e/ou tratamento(s) de medicina dentária, mediante autorização do respetivo responsável legal, que declara deter os poderes necessários para prestar este consentimento em nome do menor. Os riscos específicos do(s) procedimento(s) concretamente indicado(s) para o menor serão informados de forma individualizada pelo médico dentista responsável, podendo corresponder aos descritos nos respetivos consentimentos específicos (ex.: restauração, extração, tratamento ortodôntico).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Riscos inerentes e específicos ao(s) procedimento(s) concretamente indicado(s) para o menor, a informar de forma individualizada pelo médico dentista antes da respetiva realização.
• Necessidade de gestão comportamental adequada à idade e ao grau de colaboração do menor, podendo implicar técnicas de contenção física suave, distração ou, em casos selecionados, sedação.
• Maior variabilidade de resposta ao tratamento e à anestesia local em função da idade e do desenvolvimento do menor.
• Necessidade de reagendamento ou adaptação do plano de tratamento em caso de falta de colaboração do menor.

ALTERNATIVAS DE TRATAMENTO
• Adiamento do tratamento não urgente para idade em que se preveja maior colaboração, quando clinicamente aceitável.
• Recurso a sedação consciente ou, em casos selecionados, anestesia geral em ambiente hospitalar, mediante consentimento específico.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (prestação de cuidados de medicina dentária a paciente menor de idade).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 21_Consentimento_para_Botox_Full_Face_Harmonizacao_Orofacial.docx
    key: 'consentimento-21-botox-full-face',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para Botox Full Face (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na aplicação de toxina botulínica, por via injetável, em diferentes zonas da face (ex.: terço superior: rugas frontais, glabelares e periorbitárias; terço médio; terço inferior/mandibular), com o objetivo de atenuar rugas dinâmicas, relaxar a musculatura de expressão e proporcionar harmonização facial, no âmbito da Harmonização Orofacial (HOF).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, vermelhidão, hematoma ou inchaço no(s) local(is) de aplicação.
• Assimetria facial temporária, incluindo assimetria do sorriso ou da expressão facial.
• Ptose palpebral ou da sobrancelha (queda transitória, por vezes com duração de várias semanas).
• Cefaleias após o procedimento.
• Diplopia (visão dupla) transitória em caso de difusão do produto para músculos oculares, em casos raros.
• Resultado não permanente, com necessidade de retratamento periódico (habitualmente 4 a 6 meses).
• Reação alérgica ao produto, ainda que rara.
• Resultado insuficiente ou assimétrico, com necessidade de retoque em consulta de reavaliação.

ALTERNATIVAS DE TRATAMENTO
• Outras técnicas de rejuvenescimento facial não injetáveis (ex.: skincare, peelings), com resultado distinto e habitualmente menos marcado sobre rugas dinâmicas.
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento está contraindicado, ou deve ser especialmente ponderado pelo médico, em caso de gravidez ou amamentação, doenças neuromusculares (ex.: miastenia gravis), infeção ativa na zona a tratar, ou alergia conhecida à toxina botulínica ou a qualquer um dos seus excipientes. O paciente deve informar o médico sobre toda a medicação habitual e antecedentes clínicos relevantes.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (aplicação de toxina botulínica em face completa, com finalidade estética).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 22_Consentimento_para_Preenchimento_Labial_Harmonizacao_Orofacial.docx
    key: 'consentimento-22-preenchimento-labial',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para preenchimento labial (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na injeção de ácido hialurónico nos lábios, com recurso a agulha e/ou cânula, com o objetivo de aumentar o volume, definir contornos, corrigir assimetrias labiais ou repor volume perdido com a idade, no âmbito da Harmonização Orofacial (HOF).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço, hematoma ou vermelhidão no local de aplicação, habitualmente com duração de alguns dias.
• Assimetria ou resultado diferente do esperado.
• Formação de nódulos, irregularidades palpáveis ou efeito Tyndall (coloração azulada) na área tratada.
• Reação alérgica ao produto injetado.
• Oclusão vascular (obstrução de um vaso sanguíneo), com risco de isquemia e necrose tecidual, complicação rara mas grave que pode exigir tratamento de urgência com hialuronidase.
• Reabsorção progressiva do produto ao longo do tempo (habitualmente 6 a 12 meses), com necessidade de retratamento para manter o resultado.
• Infeção local, incluindo reativação de herpes labial em pacientes com histórico da condição.

ALTERNATIVAS DE TRATAMENTO
• Técnicas não injetáveis de valorização labial (maquilhagem, skincare), com resultado limitado e não duradouro.
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento deve ser especialmente ponderado pelo médico em caso de gravidez ou amamentação, doenças autoimunes ativas, infeção ativa na zona a tratar, tendência a queloides ou cicatrização anómala, ou alergia conhecida ao ácido hialurónico. O paciente deve informar o médico sobre toda a medicação habitual, nomeadamente anticoagulantes.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (preenchimento labial com ácido hialurónico).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 23_Consentimento_para_Preenchimento_Facial_Harmonizacao_Orofacial.docx
    key: 'consentimento-23-preenchimento-facial',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para preenchimento facial (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na injeção de ácido hialurónico em zonas específicas da face (sulco nasogeniano, olheiras/região infraorbitária, região malar, mandíbula e/ou mento), com recurso a agulha e/ou cânula, com o objetivo de restaurar volume, redefinir contornos faciais e atenuar sinais de envelhecimento, no âmbito da Harmonização Orofacial (HOF).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço, hematoma ou vermelhidão no(s) local(is) de aplicação.
• Assimetria ou resultado diferente do esperado.
• Formação de nódulos, irregularidades ou efeito Tyndall (coloração azulada visível sob a pele), sobretudo na região das olheiras.
• Reação alérgica ao produto injetado.
• Oclusão vascular com risco de isquemia e necrose tecidual ou, em casos extremamente raros, compromisso da visão (cegueira), particularmente associado a aplicações na região glabelar, nasal e periorbitária.
• Migração do produto para zonas adjacentes à área tratada.
• Reabsorção progressiva do produto, com necessidade de retratamento periódico para manutenção do resultado.
• Infeção local no ponto de aplicação.

ALTERNATIVAS DE TRATAMENTO
• Bioestimuladores de colagénio, em alternativa ou complemento ao preenchimento com ácido hialurónico.
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento deve ser especialmente ponderado pelo médico em caso de gravidez ou amamentação, doenças autoimunes ativas, infeção ativa na zona a tratar, tendência a queloides ou cicatrização anómala, ou alergia conhecida ao ácido hialurónico. O paciente deve informar o médico sobre toda a medicação habitual, nomeadamente anticoagulantes.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (preenchimento facial com ácido hialurónico (sulco nasogeniano, olheiras, região malar, mandíbula e/ou mento)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 24_Consentimento_para_Bioestimulador_de_Colagenio_Harmonizacao_Orofacial.docx
    key: 'consentimento-24-bioestimulador-colagenio',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para bioestimulador de colagénio (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na injeção de um agente bioestimulador (ex.: à base de ácido poli-L-láctico, hidroxiapatite de cálcio ou similar), distribuído de forma difusa nas camadas profundas da pele, com o objetivo de estimular a produção natural de colagénio ao longo do tempo, melhorando progressivamente a firmeza, densidade e qualidade da pele, no âmbito da Harmonização Orofacial (HOF).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço, hematoma ou vermelhidão no local de aplicação.
• Resultados graduais e cumulativos, visíveis apenas algumas semanas após o(s) procedimento(s), habitualmente com necessidade de mais do que uma sessão (protocolo definido pelo médico).
• Formação de nódulos, pápulas ou granulomas subcutâneos, por vezes de aparecimento tardio.
• Assimetria ou resultado diferente do esperado.
• Reação alérgica ao produto.
• Necessidade de massagem pós-aplicação, conforme indicação do médico, para distribuição adequada do produto.

ALTERNATIVAS DE TRATAMENTO
• Preenchimento com ácido hialurónico, com efeito imediato mas de natureza distinta (volume vs. bioestimulação).
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento deve ser especialmente ponderado pelo médico em caso de gravidez ou amamentação, doenças autoimunes ativas, tendência a queloides ou granulomas, infeção ativa na zona a tratar, ou alergia conhecida aos componentes do produto.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (aplicação de bioestimulador de colagénio).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 25_Consentimento_para_Skinbooster_com_Peptidos_Harmonizacao_Orofacial.docx
    key: 'consentimento-25-skinbooster',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para Skinbooster com péptidos (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na microinjeção, em múltiplos pontos, de ácido hialurónico de baixa densidade associado a péptidos e/ou outros bioativos, com o objetivo de promover hidratação profunda, elasticidade e melhoria da qualidade global da pele, no âmbito da Harmonização Orofacial (HOF).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço, hematoma ou vermelhidão nos locais de aplicação (efeito de "picadas").
• Formação de pequenas pápulas ou vergões transitórios, que habitualmente desaparecem em poucas horas a dias.
• Resultado progressivo, com necessidade de sessões repetidas para obtenção e manutenção do efeito desejado.
• Reação alérgica ao produto.
• Infeção local no ponto de aplicação, em caso de assépsia inadequada.

ALTERNATIVAS DE TRATAMENTO
• Rotina de cuidados tópicos de hidratação, com resultado mais limitado e superficial.
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento deve ser especialmente ponderado pelo médico em caso de gravidez ou amamentação, infeção cutânea ativa na zona a tratar, ou alergia conhecida aos componentes do produto.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (aplicação de skinbooster com péptidos).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 26_Consentimento_para_Fios_de_Sustentacao_PDO_Harmonizacao_Orofacial.docx
    key: 'consentimento-26-fios-pdo',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para fios de sustentação PDO (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na inserção subcutânea, através de cânula ou agulha, de fios reabsorvíveis de polidioxanona (PDO), com o objetivo de proporcionar efeito de sustentação e tensor imediato e, a médio prazo, estimular a produção de colagénio na área tratada, no âmbito da Harmonização Orofacial (HOF).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, inchaço, hematoma ou vermelhidão nos locais de inserção.
• Assimetria, extrusão (saída) do fio através da pele, ou palpação/visualização do fio sob a pele.
• Formação de irregularidades, covinhas (dimples) ou franzido da pele na área tratada.
• Infeção local no trajeto do fio.
• Lesão de estruturas anatómicas adjacentes (nervos, vasos) durante a inserção.
• Resultado temporário, com reabsorção progressiva do material (habitualmente vários meses) e necessidade de retratamento para manutenção do efeito.

ALTERNATIVAS DE TRATAMENTO
• Preenchimento com ácido hialurónico e/ou bioestimuladores de colagénio, com mecanismo de ação distinto.
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento deve ser especialmente ponderado pelo médico em caso de gravidez ou amamentação, infeção ativa na zona a tratar, alterações da coagulação, ou tendência a queloides ou cicatrização anómala.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (aplicação de fios de sustentação (PDO)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 27_Consentimento_para_Toxina_Botulinica_no_Bruxismo_e_na_DTM.docx
    key: 'consentimento-27-toxina-botulinica-bruxismo-dtm',
    kind: 'consentimento',
    folder: 'estetica',
    title: 'Consentimento para toxina botulínica no bruxismo e na DTM',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na aplicação de toxina botulínica, por via injetável, na musculatura mastigatória (nomeadamente músculos masséteres e/ou temporais), com finalidade terapêutica, visando a redução da atividade parafuncional associada a bruxismo e/ou o alívio de sintomas dolorosos associados a disfunção temporomandibular (DTM), como coadjuvante de outras abordagens (ex.: goteira oclusal).

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Dor, hematoma ou inchaço no local de aplicação.
• Assimetria facial temporária ou alteração transitória do contorno facial (sobretudo ao nível do ângulo mandibular) e do sorriso.
• Dificuldade transitória na mastigação de alimentos mais consistentes, por redução da força muscular.
• Alteração transitória da fala ou da mímica facial, em caso de difusão do produto para músculos adjacentes.
• Resultado não permanente, com necessidade de retratamento periódico (habitualmente 4 a 6 meses).
• Reação alérgica ao produto, ainda que rara.
• Eficácia variável no controlo dos sintomas de DTM, dependente da causa subjacente.

ALTERNATIVAS DE TRATAMENTO
• Utilização de goteira oclusal (placa de mordida) como abordagem isolada ou complementar.
• Fisioterapia orofacial e/ou técnicas de gestão do stress, quando aplicável.
• Não realização do procedimento.

CONTRAINDICAÇÕES E ADVERTÊNCIAS
Este procedimento está contraindicado, ou deve ser especialmente ponderado pelo médico, em caso de gravidez ou amamentação, doenças neuromusculares, infeção ativa na zona a tratar, ou alergia conhecida à toxina botulínica.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (aplicação terapêutica de toxina botulínica para bruxismo e/ou disfunção temporomandibular (DTM)).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 28_Consentimento_para_Sedacao_Consciente.docx
    key: 'consentimento-28-sedacao-consciente',
    kind: 'consentimento',
    folder: 'geral',
    title: 'Consentimento para sedação consciente',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O procedimento consiste na administração de fármaco(s) sedativo(s) (ex.: por via inalatória com óxido nitroso, ou outra via indicada), coadjuvante à anestesia local, com o objetivo de reduzir a ansiedade e promover relaxamento durante o tratamento dentário, mantendo o paciente consciente, com reflexos protetores preservados e capaz de responder a estímulos e comandos verbais.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Náuseas, vómitos, tonturas ou sonolência prolongada após o procedimento.
• Reação alérgica ou adversa ao(s) fármaco(s) administrado(s).
• Depressão respiratória ou hipotensão, em casos raros, sobretudo em associação com outros fármacos ou patologias não informadas.
• Cefaleias ou desorientação transitória após a sedação.
• Amnésia parcial do procedimento (em sedações mais profundas, quando aplicável).
• Nível de sedação insuficiente ou, pelo contrário, superior ao esperado, com necessidade de ajuste da dose ou interrupção do procedimento.
• Necessidade de acompanhante para regresso a casa e restrição de condução, uso de máquinas ou decisões importantes no período pós-sedação imediato.

ALTERNATIVAS DE TRATAMENTO
• Realização do tratamento apenas sob anestesia local, sem sedação.
• Anestesia geral em ambiente hospitalar, em casos clinicamente justificados ou de maior complexidade/ansiedade.
• Não realização do procedimento.

CUIDADOS PRÉVIOS E PÓS-SEDAÇÃO
O paciente deve informar previamente sobre alergias, medicação habitual, antecedentes clínicos relevantes (cardíacos, respiratórios, entre outros) e cumprir o período de jejum indicado, quando aplicável, devendo fazer-se acompanhar por um adulto responsável, que o deverá acompanhar até casa e permanecer com o paciente nas horas seguintes ao procedimento.

DECLARAÇÃO DE CONSENTIMENTO
Declaro que fui devidamente informado(a) pelo médico dentista responsável, em linguagem clara, objetiva e acessível, sobre o meu diagnóstico e sobre a natureza, os objetivos, a forma de execução e a duração previsível do procedimento acima identificado (sedação consciente coadjuvante ao procedimento dentário).

Fui igualmente informado(a), de forma detalhada, sobre os riscos, complicações e efeitos secundários possíveis descritos no presente documento (não sendo estes necessariamente exaustivos, dada a variabilidade da resposta biológica de cada paciente), sobre os benefícios esperados, sobre as alternativas de tratamento disponíveis, incluindo, quando aplicável, a possibilidade de não realizar qualquer tratamento e as respetivas consequências previsíveis, e sobre os cuidados a observar antes e após o procedimento.

Tive oportunidade de colocar todas as questões que considerei pertinentes, as quais foram esclarecidas de forma satisfatória e compreensível, e declaro compreender que a Medicina Dentária, tal como as demais ciências da saúde, não é uma ciência exata, pelo que não me foi dada, nem por mim exigida, qualquer garantia quanto ao resultado final do tratamento.

Autorizo o médico dentista responsável, e os demais profissionais que este entenda dever envolver, a realizar o procedimento acima descrito, bem como a adotar, no decurso da sua execução, os procedimentos adicionais, complementares ou alternativos que se revelem clinicamente necessários e razoáveis perante intercorrências imprevistas, exceto quanto a atos que eu tenha expressa e previamente recusado.

Comprometo-me a cumprir as indicações e recomendações pré e pós-operatórias transmitidas pelo médico dentista e a informar, antes do início do tratamento, qualquer alteração relevante do meu estado de saúde, alergias ou medicação habitual.

Declaro que presto o presente consentimento de forma livre, voluntária, consciente e esclarecida, podendo revogá-lo a qualquer momento antes da realização do procedimento, sem necessidade de justificação e sem que daí resulte prejuízo para o meu direito a cuidados de saúde.`,
  },
  {
    // 29_Termo_de_Recusa_de_Tratamento.docx
    key: 'termo-29-recusa-de-tratamento',
    kind: 'termo',
    folder: 'geral',
    title: 'Termo de recusa de tratamento',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O(a) paciente abaixo identificado(a) declara ter sido devidamente informado(a) pelo médico dentista sobre o diagnóstico, o(s) tratamento(s) recomendado(s), a forma de execução, os riscos da sua não realização e as alternativas terapêuticas existentes (incluindo, quando aplicável, outras opções de tratamento), optando, no entanto e por vontade própria, informada e esclarecida, por não realizar o tratamento proposto neste momento, assumindo a responsabilidade pelas consequências clínicas previsíveis decorrentes desta decisão.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Agravamento do quadro clínico atualmente diagnosticado.
• Progressão de processos infeciosos, cariogénicos ou periodontais não tratados.
• Perda dentária, dor, abcessos ou outras complicações associadas à ausência de tratamento.
• Disseminação de infeção a estruturas ou espaços anatómicos vizinhos, em casos mais graves.
• Necessidade de tratamentos mais complexos, morosos e/ou dispendiosos no futuro, incluindo eventual necessidade de extração de dentes atualmente tratáveis de forma conservadora.
• Impacto funcional (mastigação, fala) e estético decorrente da evolução natural da situação não tratada.

DECLARAÇÃO DE RECUSA
Declaro que fui devidamente informado(a), em linguagem clara e acessível, sobre o meu diagnóstico, sobre o tratamento recomendado pelo médico dentista, sobre a forma como o mesmo seria executado, sobre os riscos e consequências previsíveis da sua não realização e sobre as alternativas de tratamento existentes, tendo tido oportunidade de esclarecer todas as minhas dúvidas.

Compreendo integralmente as informações que me foram transmitidas e, ainda assim, por vontade própria, livre e esclarecida, decido não autorizar a realização do tratamento acima identificado neste momento, assumindo a responsabilidade pelas consequências clínicas que possam advir desta minha decisão, e isentando o médico dentista e a CENTRO DENTÁRIO COLOMBO de responsabilidade pelas mesmas.

Fui informado(a) de que poderei, a qualquer momento, reconsiderar esta decisão e solicitar a realização do tratamento, mediante nova avaliação clínica.`,
  },
  {
    // 30_Termo_de_Responsabilidade_por_Interrupcao_de_Tratamento.docx
    key: 'termo-30-interrupcao-de-tratamento',
    kind: 'termo',
    folder: 'geral',
    title: 'Termo de responsabilidade por interrupção de tratamento',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
N.º Cartão de Cidadão / BI / Passaporte / Título de Residência: ________________
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESCRIÇÃO DO PROCEDIMENTO
O(a) paciente abaixo identificado(a) iniciou um plano de tratamento na clínica que, por decisão própria, informada e esclarecida, opta por interromper antes da sua conclusão, tendo sido previamente esclarecido(a) pelo médico dentista sobre o estado atual do tratamento, os passos ainda necessários à sua finalização, os riscos da não conclusão e as consequências clínicas previsíveis desta interrupção.

RISCOS, COMPLICAÇÕES E EFEITOS SECUNDÁRIOS POSSÍVEIS
• Instabilidade ou insucesso de tratamentos deixados incompletos (ex.: tratamento endodôntico sem restauração final, preparo dentário sem prótese definitiva, prótese provisória mantida além do previsto).
• Progressão de processos infeciosos, cariogénicos ou periodontais não totalmente resolvidos.
• Perda de dentes, estruturas dentárias ou próteses provisórias em uso, na ausência de finalização adequada do tratamento.
• Necessidade de retratamento, com possível aumento de custo, complexidade e duração, caso o paciente decida retomar o tratamento no futuro.

DECLARAÇÃO DE RESPONSABILIDADE
Declaro que fui devidamente informado(a), em linguagem clara e acessível, sobre o estado atual do meu tratamento, sobre os passos ainda necessários à sua conclusão, sobre os riscos e consequências previsíveis da sua não finalização e sobre as alternativas existentes, tendo tido oportunidade de esclarecer todas as minhas dúvidas.

Compreendo integralmente as informações transmitidas e, ainda assim, por vontade própria, livre e esclarecida, decido interromper o tratamento acima identificado, assumindo a responsabilidade pelas consequências clínicas que possam advir desta decisão, e isentando o médico dentista e a CENTRO DENTÁRIO COLOMBO de responsabilidade pelas mesmas.

Fui informado(a) de que poderei, a qualquer momento, retomar o tratamento, mediante nova avaliação clínica e eventual atualização do plano de tratamento e dos respetivos custos.`,
  },
  {
    // 01_Orientacoes_Apos_Anestesia_Local.docx
    key: 'orientacoes-01-anestesia-local',
    kind: 'pos-operatorio',
    folder: 'geral',
    title: 'Orientações após anestesia local',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Estas orientações aplicam-se ao período em que o efeito da anestesia local ainda não terminou, habitualmente entre 1 a 4 horas após o procedimento.

NAS PRIMEIRAS HORAS
• Evite comer ou beber enquanto sentir a boca, o lábio ou a língua dormentes, para prevenir mordeduras acidentais.
• Tenha especial cuidado com bebidas quentes, uma vez que a sensibilidade à temperatura está reduzida e o risco de queimadura é maior.
• Em crianças, mantenha vigilância redobrada, pois é frequente morderem o lábio ou a bochecha sem perceberem.

CUIDADOS GERAIS E RECOMENDAÇÕES
• O efeito da anestesia desaparece progressivamente, começando habitualmente pela zona mais afastada do ponto de aplicação.
• É normal sentir um ligeiro desconforto ou sensibilidade no local da injeção nas horas seguintes.

O QUE DEVE EVITAR
• Não mastigue do lado anestesiado enquanto não recuperar a sensibilidade normal.
• Evite tocar, morder ou esfregar repetidamente a zona dormente.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Dormência que persista mais de 6 a 8 horas após o procedimento.
• Inchaço progressivo, dificuldade em respirar ou engolir.
• Erupção cutânea, comichão generalizada ou outros sinais de reação alérgica.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 02_Orientacoes_Apos_Restauracao_Dentaria.docx
    key: 'orientacoes-02-restauracao-dentaria',
    kind: 'pos-operatorio',
    folder: 'dentisteria',
    title: 'Orientações após restauração dentária',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a colocação de uma restauração (obturação), é normal alguma sensibilidade nas primeiras horas ou dias, que tende a diminuir progressivamente.

NAS PRIMEIRAS HORAS
• Se foi utilizada anestesia local, evite mastigar ou comer alimentos quentes enquanto persistir a dormência.

CUIDADOS GERAIS E RECOMENDAÇÕES
• É normal sentir sensibilidade ao frio, ao calor ou à pressão mastigatória durante alguns dias após o procedimento.
• Mantenha a escovagem e o uso de fio dentário habituais, com especial cuidado na zona tratada nas primeiras 24 horas.
• Se a restauração ficar com a mordida a parecer alta ou desconfortável, contacte a clínica para um pequeno ajuste.

O QUE DEVE EVITAR
• Evite alimentos e bebidas muito quentes, muito frios ou muito açucarados nas primeiras 24 a 48 horas.
• Evite mastigar alimentos duros ou pegajosos diretamente sobre a restauração recente.

REAVALIAÇÃO E ACOMPANHAMENTO
A sensibilidade deve diminuir progressivamente ao longo de 1 a 2 semanas. Caso persista ou se agrave, contacte a clínica para reavaliação, podendo ser necessário avaliar a necessidade de tratamento endodôntico.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Dor espontânea, intensa ou que piora progressivamente, sobretudo à noite.
• Sensibilidade que não diminui ou que se agrava após 1 a 2 semanas.
• Fratura, queda ou deslocamento da restauração.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 03_Orientacoes_Apos_Tratamento_Endodontico.docx
    key: 'orientacoes-03-tratamento-endodontico',
    kind: 'pos-operatorio',
    folder: 'endodontia',
    title: 'Orientações após tratamento endodôntico',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

O tratamento de canal radicular (endodontia) pode causar algum desconforto nos dias seguintes, enquanto os tecidos ao redor do dente cicatrizam.

NAS PRIMEIRAS HORAS
• Evite mastigar do lado tratado enquanto persistir a dormência da anestesia.
• É normal sentir o dente "diferente" ou ligeiramente sensível à mordida nas primeiras 48 a 72 horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Mantenha a escovagem e o uso de fio dentário normais, incluindo na zona tratada.
• Se foi colocada uma restauração provisória, evite alimentos pegajosos ou duros que possam deslocá-la.
• É fundamental agendar a colocação da restauração definitiva (obturação ou coroa) no prazo indicado pelo médico dentista, para proteger o dente de fratura.

O QUE DEVE EVITAR
• Evite mastigar alimentos duros ou pegajosos diretamente sobre o dente tratado até à colocação da restauração definitiva.
• Evite adiar a consulta de finalização do tratamento (restauração ou coroa definitiva).

MEDICAÇÃO
Tome a medicação analgésica e/ou anti-inflamatória apenas conforme prescrita pelo médico dentista, respeitando doses e horários indicados.

REAVALIAÇÃO E ACOMPANHAMENTO
Será agendada consulta de reavaliação e, quando aplicável, radiografia de controlo a médio prazo para confirmar a cicatrização da zona periapical.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Dor intensa, latejante ou crescente, que não melhora com a medicação prescrita.
• Inchaço da face, gengiva ou pescoço.
• Febre, mau sabor ou saída de secreção no local tratado.
• Sensação de "dente mais alto" que impede o encerramento normal da boca.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 04_Orientacoes_Apos_Branqueamento_Dentario.docx
    key: 'orientacoes-04-branqueamento',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após branqueamento dentário',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

É normal sentir alguma sensibilidade dentária durante e após o branqueamento, que tende a desaparecer em 24 a 48 horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Nas primeiras 48 horas, os dentes ficam mais suscetíveis a manchas, pelo que se recomenda seguir uma "dieta da cor branca".
• Retome a escovagem habitual, de preferência com pasta dentífrica para dentes sensíveis, se indicado pelo médico dentista.

O QUE DEVE EVITAR
• Evite café, chá, vinho tinto, molho de soja, beterraba e outros alimentos ou bebidas fortemente pigmentados nas primeiras 48 horas.
• Evite fumar ou consumir produtos de tabaco durante o mesmo período.
• Evite bebidas muito ácidas (refrigerantes, sumos cítricos) que possam aumentar a sensibilidade.

REAVALIAÇÃO E ACOMPANHAMENTO
O resultado final estabiliza ao longo de 1 a 2 semanas. Sessões de manutenção periódicas ajudam a prolongar o efeito obtido.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Sensibilidade dentária intensa ou persistente que não melhora após alguns dias.
• Irritação, queimadura ou lesão nos tecidos moles (gengiva, lábios) da boca.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 05_Orientacoes_Apos_Colocacao_de_Facetas_Dentarias.docx
    key: 'orientacoes-05-facetas',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após colocação de facetas dentárias',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a cimentação das facetas, é normal alguma sensibilidade e um curto período de adaptação da língua e dos lábios à nova forma dos dentes.

NAS PRIMEIRAS HORAS
• Evite mastigar enquanto persistir a dormência da anestesia local, se aplicada.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Mantenha uma escovagem suave mas regular, e o uso de fio dentário, incluindo nas margens das facetas.
• É normal notar sensibilidade ao frio ou calor nos primeiros dias, sobretudo se houve desgaste de esmalte.
• Caso tenha usado facetas provisórias antes da cimentação definitiva, trate-as com cuidado redobrado.

O QUE DEVE EVITAR
• Evite morder objetos duros (canetas, unhas, gelo) ou usar os dentes como ferramenta.
• Evite alimentos muito duros ou pegajosos nos primeiros dias após a cimentação.
• Se tiver hábito de bruxismo (apertar ou ranger os dentes), fale com o médico dentista sobre o uso de goteira de proteção noturna.

REAVALIAÇÃO E ACOMPANHAMENTO
Será agendada uma consulta de reavaliação para confirmar o ajuste oclusal (mordida) e a adaptação gengival às facetas.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Fratura, lascamento ou descolagem de uma faceta.
• Dor persistente ou sensibilidade que não diminui ao longo de 1 a 2 semanas.
• Sensação de mordida desalinhada ou desconfortável.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 06_Orientacoes_Apos_Extracao_Dentaria_Simples.docx
    key: 'orientacoes-06-extracao-simples',
    kind: 'pos-operatorio',
    folder: 'cirurgia',
    title: 'Orientações após extração dentária simples',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Os cuidados nas primeiras 24 a 48 horas são fundamentais para uma boa cicatrização do alvéolo e para prevenir complicações como a alveolite.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme e constante durante 30 a 45 minutos, sem a remover antes desse tempo.
• Aplique gelo (De acordo com a orientação do seu médico dentista).
• Mantenha a cabeça elevada, mesmo durante o repouso, nas primeiras horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Após as primeiras 24 horas, pode iniciar bochechos com muita suavidade, com água fria (de acordo com a orientação do seu médico dentista).
• Alimente-se com dieta mole e fria nas primeiras 24 horas (iogurte, puré), evoluindo gradualmente para a alimentação normal.
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

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 07_Orientacoes_Apos_Cirurgia_de_Extracao_de_Dentes_do_Siso.docx
    key: 'orientacoes-07-dentes-do-siso',
    kind: 'pos-operatorio',
    folder: 'cirurgia',
    title: 'Orientações após cirurgia de extração de dentes do siso',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

A recuperação após a extração de dentes inclusos ou semi-inclusos (siso) é habitualmente mais prolongada do que numa extração simples, com inchaço e desconforto esperados nos primeiros dias.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme durante 30 a 45 minutos após a cirurgia.
• Aplique gelo na face (De acordo com a orientação do seu médico dentista).
• Repouse com a cabeça elevada nas primeiras 24 a 48 horas, evitando esforços.

CUIDADOS GERAIS E RECOMENDAÇÕES
• O inchaço é normal e tende a aumentar até ao 2.º ou 3.º dia, diminuindo progressivamente a partir do 4.º dia.
• A partir do dia seguinte à cirurgia, faça bochechos suaves (De acordo com a orientação do seu médico dentista).
• Alimente-se com dieta mole e fria nas primeiras 24 horas (puré, iogurte, batido). A sopa morna só deve ser introduzida após as primeiras 24 horas, evoluindo gradualmente conforme o conforto permitir.
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

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 08_Orientacoes_Apos_Colocacao_de_Implantes_Dentarios.docx
    key: 'orientacoes-08-implantes-dentarios',
    kind: 'pos-operatorio',
    folder: 'implantologia',
    title: 'Orientações após colocação de implantes dentários',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Nos primeiros dias após a cirurgia de colocação do implante é normal algum inchaço, sensibilidade e um pequeno hematoma na zona tratada.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme durante 30 a 45 minutos.
• Aplique gelo na face (De acordo com a orientação do seu médico dentista).
• Repouse com a cabeça elevada nas primeiras 24 a 48 horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Faça bochechos suaves (com indicação do seu médico dentista), ou com o colutório indicado pelo médico dentista, a partir do dia seguinte à cirurgia.
• Mantenha uma dieta mole e fria nos primeiros dias, evoluindo gradualmente conforme o conforto permitir.
• Escove os restantes dentes normalmente, evitando apenas trauma direto na zona operada nos primeiros dias.
• Respeite rigorosamente o período de ósseo integração indicado pelo médico dentista antes da colocação da coroa/prótese definitiva.

O QUE DEVE EVITAR
• Não fume durante o período de cicatrização, uma vez que o tabaco compromete significativamente a ósseo integração do implante.
• Evite mastigar diretamente sobre a zona do implante enquanto não for autorizado pelo médico dentista.
• Evite exercício físico intenso e esforços durante a primeira semana.
• Evite tocar ou pressionar a zona operada com a língua ou dedos.

MEDICAÇÃO
Tome a medicação analgésica, anti-inflamatória e/ou antibiótica exatamente conforme prescrita pelo médico dentista.

REAVALIAÇÃO E ACOMPANHAMENTO
Serão agendadas consultas de controlo periódicas para acompanhar a cicatrização e a ósseo integração, até à fase de reabilitação protética definitiva.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia abundante ou persistente.
• Inchaço ou dor que aumentam progressivamente após o 3.º ou 4.º dia.
• Febre, mau odor ou saída de secreção na zona do implante.
• Mobilidade percetível do implante.
• Dormência do lábio ou queixo que persiste para além do esperado.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 09_Orientacoes_Apos_Enxerto_Osseo_Levantamento_de_Seio_Maxilar.docx
    key: 'orientacoes-09-enxerto-osseo-seio-maxilar',
    kind: 'pos-operatorio',
    folder: 'implantologia',
    title: 'Orientações após enxerto ósseo / levantamento de seio maxilar',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Esta cirurgia requer cuidados pós-operatórios mais rigorosos do que uma extração ou implante convencional, dado o maior risco de inchaço e de complicações sinusais.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida com pressão firme durante 30 a 45 minutos.
• Aplique gelo na face em ciclos de 15 a 20 minutos durante as primeiras 24 a 48 horas.
• Repouse com a cabeça elevada durante pelo menos 48 horas, evitando deitar-se completamente na horizontal.

CUIDADOS GERAIS E RECOMENDAÇÕES
• O inchaço e o hematoma são esperados e podem ser mais acentuados e prolongados do que numa cirurgia convencional, atingindo o pico entre o 2.º e 4.º dia.
• Alimente-se com dieta mole e fria nos primeiros dias.
• Mantenha a higiene oral geral, com bochechos suaves a partir do dia seguinte, conforme indicado.

O QUE DEVE EVITAR
• Não assoe o nariz nem espirre com a boca fechada durante pelo menos 2 semanas, sobretudo em procedimentos de elevação do seio maxilar; se necessário espirrar, faça-o com a boca aberta.
• Não fume durante todo o período de cicatrização.
• Evite viajar de avião, mergulhar ou praticar atividades com alterações de pressão (incluindo esforço físico intenso) enquanto não for autorizado pelo médico dentista.
• Não use palhinha nem faça bochechos vigorosos nos primeiros dias.

MEDICAÇÃO
Tome rigorosamente a medicação prescrita (analgésicos, anti-inflamatórios, antibióticos e, quando indicado, descongestionante nasal), respeitando doses e horários.

REAVALIAÇÃO E ACOMPANHAMENTO
O período de integração do enxerto é habitualmente mais longo (vários meses) antes da colocação de implantes. Serão agendadas consultas de controlo periódicas.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia nasal persistente ou saída de líquido pelo nariz.
• Dor ou inchaço que aumentam após o 4.º dia, ou febre.
• Congestão nasal intensa, dor sinusal ou sinais de infeção sinusal.
• Exposição visível de material de enxerto na boca.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 10_Orientacoes_Apos_Biopsia_Oral.docx
    key: 'orientacoes-10-biopsia-oral',
    kind: 'pos-operatorio',
    folder: 'cirurgia',
    title: 'Orientações após biópsia oral',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a recolha da amostra de tecido, é normal algum desconforto, inchaço ligeiro e sensibilidade na zona da biópsia durante os primeiros dias.

NAS PRIMEIRAS HORAS
• Morda a compressa fornecida durante 20 a 30 minutos, se indicado.
• Aplique gelo na zona externa correspondente, se o inchaço for significativo.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Faça bochechos suaves com água morna e sal a partir do dia seguinte à biópsia.
• Mantenha a zona limpa, evitando trauma direto durante a escovagem.

O QUE DEVE EVITAR
• Evite alimentos duros, picantes, ácidos ou muito quentes que possam irritar a zona da biópsia.
• Evite tocar ou manipular a zona com a língua ou dedos.
• Não fume nem consuma álcool durante os primeiros dias.

REAVALIAÇÃO E ACOMPANHAMENTO
O resultado da análise histopatológica será comunicado assim que disponível, habitualmente em 1 a 3 semanas, sendo então agendada consulta para discussão dos resultados e, se necessário, definição de tratamento adicional.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia persistente no local da biópsia.
• Dor crescente, inchaço significativo ou febre.
• Sinais de infeção (secreção, mau odor) na zona operada.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 11_Orientacoes_Apos_Tratamento_Periodontal_Raspagem_e_Alisamento_Radicular.docx
    key: 'orientacoes-11-tratamento-periodontal',
    kind: 'pos-operatorio',
    folder: 'periodontia',
    title: 'Orientações após tratamento periodontal (raspagem e alisamento radicular)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a raspagem e alisamento radicular, é comum alguma sensibilidade dentária e gengival nos dias seguintes, enquanto os tecidos cicatrizam.

NAS PRIMEIRAS HORAS
• Se foi utilizada anestesia local, evite mastigar enquanto persistir a dormência.

CUIDADOS GERAIS E RECOMENDAÇÕES
• É normal sentir os dentes mais sensíveis ao frio durante alguns dias a semanas.
• Mantenha a escovagem suave mas regular, com escova de cerdas macias, e o uso de fio dentário ou escovilhões interdentários conforme orientado.
• Utilize o colutório recomendado pelo médico dentista, se prescrito.

O QUE DEVE EVITAR
• Evite alimentos muito quentes, frios ou ácidos nas primeiras 24 a 48 horas.
• Evite escovagem agressiva que possa traumatizar a gengiva sensibilizada.

REAVALIAÇÃO E ACOMPANHAMENTO
Serão agendadas sessões de manutenção periódica (destartarização de suporte), habitualmente a cada 3 a 6 meses, essenciais para o controlo a longo prazo da doença periodontal.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia gengival persistente que não cede após 48 horas.
• Dor intensa ou inchaço que se agrava.
• Sensibilidade dentária severa que interfere com a alimentação normal.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 12_Orientacoes_Apos_Cirurgia_Periodontal.docx
    key: 'orientacoes-12-cirurgia-periodontal',
    kind: 'pos-operatorio',
    folder: 'periodontia',
    title: 'Orientações após cirurgia periodontal',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

A cirurgia periodontal exige cuidados semelhantes aos de outras cirurgias orais, com atenção especial à zona de sutura e, quando aplicável, à área doadora do enxerto gengival.

NAS PRIMEIRAS HORAS
• Aplique gelo na face, do lado tratado, em ciclos de 15 a 20 minutos, durante as primeiras 24 horas.
• Repouse com a cabeça elevada nas primeiras 24 a 48 horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Faça bochechos suaves com o colutório antisséptico indicado pelo médico dentista, evitando bochechos vigorosos.
• Mantenha uma dieta mole e fria nos primeiros dias.
• Escove os restantes dentes normalmente, evitando a zona operada até indicação em contrário.
• Se foi realizado enxerto gengival com área doadora no palato, tenha cuidado redobrado com essa zona, que pode estar coberta por um curativo (placa palatina).

O QUE DEVE EVITAR
• Não escove nem passe fio dentário diretamente na zona operada enquanto não for autorizado.
• Não fume nem consuma álcool durante o período de cicatrização.
• Evite alimentos duros, picantes ou muito quentes nos primeiros dias.
• Evite puxar o lábio ou a bochecha para inspecionar a zona operada.

MEDICAÇÃO
Tome a medicação prescrita (analgésicos, anti-inflamatórios e/ou antibióticos) exatamente conforme indicado.

REAVALIAÇÃO E ACOMPANHAMENTO
Será agendada consulta para remoção de pontos (se não reabsorvíveis), habitualmente entre 7 e 14 dias, e posteriormente consultas de manutenção periodontal periódica.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Hemorragia abundante ou persistente.
• Deiscência (abertura) da sutura.
• Dor ou inchaço crescentes, ou febre.
• Queda do curativo palatino acompanhada de dor intensa, quando aplicável.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 13_Orientacoes_Apos_Reabilitacao_Protetica_Fixa_Coroas_e_Pontes.docx
    key: 'orientacoes-13-protese-fixa',
    kind: 'pos-operatorio',
    folder: 'protese',
    title: 'Orientações após reabilitação protética fixa (coroas e pontes)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a colocação de coroas ou pontes fixas, é normal um curto período de adaptação da mordida, da fala e da sensibilidade dos dentes pilares.

NAS PRIMEIRAS HORAS
• Evite mastigar enquanto persistir a dormência da anestesia local, se aplicada.
• Se está a usar prótese provisória, evite alimentos duros ou pegajosos que a possam deslocar ou fraturar.

CUIDADOS GERAIS E RECOMENDAÇÕES
• É normal sentir sensibilidade ao frio ou à pressão mastigatória nos dentes preparados durante alguns dias.
• Mantenha a escovagem habitual, com atenção especial à margem da coroa/ponte, e utilize fio dentário sempre, inclusive por baixo dos pônticos (dentes artificiais da ponte), quando aplicável.
• Dê tempo à língua e aos lábios para se adaptarem à nova forma e contorno da reabilitação.

O QUE DEVE EVITAR
• Evite morder objetos duros ou usar os dentes como ferramenta.
• Evite alimentos muito duros ou pegajosos, sobretudo nos primeiros dias após a cimentação definitiva.

REAVALIAÇÃO E ACOMPANHAMENTO
Será agendada consulta de reavaliação para confirmar o ajuste oclusal (mordida) e o conforto da reabilitação.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Descimentação, mobilidade ou fratura da coroa/ponte.
• Dor persistente ou crescente no dente pilar.
• Sensação de mordida desalinhada que não melhora após alguns dias.
• Inflamação ou hemorragia gengival persistente na margem da prótese.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 14_Orientacoes_Apos_Colocacao_de_Protese_Removivel_Total_ou_Parcial.docx
    key: 'orientacoes-14-protese-removivel',
    kind: 'pos-operatorio',
    folder: 'protese',
    title: 'Orientações após colocação de prótese removível (total ou parcial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

O período de adaptação a uma prótese removível nova pode demorar algumas semanas, sendo normal algum desconforto inicial.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Use a prótese conforme indicado pelo médico dentista, retirando-a durante a noite salvo indicação em contrário.
• Higienize a prótese diariamente com escova própria e produto adequado, nunca com pasta dentífrica abrasiva.
• Mantenha também a higiene da mucosa oral e dos dentes remanescentes.
• É normal sentir aumento da salivação, ligeira dificuldade na fala ou sensação de "volume" na boca nos primeiros dias, que tende a melhorar com o uso.

O QUE DEVE EVITAR
• Evite alimentos muito duros ou pegajosos enquanto não estiver totalmente adaptado à prótese.
• Não durma com a prótese colocada, salvo indicação médica específica.
• Não tente ajustar a prótese por conta própria (limar, dobrar) em caso de desconforto.

REAVALIAÇÃO E ACOMPANHAMENTO
Poderão ser necessários ajustes progressivos nas primeiras semanas de uso, que fazem parte do processo normal de adaptação. Compareça às consultas de reavaliação e acompanhamento agendadas, mesmo que o desconforto seja ligeiro.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Feridas ou úlceras na mucosa que não cicatrizam em poucos dias.
• Dor persistente que impede a alimentação normal.
• Fratura da prótese.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 15_Orientacoes_Durante_o_Tratamento_Ortodontico.docx
    key: 'orientacoes-15-tratamento-ortodontico',
    kind: 'pos-operatorio',
    folder: 'ortodontia',
    title: 'Orientações durante o tratamento ortodôntico',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

O desconforto após colocação, ativações ou ajustes do aparelho ortodôntico é normal e esperado, melhorando progressivamente em poucos dias.

CUIDADOS GERAIS E RECOMENDAÇÕES
• É normal sentir os dentes sensíveis à mastigação durante 2 a 4 dias após cada ativação ou troca de alinhadores.
• Utilize cera ortodôntica sobre brackets ou fios que estejam a irritar a mucosa, lábios ou bochechas.
• Mantenha uma escovagem cuidadosa após cada refeição, com escova apropriada para ortodontia, e utilize escovilhões interdentários e/ou fio dentário próprio para passar por baixo do fio.
• Se usa alinhadores removíveis, respeite rigorosamente o tempo de uso diário indicado (habitualmente 20 a 22 horas por dia).

O QUE DEVE EVITAR
• Evite alimentos duros, pegajosos ou que exijam morder diretamente (pipocas, gomas, caramelos, gelo, frutos secos inteiros).
• Evite bebidas açucaradas ou muito ácidas, que aumentam o risco de cárie e descalcificação junto ao aparelho.
• Não retire, dobre nem ajuste componentes do aparelho por conta própria.

REAVALIAÇÃO E ACOMPANHAMENTO
Compareça a todas as consultas de acompanhamento e ativação agendadas, essenciais para o progresso do tratamento. O não comparecimento pode ocasionar efeitos adversos, complicações e prolongamento do tratamento. A fratura ou descolagem dos aparelhos pode ocasionar danos nos dispositivos, exigindo consultas adicionais e reparações. No final, o uso do dispositivo de contenção conforme indicado é fundamental para manter o resultado obtido.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Bracket, fio ou componente do aparelho solto ou partido, a causar ferimento.
• Dor intensa e persistente, muito além do desconforto habitual após ativação.
• Feridas na mucosa que não melhoram com o uso de cera ortodôntica.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 16_Orientacoes_Apos_Selantes_de_Fissuras_e_Fluorterapia.docx
    key: 'orientacoes-16-selantes-fluorterapia',
    kind: 'pos-operatorio',
    folder: 'odontopediatria',
    title: 'Orientações após selantes de fissuras e fluorterapia',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

A aplicação de selantes de fissuras e/ou flúor tópico é um procedimento simples e preventivo, com recuperação imediata.

NAS PRIMEIRAS HORAS
• Aguarde cerca de 30 minutos antes de comer ou beber, para permitir a fixação adequada do produto aplicado.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Mantenha a rotina normal de higiene oral, escovando os dentes pelo menos duas vezes por dia.
• O selante deve ser verificado periodicamente nas consultas de rotina, uma vez que pode desgastar-se ao longo do tempo.

O QUE DEVE EVITAR
• Evite alimentos muito duros ou pegajosos nas primeiras horas após a aplicação.

REAVALIAÇÃO E ACOMPANHAMENTO
A eficácia preventiva depende da manutenção de uma boa higiene oral e de uma dieta equilibrada, mesmo com o selante ou flúor aplicados.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Desconforto ou reação incomum que persista para além do dia da aplicação.
• Perceção de que o selante se destacou ou desgastou.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 17_Orientacoes_Apos_Botox_Full_Face_Harmonizacao_Orofacial.docx
    key: 'orientacoes-17-botox-full-face',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após Botox Full Face (harmonização orofacial)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

O resultado da aplicação de toxina botulínica desenvolve-se progressivamente ao longo de 3 a 14 dias. Os cuidados nas primeiras horas ajudam a otimizar o resultado e a reduzir o risco de complicações.

NAS PRIMEIRAS HORAS
• Mantenha-se na posição vertical (sentado ou em pé) durante pelo menos 4 horas após a aplicação.
• Não deite nem incline a cabeça para a frente durante as primeiras 4 horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Pode aplicar gelo (envolto em pano) sobre eventuais hematomas ou inchaço ligeiro, sem exercer pressão sobre a zona tratada.
• É normal alguma vermelhidão ou pequenos hematomas nos pontos de aplicação, que desaparecem em poucos dias.

O QUE DEVE EVITAR
• Não massaje, pressione ou manipule a zona tratada durante pelo menos 24 horas.
• Evite exercício físico intenso, exposição solar prolongada, sauna ou banho turco durante as 24 a 48 horas seguintes.
• Evite consumo de álcool nas 24 horas seguintes, pois pode aumentar o risco de hematomas.
• Evite tratamentos faciais, massagens estéticas ou procedimentos dermatológicos na zona tratada durante pelo menos 2 semanas.

REAVALIAÇÃO E ACOMPANHAMENTO
O resultado definitivo deve ser avaliado após 2 semanas. Se necessário, poderá ser agendado um pequeno retoque nessa consulta de reavaliação.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Queda acentuada da pálpebra ou da sobrancelha (ptose) que cause desconforto significativo.
• Visão dupla, turva ou outras alterações visuais.
• Dificuldade em engolir, falar ou respirar.
• Inchaço ou vermelhidão intensos e crescentes, ou sinais de infeção.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 18_Orientacoes_Apos_Preenchimento_Labial.docx
    key: 'orientacoes-18-preenchimento-labial',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após preenchimento labial',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

É normal algum inchaço, sensibilidade e pequenos hematomas nos lábios após o preenchimento com ácido hialurónico, que diminuem progressivamente ao longo de alguns dias.

NAS PRIMEIRAS HORAS
• Aplique gelo (envolto em pano) sobre os lábios, em ciclos curtos, nas primeiras horas, para reduzir o inchaço.

CUIDADOS GERAIS E RECOMENDAÇÕES
• O inchaço é normalmente mais acentuado nas primeiras 24 a 48 horas, podendo o resultado final só ser avaliado após cerca de 2 semanas.
• Mantenha os lábios hidratados com um bálsamo labial suave.

O QUE DEVE EVITAR
• Evite massajar ou pressionar os lábios nas primeiras 24 a 48 horas, salvo indicação específica do médico.
• Evite exposição solar direta, solário, sauna e exercício físico intenso nas 48 horas seguintes.
• Evite maquilhagem labial nas primeiras 12 a 24 horas.
• Evite bebidas muito quentes e alimentos que exijam abertura ampla da boca nas primeiras horas.
• Evite consumo de álcool nas 24 horas seguintes.

REAVALIAÇÃO E ACOMPANHAMENTO
Uma consulta de reavaliação pode ser agendada 2 a 3 semanas após o procedimento para avaliar o resultado final e, se necessário, complementar o tratamento.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Palidez súbita, dor intensa ou alteração da cor da pele (azulada/esbranquiçada) na zona tratada ou adjacente, que pode indicar oclusão vascular.
• Inchaço que aumenta progressivamente após 48 horas.
• Sinais de infeção (calor, vermelhidão intensa, secreção).
• Reativação de herpes labial.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 19_Orientacoes_Apos_Preenchimento_Facial.docx
    key: 'orientacoes-19-preenchimento-facial',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após preenchimento facial',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

É esperado algum inchaço, sensibilidade e hematomas nas zonas tratadas com ácido hialurónico, que diminuem progressivamente ao longo dos dias seguintes.

NAS PRIMEIRAS HORAS
• Aplique gelo (envolto em pano) sobre as zonas tratadas, em ciclos curtos, nas primeiras horas.

CUIDADOS GERAIS E RECOMENDAÇÕES
• O resultado final deve ser avaliado após cerca de 2 a 3 semanas, quando o inchaço inicial já desapareceu por completo.
• Mantenha a pele limpa e hidratada com os produtos habituais, salvo indicação em contrário.

O QUE DEVE EVITAR
• Evite massajar ou pressionar as zonas tratadas nas primeiras 24 a 48 horas, salvo indicação específica do médico.
• Evite exposição solar direta, solário, sauna e exercício físico intenso nas 48 horas seguintes.
• Evite tratamentos estéticos faciais (peelings, laser, massagens) na zona tratada durante pelo menos 2 semanas.
• Evite consumo de álcool nas 24 horas seguintes.

REAVALIAÇÃO E ACOMPANHAMENTO
Poderá ser agendada consulta de reavaliação após 2 a 3 semanas para avaliar o resultado e, se necessário, complementar o tratamento.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Dor intensa, palidez súbita ou alteração da cor da pele na zona tratada ou adjacente, sobretudo perto do nariz ou dos olhos, que pode indicar oclusão vascular.
• Alterações súbitas da visão.
• Inchaço que aumenta progressivamente após 48 horas, ou sinais de infeção.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 20_Orientacoes_Apos_Bioestimulador_de_Colagenio.docx
    key: 'orientacoes-20-bioestimulador-colagenio',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após bioestimulador de colagénio',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

O efeito do bioestimulador é gradual, desenvolvendo-se ao longo de várias semanas à medida que estimula a produção natural de colagénio.

NAS PRIMEIRAS HORAS
• Se indicado pelo médico, massaje suavemente a zona tratada nos dias seguintes, seguindo exatamente as instruções fornecidas na consulta.

CUIDADOS GERAIS E RECOMENDAÇÕES
• É normal algum inchaço, vermelhidão ou pequenos hematomas nos pontos de aplicação, que desaparecem em poucos dias.
• Mantenha a pele hidratada com os cuidados habituais.

O QUE DEVE EVITAR
• Evite exposição solar direta, solário, sauna e exercício físico intenso nas 48 horas seguintes.
• Evite tratamentos faciais invasivos (peelings, laser) na zona tratada durante pelo menos 2 semanas.
• Evite consumo de álcool nas 24 horas seguintes.

REAVALIAÇÃO E ACOMPANHAMENTO
Serão habitualmente necessárias várias sessões, espaçadas de acordo com o protocolo definido pelo médico, para obter o resultado desejado.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Formação de nódulos, caroços ou irregularidades persistentes sob a pele.
• Dor intensa, inchaço crescente ou sinais de infeção.
• Alteração súbita de cor ou palidez na zona tratada.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 21_Orientacoes_Apos_Skinbooster_com_Peptidos.docx
    key: 'orientacoes-21-skinbooster',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após Skinbooster com péptidos',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

É normal uma sensação de pequenas pápulas ou "picadas" nos locais de aplicação, que desaparecem habitualmente em poucas horas a dias.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Mantenha a pele hidratada e limpa com os cuidados habituais.
• O resultado é progressivo, sendo comum a necessidade de mais do que uma sessão para o efeito desejado.

O QUE DEVE EVITAR
• Evite maquilhagem na zona tratada nas primeiras 12 horas.
• Evite exposição solar direta, sauna e exercício físico intenso nas 24 a 48 horas seguintes.
• Evite tratamentos faciais abrasivos na zona tratada durante alguns dias.

REAVALIAÇÃO E ACOMPANHAMENTO
Serão agendadas sessões de manutenção periódicas, conforme protocolo definido pelo médico dentista.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Inchaço ou vermelhidão que aumentam após 48 horas.
• Sinais de infeção nos pontos de aplicação.
• Reação alérgica (comichão generalizada, inchaço súbito).

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 22_Orientacoes_Apos_Fios_de_Sustentacao_PDO.docx
    key: 'orientacoes-22-fios-pdo',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após fios de sustentação (PDO)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a inserção dos fios de sustentação, é esperado algum inchaço, sensibilidade e hematomas na zona tratada, que diminuem progressivamente.

NAS PRIMEIRAS HORAS
• Aplique gelo (envolto em pano) sobre a zona tratada nas primeiras horas, sem pressionar excessivamente.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Durma de barriga para cima e com a cabeça ligeiramente elevada durante os primeiros dias, para reduzir o inchaço e evitar deslocar os fios.
• É normal sentir tensão ou "puxão" na pele nos primeiros dias, que se atenua com o tempo.

O QUE DEVE EVITAR
• Evite movimentos bruscos da face, massagens faciais, expressões faciais exageradas ou abertura ampla da boca durante pelo menos 2 semanas.
• Evite dormir de lado ou de barriga para baixo nos primeiros dias.
• Evite exercício físico intenso, sauna e exposição solar direta durante pelo menos 2 semanas.
• Evite tratamentos faciais invasivos (massagens profundas, radiofrequência, laser) na zona tratada durante pelo menos 4 semanas.

REAVALIAÇÃO E ACOMPANHAMENTO
Será agendada consulta de reavaliação para acompanhar a evolução do resultado e verificar a ausência de irregularidades.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Extrusão do fio (visível ou palpável através da pele).
• Assimetria acentuada, dor intensa ou irregularidades visíveis persistentes.
• Sinais de infeção no trajeto do fio (vermelhidão intensa, calor, secreção).

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 23_Orientacoes_Apos_Toxina_Botulinica_para_Bruxismo_e_DTM.docx
    key: 'orientacoes-23-toxina-botulinica-bruxismo-dtm',
    kind: 'pos-operatorio',
    folder: 'estetica',
    title: 'Orientações após toxina botulínica para bruxismo e DTM',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

O efeito terapêutico da toxina botulínica na musculatura mastigatória desenvolve-se progressivamente ao longo de 1 a 2 semanas.

NAS PRIMEIRAS HORAS
• Mantenha-se na posição vertical durante pelo menos 4 horas após a aplicação.

CUIDADOS GERAIS E RECOMENDAÇÕES
• É normal alguma sensibilidade, vermelhidão ou pequenos hematomas nos pontos de aplicação.
• Poderá notar uma redução gradual da força mastigatória nos dias seguintes, à medida que o efeito se instala; este é o efeito terapêutico esperado.

O QUE DEVE EVITAR
• Não massaje nem pressione a zona tratada nas primeiras 24 horas.
• Evite mastigar alimentos muito duros ou consistentes nos primeiros dias, enquanto se adapta à redução de força muscular.
• Evite exercício físico intenso e exposição solar prolongada nas 24 a 48 horas seguintes.
• Evite consumo de álcool nas 24 horas seguintes.

REAVALIAÇÃO E ACOMPANHAMENTO
O efeito deve ser reavaliado após 2 a 4 semanas. O uso de goteira oclusal, quando indicado, deve ser mantido em conjunto com este tratamento.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Dificuldade significativa e persistente em mastigar, falar ou engolir.
• Assimetria facial acentuada ou alteração inesperada do sorriso.
• Dor intensa ou inchaço crescente na zona tratada.

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // 24_Orientacoes_Apos_Sedacao_Consciente.docx
    key: 'orientacoes-24-sedacao-consciente',
    kind: 'pos-operatorio',
    folder: 'geral',
    title: 'Orientações após sedação consciente',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data do procedimento: {{consulta.data}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

Após a sedação, mesmo estando consciente durante todo o procedimento, alguns efeitos residuais podem persistir durante as horas seguintes.

NAS PRIMEIRAS HORAS
• Não conduza, opere máquinas ou tome decisões importantes durante pelo menos 12 a 24 horas após o procedimento, mesmo que se sinta bem.
• Regresse a casa sempre acompanhado por um adulto responsável, que deverá permanecer consigo nas horas seguintes.

CUIDADOS GERAIS E RECOMENDAÇÕES
• Repouse em casa durante o resto do dia, evitando esforços e atividades que exijam concentração.
• Retome a alimentação gradualmente, começando por líquidos e alimentos leves, conforme a tolerância.
• Siga também as orientações específicas do procedimento dentário que foi realizado sob sedação (extração, cirurgia, entre outros).

O QUE DEVE EVITAR
• Não consuma álcool nem outros sedativos ou substâncias que possam potenciar o efeito residual da sedação nas 24 horas seguintes.
• Evite tomar decisões importantes ou assinar documentos relevantes no mesmo dia.

MEDICAÇÃO
Retome a medicação habitual apenas conforme orientado pelo médico dentista, tendo em conta eventuais interações com os fármacos utilizados na sedação.

CONTACTE-NOS IMEDIATAMENTE SE OCORRER
• Sonolência excessiva, confusão ou dificuldade em despertar normalmente.
• Dificuldade em respirar, náuseas ou vómitos persistentes.
• Reação alérgica (erupção cutânea, inchaço, comichão generalizada).

DÚVIDAS OU EMERGÊNCIAS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // Atestado_Medico_Centro_Dentario_Colombo.docx
    key: 'atestado-medico-cdc',
    kind: 'atestado',
    folder: 'geral',
    title: 'Atestado médico (comparência / incapacidade temporária)',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

TIPO DE ATESTADO
[ ] Atestado de Comparência   [ ] Atestado de Incapacidade Temporária

DADOS DA CONSULTA / PROCEDIMENTO
Data da consulta / procedimento: {{consulta.data}} · Horário (início – fim): {{consulta.inicio}} – {{consulta.fim}}

PERÍODO DE REPOUSO / AFASTAMENTO RECOMENDADO
Aplicável apenas quando assinalado "Atestado de Incapacidade Temporária" acima.

Data de início: ________________ · Data de termo: ________________ · N.º total de dias: {{dias}}

DECLARAÇÃO
Para os devidos efeitos, atesto que o(a) paciente acima identificado(a) compareceu a esta clínica na data e horário indicados, para consulta e/ou tratamento de medicina dentária, e que, em consequência do estado clínico apresentado e/ou do procedimento realizado, se encontra, quando assinalado, temporariamente impossibilitado(a) de comparecer às suas atividades escolares ou laborais habituais, pelo período acima indicado.

O presente atestado é emitido nos termos e para os efeitos legais aplicáveis, com base na avaliação clínica efetuada nesta consulta.

OBSERVAÇÕES ADICIONAIS

CONTACTOS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
  {
    // Encaminhamento_Clinico_Centro_Dentario_Colombo.docx
    key: 'encaminhamento-clinico',
    kind: 'encaminhamento',
    folder: 'geral',
    title: 'Encaminhamento clínico',
    body: `IDENTIFICAÇÃO
Nome completo do paciente: {{paciente.nome}}
N.º do paciente: {{paciente.processo}} · Data de nascimento: {{paciente.nascimento}}
Médico(a) dentista responsável: {{medico.nome}} · Cédula profissional (n.º OMD): {{medico.cedula}}

DESTINO DO ENCAMINHAMENTO
[ ] Centro Dentário Colombo   [ ] Unidade da Buraca   [ ] Outra clínica / especialista

Nome da unidade / clínica / especialista de destino: ________________ · Especialidade: ________________

GRAU DE URGÊNCIA
[ ] Rotina   [ ] Prioritário   [ ] Urgente

MOTIVO DO ENCAMINHAMENTO

RESUMO CLÍNICO
Diagnóstico, tratamentos já realizados e informação relevante para a continuidade do cuidado.

DOCUMENTOS / EXAMES ANEXOS
[ ] Radiografias   [ ] Fotografias   [ ] Relatório clínico   [ ] Outro: ______________________

Solicito a continuidade do acompanhamento clínico do(a) paciente acima identificado(a) junto da unidade/especialista de destino, colocando-me à disposição para qualquer esclarecimento adicional que se revele necessário.

CONTACTOS
{{clinica.nome}} · Telefone: {{clinica.telefone}} · Email: {{clinica.email}}
{{clinica.morada}}`,
  },
];
