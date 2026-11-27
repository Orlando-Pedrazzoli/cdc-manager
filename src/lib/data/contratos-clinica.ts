// 📄 src/lib/data/contratos-clinica.ts
// =============================================================================
// CDC Manager — Contratos da clínica (9.ª ronda (c), 27/11/2026)
// -----------------------------------------------------------------------------
// Enviados por Victor Ruiz a 27/11/2026: contrato de tratamento ortodôntico
// (Word), três contratos de alinhadores — um por modalidade de pagamento —
// e a folha "Modalidades de pagamento" (PDF). Texto das cláusulas igual ao
// dos originais (os de alinhadores conferidos carácter a carácter).
// Diferenças de forma, por o PDF ser o do sistema:
//   · identificação do paciente com os campos {{...}} da ficha;
//   · os quadros de valores passam a linhas "Momento · Descrição · Valor";
//   · "Lisboa, ____ de ____ de ____" passa a {{data}};
//   · NÃO há "Rubrica do Paciente" em cada página nem "Página x de 6";
//   · as linhas de assinatura são as do sistema.
// Acesso (Victor, 27/11): só gestão, receção e as médicas que a gestão
// autorizar em Modelos de documentos (ver lib/template-access.ts).
// Só é lido por scripts/import-modelos-clinica.ts.
// =============================================================================

import type { ClinicTemplate } from '@/lib/data/modelos-clinica';

export interface ClinicContract extends ClinicTemplate {
  /** Pede a assinatura do paciente (a folha de modalidades não) */
  requiresSignature: boolean;
}

export const CONTRATOS_CLINICA: ClinicContract[] = [
  {
    // Contrato_Tratamento_Ortodontico_CDC.docx
    key: 'contrato-tratamento-ortodontico',
    kind: 'contrato',
    folder: 'ortodontia',
    title: 'Contrato — tratamento ortodôntico (aparelho)',
    requiresSignature: true,
    body: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS
TRATAMENTO ORTODÔNTICO

PRIMEIRA OUTORGANTE (CLÍNICA)
Denominação: D. Amaral - Assistência e Prevenção Dentária, Lda.
NIPC: 505 887 533
Estabelecimento: Centro Dentário Colombo, Av. Lusíada, n.º 2, Loja 507, piso -1, 1500-392 Lisboa
Contactos: Tel.: 933 522 580 | clinicadentaria.colombo@gmail.com

SEGUNDO OUTORGANTE (PACIENTE)
Nome completo: {{paciente.nome}}
Data de nascimento: {{paciente.nascimento}} · N.º do paciente: {{paciente.processo}}
Doc. de identificação: ________________ · NIF: {{paciente.nif}}
Morada: {{paciente.morada}}
Telemóvel: {{paciente.telemovel}} · E-mail: {{paciente.email}}

REPRESENTANTE LEGAL OU RESPONSÁVEL FINANCEIRO (se o paciente for menor ou o pagamento for assumido por terceiro)
Nome completo: ________________
Qualidade (pai, mãe, tutor): ________________ · Doc. de identificação: ________________
NIF: ________________ · Telemóvel: ________________

A Primeira Outorgante é designada por Clínica e o Segundo Outorgante por Paciente. Sempre que o paciente seja menor ou o pagamento seja assumido por terceiro, as referências ao Paciente abrangem também o representante legal ou responsável financeiro, que responde solidariamente pelo pagamento. As partes celebram o presente contrato, que se rege pelas cláusulas seguintes:

Cláusula 1.ª (Objeto)
1. O presente contrato tem por objeto a prestação, pela Clínica ao Paciente, de serviços de tratamento ortodôntico, de acordo com o plano de tratamento definido pelo médico dentista e registado no processo clínico do Paciente. O Anexo I faz parte integrante deste contrato.
2. O tratamento é realizado nas instalações do Centro Dentário Colombo ou, mediante acordo, na unidade da Buraca, por médico dentista habilitado e inscrito na Ordem dos Médicos Dentistas.
3. O Paciente declara que lhe foi explicado o diagnóstico, as alternativas de tratamento existentes (incluindo a opção de não tratar e as suas consequências) e que escolheu livremente o tratamento proposto.

Cláusula 2.ª (Médico dentista e substituição)
1. O tratamento é acompanhado pelo médico dentista identificado no Anexo I, sob a supervisão da direção clínica da Clínica.
2. O médico dentista pode ausentar-se ou deixar de colaborar com a Clínica a qualquer momento, por qualquer motivo (férias, doença, formação, alteração de horário, cessação de funções ou outro). Nesse caso, o Paciente será direcionado para outro médico dentista habilitado da Clínica, que dará continuidade ao tratamento com base no plano estabelecido.
3. A ausência ou substituição do médico dentista não constitui fundamento para a cessação do contrato, nem para a suspensão ou redução dos pagamentos devidos.

Cláusula 3.ª (Duração estimada do tratamento)
1. A duração do tratamento indicada pelo médico dentista é uma estimativa clínica, baseada no diagnóstico inicial, e não um prazo garantido.
2. A duração real pode variar em função da resposta biológica de cada pessoa, do crescimento (no caso de crianças e adolescentes), da colaboração do Paciente (uso de elásticos, alinhadores ou aparelhos removíveis, higiene oral, assiduidade) e de eventuais tratamentos complementares necessários.

Cláusula 4.ª (Preço e serviços incluídos)
1. O preço do tratamento e a forma de pagamento constam do orçamento apresentado ao Paciente.
2. Salvo indicação em contrário no orçamento, o preço inclui:
a) o estudo ortodôntico (modelos ou digitalização intraoral, fotografias clínicas e análise cefalométrica, quando aplicável);
b) a colocação do aparelho indicado no plano de tratamento;
c) as consultas de controlo e ativação ortodôntica durante o tratamento.
3. Os preços estão sujeitos às atualizações da tabela de preços da Clínica, aplicando-se em cada ano o preço em vigor nesse ano.

Cláusula 5.ª (Obrigações da Clínica)
1. Prestar o tratamento com diligência, de acordo com as boas práticas da medicina dentária (leges artis) e o Código Deontológico da Ordem dos Médicos Dentistas.
2. Informar o Paciente, de forma clara, sobre a evolução do tratamento, eventuais alterações ao plano e respetivas razões.
3. Utilizar materiais e dispositivos médicos certificados e manter as instalações e equipamentos em condições adequadas.
4. Manter o processo clínico do Paciente organizado e atualizado e guardar sigilo sobre toda a informação clínica.
5. Garantir atendimento em situações de urgência relacionadas com o aparelho, dentro do horário de funcionamento da Clínica.

Cláusula 6.ª (Obrigações do Paciente)
1. Comparecer pontualmente às consultas agendadas, e avisar a Clínica com antecedência em caso de impedimento. As faltas não justificadas com antecedência mínima de 24h a contar do horário da marcação, têm um custo associado de remarcação de 10,00 € (Cláusula 7.ª).
2. Cumprir rigorosamente as instruções do médico dentista, nomeadamente quanto ao uso de elásticos, alinhadores, aparelhos removíveis e contenções, durante o tempo diário que o médico dentista indicar.
3. Manter uma higiene oral rigorosa, de acordo com as orientações recebidas, e evitar alimentos duros, pegajosos ou que possam danificar o aparelho.
4. Realizar consultas de higienização e de vigilância geral de saúde oral pelo menos de 6 em 6 meses durante o tratamento, bem como os tratamentos complementares indicados pelo médico dentista.
5. Informar a Clínica de qualquer alteração do seu estado de saúde, medicação, gravidez, alergias ou outra condição relevante.
6. Contactar a Clínica de imediato em caso de quebra, descolamento ou perda de qualquer componente do aparelho, não tentando repará-lo por conta própria.
7. Manter atualizados os seus contactos (telefone, e-mail e morada).

Cláusula 7.ª (Faltas e remarcações)
1. A falta a uma consulta sem justificação comunicada com antecedência mínima de 24h a contar do horário da marcação implica o pagamento de um custo de remarcação de 10,00€, a liquidar antes ou no ato da nova consulta.
2. As faltas não suspendem nem reduzem os valores devidos pelo tratamento.
3. As faltas e desmarcações sucessivas prolongam o tratamento e podem comprometer o resultado, não podendo ser imputada à Clínica ou ao médico dentista qualquer responsabilidade pelas consequências daí resultantes.
4. Todas as faltas e desmarcações são registadas no processo clínico do Paciente.

Cláusula 8.ª (Abandono do tratamento)
1. Considera-se que existe abandono do tratamento quando, cumulativamente:
a) o Paciente não comparecer a qualquer consulta durante um período superior a 60 (sessenta) dias, ou faltar a 3 (três) consultas consecutivas; e
b) após contacto da Clínica por escrito (carta registada, e-mail ou mensagem escrita), o Paciente não responder nem reagendar a consulta no prazo de 15 (quinze) dias.
2. Verificado o abandono, a Clínica comunica ao Paciente, por escrito, a cessação do contrato e os riscos para a saúde oral resultantes da manutenção do aparelho sem acompanhamento, recomendando a sua remoção.
3. A partir do abandono, a Clínica e o médico dentista ficam exonerados de qualquer responsabilidade pelos danos ou consequências decorrentes da interrupção do tratamento, incluindo recidiva, cáries, descalcificações, problemas periodontais ou movimentos dentários indesejados.
4. A remoção do aparelho e a eventual retoma do tratamento após abandono são objeto de novo orçamento, de acordo com a tabela em vigor.
5. São devidos à Clínica os valores correspondentes aos serviços prestados e aos materiais utilizados até à data do abandono.

Cláusula 9.ª (Resultados, riscos e consentimento informado)
1. O Paciente reconhece que a medicina dentária é uma atividade de meios e não de resultados: a Clínica compromete-se a utilizar todos os meios técnicos e científicos adequados, mas não pode garantir um resultado estético ou funcional determinado, dada a variabilidade da resposta biológica individual e a dependência da colaboração do Paciente.
2. Os riscos e limitações próprios do tratamento ortodôntico (nomeadamente desconforto, aftas, reabsorção radicular, descalcificação do esmalte, cáries, inflamação gengival, problemas da articulação temporomandibular, recidiva e necessidade de tratamentos complementares) constam do Consentimento Informado para Tratamento Ortodôntico da Clínica, que o Paciente declara ter lido, compreendido e assinado antes do início do tratamento.

Cláusula 10.ª (Remoção do aparelho e contenção)
1. A remoção do aparelho e a contenção superior e inferior não estão incluídas no preço do tratamento e são cobradas no final do tratamento, de acordo com o preço da tabela em vigor nessa data.
2. Após a remoção do aparelho, é indispensável o uso de contenção (fixa e/ou removível) pelo período indicado pelo médico dentista, que pode ser prolongado ou, em certos casos, permanente.
3. A falta de uso da contenção, a sua perda ou a não comparência às consultas de controlo da contenção podem provocar o regresso dos dentes à posição inicial (recidiva), não sendo a Clínica responsável por essa consequência.
4. A substituição de contenções perdidas, partidas ou danificadas, bem como qualquer retratamento resultante da falta de uso da contenção, é faturada à parte.

Cláusula 11.ª (Desistência e transferência)
1. O Paciente pode desistir do tratamento a todo o tempo, mediante comunicação escrita à Clínica.
2. Se o Paciente pretender continuar o tratamento noutro profissional ou clínica, a Clínica entrega-lhe, a pedido, cópia do processo clínico, radiografias e registos relevantes.

Cláusula 12.ª (Proteção de dados pessoais)
1. Os dados pessoais e de saúde do Paciente são tratados pela Clínica exclusivamente para a prestação de cuidados de saúde, gestão administrativa, faturação e cumprimento de obrigações legais, nos termos do Regulamento Geral sobre a Proteção de Dados (Regulamento (UE) 2016/679) e da Lei n.º 58/2019, de 8 de agosto, e só são comunicados a terceiros quando necessário para o tratamento (por exemplo, laboratórios e centros de radiologia) ou por imposição legal.
2. O Paciente pode exercer os seus direitos de acesso, retificação, limitação, oposição e portabilidade através do e-mail clinicadentaria.colombo@gmail.com ou presencialmente na receção.

Cláusula 13.ª (Registo fotográfico e imagem)
1. As fotografias, digitalizações e radiografias recolhidas fazem parte do processo clínico e são indispensáveis ao diagnóstico, planeamento e acompanhamento do tratamento.
2. A utilização de imagens do Paciente para fins de divulgação, formação ou comunicação da Clínica rege-se pelo Consentimento Informado e pela política de imagem da Clínica. O Paciente pode limitar ou recusar esse uso através do Termo de Limitação de Uso de Imagem, disponível na receção, sem qualquer prejuízo para o tratamento.

Cláusula 14.ª (Declaração final)
O Paciente declara que leu o presente contrato, que o seu conteúdo lhe foi explicado, que esclareceu todas as dúvidas e que recebeu um exemplar assinado.

Feito em Lisboa, em {{data}}, em dois exemplares de igual valor, ficando um em poder de cada parte.

ANEXO I
PLANO DE TRATAMENTO

Paciente: {{paciente.nome}} · Data: {{data.curta}}

Plano de tratamento: ________________
Médico dentista responsável: {{medico.nome}}
Cédula OMD n.º: {{medico.cedula}}
Tratamentos complementares: ________________
Contenção prevista: [ ] Superior   [ ] Inferior

Nota: no final do tratamento são cobradas a remoção do aparelho e a contenção (superior e/ou inferior), de acordo com o preço da tabela em vigor nessa data.`,
  },
  {
    // Contrato_Alinhadores_Opcao1_Pagamento_por_Fase.pdf
    key: 'contrato-alinhadores-opcao-1',
    kind: 'contrato',
    folder: 'ortodontia',
    title: 'Contrato — alinhadores, opção 1: pagamento por fase',
    requiresSignature: true,
    body: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS
TRATAMENTO ORTODÔNTICO COM ALINHADORES INVISÍVEIS
Modalidade de pagamento: Opção 1, Pagamento por fase

PRIMEIRA OUTORGANTE (CLÍNICA)
Denominação: D. Amaral, Assistência e Prevenção Dentária, Lda.
NIPC: 505 887 533
Estabelecimento: Centro Dentário Colombo, Av. Lusíada, n.º 2, Loja 507, piso -1, 1500-392 Lisboa
Contactos: 933 522 580 | clinicadentaria.colombo@gmail.com

SEGUNDO OUTORGANTE (PACIENTE)
Nome completo: {{paciente.nome}}
Data de nascimento: {{paciente.nascimento}}
N.º CC / Passaporte: ________________
NIF: {{paciente.nif}}
Morada: {{paciente.morada}}
Telemóvel: {{paciente.telemovel}}
E-mail: {{paciente.email}}

REPRESENTANTE LEGAL (apenas se o paciente for menor)
Nome completo: ________________
N.º CC / NIF: ________________
Qualidade (pai, mãe, tutor): ________________
Telemóvel / E-mail: ________________

A CLÍNICA e o PACIENTE celebram o presente contrato, que se rege pelas cláusulas seguintes:

Cláusula 1.ª (Objeto)
1. O presente contrato tem por objeto a prestação, pela CLÍNICA, de tratamento ortodôntico com alinhadores invisíveis, de acordo com o plano de tratamento definido pelo médico dentista e registado no processo clínico do PACIENTE. O Anexo I faz parte integrante deste contrato.
2. O tratamento é realizado por fases. Em cada fase é entregue ao PACIENTE um conjunto de alinhadores, de acordo com a evolução clínica avaliada pelo médico dentista.
3. O PACIENTE declara que lhe foram explicados o diagnóstico, as alternativas de tratamento, os benefícios, os riscos e as limitações dos alinhadores, e que escolheu livremente o tratamento proposto.

Cláusula 2.ª (Médico dentista)
1. O tratamento é acompanhado por um médico dentista da CLÍNICA, que pode ser substituído por outro profissional da CLÍNICA em caso de ausência, férias, doença, saída da CLÍNICA ou qualquer outro motivo.
2. A substituição do médico dentista não altera as condições deste contrato e não confere ao PACIENTE o direito de cancelar o contrato nem de suspender os pagamentos.

Cláusula 3.ª (Preço)
1. O preço total do tratamento é de 4.500,00 € (quatro mil e quinhentos euros).
2. O preço inclui o planeamento do tratamento, os alinhadores previstos no plano de tratamento inicial e as consultas de controlo durante o tratamento ativo.
3. Não estão incluídos no preço, sendo cobrados à parte de acordo com a tabela de preços da CLÍNICA em vigor à data da sua realização: (a) tratamentos complementares, como destartarizações, restaurações, extrações ou outros atos indicados no Anexo I; (b) refinamentos e alinhadores adicionais, nos termos da cláusula 11.ª; (c) substituição de alinhadores perdidos ou danificados; (d) remoção dos attachments e contenção superior e inferior no final do tratamento; (e) remarcações de consultas nos termos da cláusula de faltas.

Cláusula 4.ª (Modalidade de pagamento)
1. O preço é pago na modalidade de pagamento por fase, de acordo com o quadro seguinte:
Momento · Descrição · Valor
Fase 1 · Entrada: na assinatura do contrato, antes do pedido de fabrico. Inclui a entrega do 1.º conjunto · 1.800,00 €
Fase 2 · Na entrega do 2.º conjunto de alinhadores · 900,00 €
Fase 3 · Na entrega do 3.º conjunto de alinhadores · 900,00 €
Fase 4 · Na entrega do 4.º conjunto de alinhadores · 900,00 €
Total · 4.500,00 €
2. O valor de cada fase é pago no próprio dia da entrega do conjunto de alinhadores correspondente, antes de o PACIENTE o levar consigo.
3. Caso o plano de tratamento preveja um número de fases diferente de quatro, o valor restante após a entrada é dividido em partes iguais pelo número de fases seguintes, mantendo-se o preço total, o que fica registado no Anexo I.
4. Os pagamentos podem ser feitos em numerário, multibanco ou transferência bancária. Um pagamento só se considera efetuado após boa cobrança do valor.

Cláusula 5.ª (Entrega dos alinhadores condicionada ao pagamento)
1. O pedido de fabrico dos alinhadores ao laboratório só é feito após o pagamento integral da entrada de 1.800,00 €.
2. O planeamento digital de todo o tratamento é feito desde o início, com a definição de todas as fases previstas. O que fica condicionado ao pagamento é a entrega: cada conjunto de alinhadores só é entregue ao PACIENTE depois de paga a fase anterior e de estarem liquidados todos os valores vencidos até essa data, o que abre a entrega da fase seguinte.
3. Cada conjunto de alinhadores só é entregue ao PACIENTE se todos os valores vencidos até essa data estiverem pagos.
4. Os alinhadores fabricados e ainda não entregues ficam à guarda da CLÍNICA, que os pode reter até ao pagamento correspondente. A CLÍNICA não é responsável por atrasos no tratamento ou perda de resultados decorrentes da não entrega por falta de pagamento.
5. A contenção e a alta ortodôntica só são entregues após a liquidação total do preço do tratamento e dos valores referidos na cláusula 3.ª, n.º 3.

Cláusula 6.ª (Incumprimento do pagamento)
1. Em caso de atraso superior a 15 dias em qualquer pagamento, a CLÍNICA pode suspender o tratamento até à regularização, sem que a suspensão lhe seja imputável.
2. Durante a suspensão, a CLÍNICA não é responsável por atrasos no tratamento, movimentos dentários indesejados, perda de resultados ou necessidade de novos alinhadores, que podem implicar custos adicionais, orçamentados à parte.
3. Se o PACIENTE não comparecer para levantar e pagar a fase seguinte no prazo de 30 dias após a data indicada pelo médico dentista, a CLÍNICA notifica-o por escrito. Na falta de resposta em 15 dias, aplica-se a cláusula de abandono do tratamento.
4. Sobre os valores em atraso são devidos juros de mora à taxa legal em vigor, bem como as despesas de cobrança comprovadamente suportadas pela CLÍNICA.
5. Se o incumprimento se mantiver por mais de 30 dias após notificação escrita da CLÍNICA, esta pode fazer cessar o contrato nos termos da cláusula de cessação, aplicando-se as regras da desistência quanto aos valores devidos.
6. A retoma do tratamento após suspensão pode exigir nova digitalização, novos alinhadores e novo orçamento, a cargo do PACIENTE, se a evolução dentária impedir a continuação do plano em curso.

Cláusula 7.ª (Obrigações do paciente)
1. Usar os alinhadores durante o tempo diário indicado pelo médico dentista e trocar de alinhador apenas segundo as suas instruções.
2. Comparecer às consultas marcadas e cumprir as orientações clínicas e de higiene oral.
3. Guardar os alinhadores no estojo quando não estiverem em uso e não os alterar, cortar ou aquecer.
4. Informar a CLÍNICA de qualquer alteração do seu estado de saúde, medicação, gravidez, dor, lesão ou quebra de alinhador.
5. Manter os seus dados de contacto atualizados.

Cláusula 8.ª (Faltas e remarcações)
1. As consultas devem ser desmarcadas com pelo menos 24 horas de antecedência.
2. A falta não justificada com essa antecedência implica o pagamento de 10,00 € pela remarcação.
3. As faltas não suspendem as obrigações de pagamento previstas neste contrato.

Cláusula 9.ª (Resultado do tratamento)
1. A CLÍNICA compromete-se a usar os meios técnicos e científicos adequados, mas não pode garantir um resultado final determinado, uma vez que este depende de fatores biológicos próprios de cada pessoa e da colaboração do PACIENTE.
2. O prolongamento do tratamento por falta de uso dos alinhadores, faltas às consultas ou incumprimento das orientações não é responsabilidade da CLÍNICA e pode implicar custos adicionais, orçamentados à parte.

Cláusula 10.ª (Previsibilidade do tratamento, número de alinhadores e intercorrências)
1. A resposta de cada pessoa ao tratamento varia. Podem ocorrer intercorrências, como movimentos dentários mais lentos ou diferentes do previsto, perda de attachments, quebra ou perda de alinhadores, problemas de saúde oral, alterações do estado de saúde ou da medicação, gravidez, falta de uso dos alinhadores ou faltas às consultas, que obriguem a alterar o plano, a duração, o número de alinhadores ou o número de fases.
2. O médico dentista pode, em qualquer momento, aumentar, diminuir ou substituir alinhadores e fases, de acordo com a evolução clínica, informando o PACIENTE e registando a alteração no processo clínico.
3. Nenhuma intercorrência ou alteração ao plano, por si só, dá ao PACIENTE o direito de cancelar o contrato, suspender ou reduzir os pagamentos, sem prejuízo dos direitos que a lei lhe reconhece enquanto consumidor.
4. As alterações relevantes ao plano, à duração ou aos valores são comunicadas ao PACIENTE, que pode pedir os esclarecimentos que entender necessários.

Cláusula 11.ª (Refinamentos e tratamentos adicionais)
1. Os refinamentos, isto é, as séries adicionais de alinhadores necessárias após a conclusão do plano inicial, bem como os tratamentos complementares, são orçamentados à parte pela CLÍNICA e só são executados após aceitação do PACIENTE, salvo se o Anexo I indicar que um determinado número de refinamentos está incluído no preço.
2. Se o PACIENTE não aceitar o orçamento adicional, a CLÍNICA pode dar o tratamento por concluído nos termos do plano inicial, sem responsabilidade pelo resultado final.

Cláusula 12.ª (Fim do tratamento e contenção)
1. No final do tratamento ativo são realizadas a remoção dos attachments e a colocação da contenção superior e inferior, cobradas à parte de acordo com a tabela de preços em vigor.
2. A utilização da contenção conforme indicado pelo médico dentista é da responsabilidade do PACIENTE. A CLÍNICA não é responsável por recidivas (regresso dos dentes à posição anterior) resultantes da falta de uso, perda ou dano da contenção.

Cláusula 13.ª (Desistência do paciente)
1. O PACIENTE pode desistir do tratamento a todo o tempo, mediante comunicação escrita à CLÍNICA.
2. A entrada destina-se a cobrir o estudo, o planeamento digital e o fabrico dos alinhadores, pelo que não é reembolsável após o pedido de fabrico ao laboratório.
3. Os valores pagos correspondentes a fases já entregues e a atos já realizados não são reembolsáveis.
4. Caso existam alinhadores já fabricados e ainda não pagos, o PACIENTE fica obrigado a pagar o respetivo custo de fabrico, comprovado pela CLÍNICA, até ao limite do valor do tratamento ainda em falta.
5. São ainda devidos os valores vencidos e não pagos até à data da desistência.

Cláusula 14.ª (Abandono do tratamento)
1. Considera-se abandono do tratamento a ausência do PACIENTE por mais de 60 dias sem justificação, ou 3 faltas seguidas, desde que a CLÍNICA o notifique por escrito e este não responda no prazo de 15 dias.
2. O abandono produz os mesmos efeitos da desistência. A partir dessa data a CLÍNICA deixa de ser responsável pela evolução do tratamento, recidivas, cáries, descalcificações ou outros danos resultantes da interrupção.
3. O retomar do tratamento após abandono depende de nova avaliação clínica e de novo orçamento.

Cláusula 15.ª (Cessação pela clínica)
1. A CLÍNICA pode pôr fim ao contrato, por comunicação escrita, em caso de falta de pagamento não regularizada após a suspensão, de falta reiterada de colaboração que comprometa o tratamento, ou de comportamento ofensivo ou agressivo para com os profissionais da CLÍNICA.
2. Nesse caso aplicam-se as regras da desistência quanto aos valores devidos, e a CLÍNICA entrega ao PACIENTE, a pedido, a informação clínica necessária para a continuação do tratamento noutro local.

Cláusula 16.ª (Encerramento temporário ou força maior)
1. Em caso de encerramento temporário do estabelecimento (obras, determinação do centro comercial ou das autoridades, catástrofe ou outro motivo de força maior), as consultas são reagendadas ou realizadas noutra unidade da D. Amaral, Assistência e Prevenção Dentária, Lda.
2. Estas situações não conferem ao PACIENTE o direito de cancelar o contrato, suspender os pagamentos ou pedir indemnização, sendo os prazos do tratamento ajustados em conformidade.

Cláusula 17.ª (Pacientes menores)
Quando o PACIENTE for menor, o contrato é assinado pelo seu representante legal, que assume pessoal e solidariamente todas as obrigações de pagamento e declara que o outro progenitor tem conhecimento e está de acordo com o tratamento.

Cláusula 18.ª (Proteção de dados e registos clínicos)
1. Os dados pessoais e de saúde do PACIENTE são tratados pela CLÍNICA para a prestação dos cuidados de saúde, a gestão do processo clínico e o cumprimento de obrigações legais, nos termos do Regulamento Geral sobre a Proteção de Dados.
2. As fotografias, radiografias e digitalizações intraorais fazem parte do processo clínico. A sua utilização para divulgação só é feita com consentimento escrito e separado do PACIENTE.
3. O PACIENTE pode exercer os seus direitos de acesso, retificação e demais direitos através do e-mail clinicadentaria.colombo@gmail.com.

Cláusula 19.ª (Litígios)
1. Em caso de litígio de consumo, o PACIENTE pode recorrer ao Livro de Reclamações ou a uma entidade de resolução alternativa de litígios, como o Centro de Arbitragem de Conflitos de Consumo de Lisboa (www.centroarbitragemlisboa.pt) ou o CNIACC (www.cniacc.pt).
2. Para a resolução judicial de qualquer litígio é competente o foro da comarca de Lisboa, sem prejuízo das regras legais imperativas aplicáveis aos consumidores.

Cláusula 20.ª (Disposições finais)
1. Faz parte integrante deste contrato o consentimento informado para tratamento ortodôntico da CLÍNICA, assinado pelo PACIENTE.
2. Qualquer alteração a este contrato só é válida se for feita por escrito e assinada por ambas as partes.
3. O PACIENTE declara que leu o presente contrato, que o seu conteúdo lhe foi explicado, que esclareceu todas as dúvidas e que recebeu um exemplar assinado.

Lisboa, {{data}}

ANEXO I, PLANO DE TRATAMENTO
A PREENCHER PELO MÉDICO DENTISTA

Paciente: {{paciente.nome}}
Médico dentista: {{medico.nome}}
Refinamentos incluídos no preço: Nenhum, salvo indicação em contrário: ______
Tratamentos complementares: ________________
Contenção prevista: Superior e inferior
Observações: ________________

Valores por fase (preencher apenas se o número de fases for diferente de 4):
Fase: ______ · Valor: ______
Fase: ______ · Valor: ______

No final do tratamento são cobradas a remoção dos attachments e a contenção superior e inferior, de acordo com a tabela de preços em vigor nessa data.

Lisboa, {{data}}`,
  },
  {
    // Contrato_Alinhadores_Opcao2_Entrada_e_Mensalidades.pdf
    key: 'contrato-alinhadores-opcao-2',
    kind: 'contrato',
    folder: 'ortodontia',
    title: 'Contrato — alinhadores, opção 2: entrada e mensalidades',
    requiresSignature: true,
    body: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS
TRATAMENTO ORTODÔNTICO COM ALINHADORES INVISÍVEIS
Modalidade de pagamento: Opção 2, Entrada e mensalidades

PRIMEIRA OUTORGANTE (CLÍNICA)
Denominação: D. Amaral, Assistência e Prevenção Dentária, Lda.
NIPC: 505 887 533
Estabelecimento: Centro Dentário Colombo, Av. Lusíada, n.º 2, Loja 507, piso -1, 1500-392 Lisboa
Contactos: 933 522 580 | clinicadentaria.colombo@gmail.com

SEGUNDO OUTORGANTE (PACIENTE)
Nome completo: {{paciente.nome}}
Data de nascimento: {{paciente.nascimento}}
N.º CC / Passaporte: ________________
NIF: {{paciente.nif}}
Morada: {{paciente.morada}}
Telemóvel: {{paciente.telemovel}}
E-mail: {{paciente.email}}

REPRESENTANTE LEGAL (apenas se o paciente for menor)
Nome completo: ________________
N.º CC / NIF: ________________
Qualidade (pai, mãe, tutor): ________________
Telemóvel / E-mail: ________________

A CLÍNICA e o PACIENTE celebram o presente contrato, que se rege pelas cláusulas seguintes:

Cláusula 1.ª (Objeto)
1. O presente contrato tem por objeto a prestação, pela CLÍNICA, de tratamento ortodôntico com alinhadores invisíveis, de acordo com o plano de tratamento definido pelo médico dentista e registado no processo clínico do PACIENTE. O Anexo I faz parte integrante deste contrato.
2. O tratamento é realizado por fases. Em cada fase é entregue ao PACIENTE um conjunto de alinhadores, de acordo com a evolução clínica avaliada pelo médico dentista.
3. O PACIENTE declara que lhe foram explicados o diagnóstico, as alternativas de tratamento, os benefícios, os riscos e as limitações dos alinhadores, e que escolheu livremente o tratamento proposto.

Cláusula 2.ª (Médico dentista)
1. O tratamento é acompanhado por um médico dentista da CLÍNICA, que pode ser substituído por outro profissional da CLÍNICA em caso de ausência, férias, doença, saída da CLÍNICA ou qualquer outro motivo.
2. A substituição do médico dentista não altera as condições deste contrato e não confere ao PACIENTE o direito de cancelar o contrato nem de suspender os pagamentos.

Cláusula 3.ª (Preço)
1. O preço total do tratamento é de 4.500,00 € (quatro mil e quinhentos euros).
2. O preço inclui o planeamento do tratamento, os alinhadores previstos no plano de tratamento inicial e as consultas de controlo durante o tratamento ativo.
3. Não estão incluídos no preço, sendo cobrados à parte de acordo com a tabela de preços da CLÍNICA em vigor à data da sua realização: (a) tratamentos complementares, como destartarizações, restaurações, extrações ou outros atos indicados no Anexo I; (b) refinamentos e alinhadores adicionais, nos termos da cláusula 11.ª; (c) substituição de alinhadores perdidos ou danificados; (d) remoção dos attachments e contenção superior e inferior no final do tratamento; (e) remarcações de consultas nos termos da cláusula de faltas.

Cláusula 4.ª (Modalidade de pagamento)
1. O preço é pago na modalidade de entrada e 4 (quatro) mensalidades, de acordo com o quadro seguinte:
Momento · Descrição · Valor
Entrada · Na assinatura do contrato, antes do pedido de fabrico. Inclui a entrega do 1.º conjunto · 2.500,00 €
Mês 1 · 1.ª mensalidade · 500,00 €
Mês 2 · 2.ª mensalidade · 500,00 €
Mês 3 · 3.ª mensalidade · 500,00 €
Mês 4 · 4.ª mensalidade · 500,00 €
Total · 4.500,00 €
2. As mensalidades vencem-se no dia ____ de cada mês, sendo a 1.ª mensalidade devida no mês seguinte ao da assinatura do presente contrato, independentemente das datas das consultas ou da entrega dos alinhadores.
3. As mensalidades são devidas mesmo que o PACIENTE falte a consultas ou adie o levantamento dos alinhadores.
4. Todas as mensalidades devem estar liquidadas antes da entrega do último conjunto de alinhadores. Se o tratamento terminar antes da 4.ª mensalidade, o valor em falta é pago de uma só vez antes dessa entrega.
5. Os pagamentos podem ser feitos em numerário, multibanco ou transferência bancária. Um pagamento só se considera efetuado após boa cobrança do valor.

Cláusula 5.ª (Entrega dos alinhadores condicionada ao pagamento)
1. O pedido de fabrico dos alinhadores ao laboratório só é feito após o pagamento integral da entrada de 2.500,00 €.
2. O planeamento digital de todo o tratamento é feito desde o início, com a definição de todas as fases previstas. O que fica condicionado ao pagamento é a entrega: cada conjunto de alinhadores só é entregue ao PACIENTE depois de paga a fase anterior e de estarem liquidados todos os valores vencidos até essa data, o que abre a entrega da fase seguinte.
3. Cada conjunto de alinhadores só é entregue ao PACIENTE se todos os valores vencidos até essa data estiverem pagos.
4. Os alinhadores fabricados e ainda não entregues ficam à guarda da CLÍNICA, que os pode reter até ao pagamento correspondente. A CLÍNICA não é responsável por atrasos no tratamento ou perda de resultados decorrentes da não entrega por falta de pagamento.
5. A contenção e a alta ortodôntica só são entregues após a liquidação total do preço do tratamento e dos valores referidos na cláusula 3.ª, n.º 3.

Cláusula 6.ª (Incumprimento do pagamento)
1. Em caso de atraso superior a 15 dias em qualquer pagamento, a CLÍNICA pode suspender o tratamento até à regularização, sem que a suspensão lhe seja imputável.
2. Durante a suspensão, a CLÍNICA não é responsável por atrasos no tratamento, movimentos dentários indesejados, perda de resultados ou necessidade de novos alinhadores, que podem implicar custos adicionais, orçamentados à parte.
3. A falta de pagamento de qualquer mensalidade por mais de 15 dias determina, nos termos do artigo 781.º do Código Civil, o vencimento imediato de todas as mensalidades em falta, podendo a CLÍNICA exigir de imediato a totalidade do valor em dívida.
4. Sobre os valores em atraso são devidos juros de mora à taxa legal em vigor, bem como as despesas de cobrança comprovadamente suportadas pela CLÍNICA.
5. Se o incumprimento se mantiver por mais de 30 dias após notificação escrita da CLÍNICA, esta pode fazer cessar o contrato nos termos da cláusula de cessação, aplicando-se as regras da desistência quanto aos valores devidos.
6. A retoma do tratamento após suspensão pode exigir nova digitalização, novos alinhadores e novo orçamento, a cargo do PACIENTE, se a evolução dentária impedir a continuação do plano em curso.

Cláusula 7.ª (Obrigações do paciente)
1. Usar os alinhadores durante o tempo diário indicado pelo médico dentista e trocar de alinhador apenas segundo as suas instruções.
2. Comparecer às consultas marcadas e cumprir as orientações clínicas e de higiene oral.
3. Guardar os alinhadores no estojo quando não estiverem em uso e não os alterar, cortar ou aquecer.
4. Informar a CLÍNICA de qualquer alteração do seu estado de saúde, medicação, gravidez, dor, lesão ou quebra de alinhador.
5. Manter os seus dados de contacto atualizados.

Cláusula 8.ª (Faltas e remarcações)
1. As consultas devem ser desmarcadas com pelo menos 24 horas de antecedência.
2. A falta não justificada com essa antecedência implica o pagamento de 10,00 € pela remarcação.
3. As faltas não suspendem as obrigações de pagamento previstas neste contrato.

Cláusula 9.ª (Resultado do tratamento)
1. A CLÍNICA compromete-se a usar os meios técnicos e científicos adequados, mas não pode garantir um resultado final determinado, uma vez que este depende de fatores biológicos próprios de cada pessoa e da colaboração do PACIENTE.
2. O prolongamento do tratamento por falta de uso dos alinhadores, faltas às consultas ou incumprimento das orientações não é responsabilidade da CLÍNICA e pode implicar custos adicionais, orçamentados à parte.

Cláusula 10.ª (Previsibilidade do tratamento, número de alinhadores e intercorrências)
1. A resposta de cada pessoa ao tratamento varia. Podem ocorrer intercorrências, como movimentos dentários mais lentos ou diferentes do previsto, perda de attachments, quebra ou perda de alinhadores, problemas de saúde oral, alterações do estado de saúde ou da medicação, gravidez, falta de uso dos alinhadores ou faltas às consultas, que obriguem a alterar o plano, a duração, o número de alinhadores ou o número de fases.
2. O médico dentista pode, em qualquer momento, aumentar, diminuir ou substituir alinhadores e fases, de acordo com a evolução clínica, informando o PACIENTE e registando a alteração no processo clínico.
3. Nenhuma intercorrência ou alteração ao plano, por si só, dá ao PACIENTE o direito de cancelar o contrato, suspender ou reduzir os pagamentos, sem prejuízo dos direitos que a lei lhe reconhece enquanto consumidor.
4. As alterações relevantes ao plano, à duração ou aos valores são comunicadas ao PACIENTE, que pode pedir os esclarecimentos que entender necessários.

Cláusula 11.ª (Refinamentos e tratamentos adicionais)
1. Os refinamentos, isto é, as séries adicionais de alinhadores necessárias após a conclusão do plano inicial, bem como os tratamentos complementares, são orçamentados à parte pela CLÍNICA e só são executados após aceitação do PACIENTE, salvo se o Anexo I indicar que um determinado número de refinamentos está incluído no preço.
2. Se o PACIENTE não aceitar o orçamento adicional, a CLÍNICA pode dar o tratamento por concluído nos termos do plano inicial, sem responsabilidade pelo resultado final.

Cláusula 12.ª (Fim do tratamento e contenção)
1. No final do tratamento ativo são realizadas a remoção dos attachments e a colocação da contenção superior e inferior, cobradas à parte de acordo com a tabela de preços em vigor.
2. A utilização da contenção conforme indicado pelo médico dentista é da responsabilidade do PACIENTE. A CLÍNICA não é responsável por recidivas (regresso dos dentes à posição anterior) resultantes da falta de uso, perda ou dano da contenção.

Cláusula 13.ª (Desistência do paciente)
1. O PACIENTE pode desistir do tratamento a todo o tempo, mediante comunicação escrita à CLÍNICA.
2. A entrada destina-se a cobrir o estudo, o planeamento digital e o fabrico dos alinhadores, pelo que não é reembolsável após o pedido de fabrico ao laboratório.
3. Os valores pagos correspondentes a fases já entregues e a atos já realizados não são reembolsáveis.
4. Caso existam alinhadores já fabricados e ainda não pagos, o PACIENTE fica obrigado a pagar o respetivo custo de fabrico, comprovado pela CLÍNICA, até ao limite do valor do tratamento ainda em falta.
5. São ainda devidos os valores vencidos e não pagos até à data da desistência.

Cláusula 14.ª (Abandono do tratamento)
1. Considera-se abandono do tratamento a ausência do PACIENTE por mais de 60 dias sem justificação, ou 3 faltas seguidas, desde que a CLÍNICA o notifique por escrito e este não responda no prazo de 15 dias.
2. O abandono produz os mesmos efeitos da desistência. A partir dessa data a CLÍNICA deixa de ser responsável pela evolução do tratamento, recidivas, cáries, descalcificações ou outros danos resultantes da interrupção.
3. O retomar do tratamento após abandono depende de nova avaliação clínica e de novo orçamento.

Cláusula 15.ª (Cessação pela clínica)
1. A CLÍNICA pode pôr fim ao contrato, por comunicação escrita, em caso de falta de pagamento não regularizada após a suspensão, de falta reiterada de colaboração que comprometa o tratamento, ou de comportamento ofensivo ou agressivo para com os profissionais da CLÍNICA.
2. Nesse caso aplicam-se as regras da desistência quanto aos valores devidos, e a CLÍNICA entrega ao PACIENTE, a pedido, a informação clínica necessária para a continuação do tratamento noutro local.

Cláusula 16.ª (Encerramento temporário ou força maior)
1. Em caso de encerramento temporário do estabelecimento (obras, determinação do centro comercial ou das autoridades, catástrofe ou outro motivo de força maior), as consultas são reagendadas ou realizadas noutra unidade da D. Amaral, Assistência e Prevenção Dentária, Lda.
2. Estas situações não conferem ao PACIENTE o direito de cancelar o contrato, suspender os pagamentos ou pedir indemnização, sendo os prazos do tratamento ajustados em conformidade.

Cláusula 17.ª (Pacientes menores)
Quando o PACIENTE for menor, o contrato é assinado pelo seu representante legal, que assume pessoal e solidariamente todas as obrigações de pagamento e declara que o outro progenitor tem conhecimento e está de acordo com o tratamento.

Cláusula 18.ª (Proteção de dados e registos clínicos)
1. Os dados pessoais e de saúde do PACIENTE são tratados pela CLÍNICA para a prestação dos cuidados de saúde, a gestão do processo clínico e o cumprimento de obrigações legais, nos termos do Regulamento Geral sobre a Proteção de Dados.
2. As fotografias, radiografias e digitalizações intraorais fazem parte do processo clínico. A sua utilização para divulgação só é feita com consentimento escrito e separado do PACIENTE.
3. O PACIENTE pode exercer os seus direitos de acesso, retificação e demais direitos através do e-mail clinicadentaria.colombo@gmail.com.

Cláusula 19.ª (Litígios)
1. Em caso de litígio de consumo, o PACIENTE pode recorrer ao Livro de Reclamações ou a uma entidade de resolução alternativa de litígios, como o Centro de Arbitragem de Conflitos de Consumo de Lisboa (www.centroarbitragemlisboa.pt) ou o CNIACC (www.cniacc.pt).
2. Para a resolução judicial de qualquer litígio é competente o foro da comarca de Lisboa, sem prejuízo das regras legais imperativas aplicáveis aos consumidores.

Cláusula 20.ª (Disposições finais)
1. Faz parte integrante deste contrato o consentimento informado para tratamento ortodôntico da CLÍNICA, assinado pelo PACIENTE.
2. Qualquer alteração a este contrato só é válida se for feita por escrito e assinada por ambas as partes.
3. O PACIENTE declara que leu o presente contrato, que o seu conteúdo lhe foi explicado, que esclareceu todas as dúvidas e que recebeu um exemplar assinado.

Lisboa, {{data}}

ANEXO I, PLANO DE TRATAMENTO
A PREENCHER PELO MÉDICO DENTISTA

Paciente: {{paciente.nome}}
Médico dentista: {{medico.nome}}
Refinamentos incluídos no preço: Nenhum, salvo indicação em contrário: ______
Tratamentos complementares: ________________
Contenção prevista: Superior e inferior
Observações: ________________

No final do tratamento são cobradas a remoção dos attachments e a contenção superior e inferior, de acordo com a tabela de preços em vigor nessa data.

Lisboa, {{data}}`,
  },
  {
    // Contrato_Alinhadores_Opcao3_Pagamento_Decrescente.pdf
    key: 'contrato-alinhadores-opcao-3',
    kind: 'contrato',
    folder: 'ortodontia',
    title: 'Contrato — alinhadores, opção 3: pagamento decrescente',
    requiresSignature: true,
    body: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS
TRATAMENTO ORTODÔNTICO COM ALINHADORES INVISÍVEIS
Modalidade de pagamento: Opção 3, Pagamento decrescente por fase

PRIMEIRA OUTORGANTE (CLÍNICA)
Denominação: D. Amaral, Assistência e Prevenção Dentária, Lda.
NIPC: 505 887 533
Estabelecimento: Centro Dentário Colombo, Av. Lusíada, n.º 2, Loja 507, piso -1, 1500-392 Lisboa
Contactos: 933 522 580 | clinicadentaria.colombo@gmail.com

SEGUNDO OUTORGANTE (PACIENTE)
Nome completo: {{paciente.nome}}
Data de nascimento: {{paciente.nascimento}}
N.º CC / Passaporte: ________________
NIF: {{paciente.nif}}
Morada: {{paciente.morada}}
Telemóvel: {{paciente.telemovel}}
E-mail: {{paciente.email}}

REPRESENTANTE LEGAL (apenas se o paciente for menor)
Nome completo: ________________
N.º CC / NIF: ________________
Qualidade (pai, mãe, tutor): ________________
Telemóvel / E-mail: ________________

A CLÍNICA e o PACIENTE celebram o presente contrato, que se rege pelas cláusulas seguintes:

Cláusula 1.ª (Objeto)
1. O presente contrato tem por objeto a prestação, pela CLÍNICA, de tratamento ortodôntico com alinhadores invisíveis, de acordo com o plano de tratamento definido pelo médico dentista e registado no processo clínico do PACIENTE. O Anexo I faz parte integrante deste contrato.
2. O tratamento é realizado por fases. Em cada fase é entregue ao PACIENTE um conjunto de alinhadores, de acordo com a evolução clínica avaliada pelo médico dentista.
3. O PACIENTE declara que lhe foram explicados o diagnóstico, as alternativas de tratamento, os benefícios, os riscos e as limitações dos alinhadores, e que escolheu livremente o tratamento proposto.

Cláusula 2.ª (Médico dentista)
1. O tratamento é acompanhado por um médico dentista da CLÍNICA, que pode ser substituído por outro profissional da CLÍNICA em caso de ausência, férias, doença, saída da CLÍNICA ou qualquer outro motivo.
2. A substituição do médico dentista não altera as condições deste contrato e não confere ao PACIENTE o direito de cancelar o contrato nem de suspender os pagamentos.

Cláusula 3.ª (Preço)
1. O preço total do tratamento é de 4.500,00 € (quatro mil e quinhentos euros).
2. O preço inclui o planeamento do tratamento, os alinhadores previstos no plano de tratamento inicial e as consultas de controlo durante o tratamento ativo.
3. Não estão incluídos no preço, sendo cobrados à parte de acordo com a tabela de preços da CLÍNICA em vigor à data da sua realização: (a) tratamentos complementares, como destartarizações, restaurações, extrações ou outros atos indicados no Anexo I; (b) refinamentos e alinhadores adicionais, nos termos da cláusula 11.ª; (c) substituição de alinhadores perdidos ou danificados; (d) remoção dos attachments e contenção superior e inferior no final do tratamento; (e) remarcações de consultas nos termos da cláusula de faltas.

Cláusula 4.ª (Modalidade de pagamento)
1. O preço é pago na modalidade de pagamento decrescente por fase, de acordo com o quadro seguinte:
Momento · Descrição · Valor
Fase 1 · Entrada: na assinatura do contrato, antes do pedido de fabrico. Inclui a entrega do 1.º conjunto · 1.800,00 €
Fase 2 · Na entrega do 2.º conjunto de alinhadores · 1.200,00 €
Fase 3 · Na entrega do 3.º conjunto de alinhadores · 900,00 €
Fase 4 · Na entrega do 4.º conjunto de alinhadores · 600,00 €
Total · 4.500,00 €
2. O valor de cada fase é pago no próprio dia da entrega do conjunto de alinhadores correspondente, antes de o PACIENTE o levar consigo.
3. Caso o plano de tratamento preveja um número de fases diferente de quatro, os valores são ajustados pela CLÍNICA mantendo o preço total e a lógica decrescente, o que fica registado no Anexo I.
4. Os pagamentos podem ser feitos em numerário, multibanco ou transferência bancária. Um pagamento só se considera efetuado após boa cobrança do valor.

Cláusula 5.ª (Entrega dos alinhadores condicionada ao pagamento)
1. O pedido de fabrico dos alinhadores ao laboratório só é feito após o pagamento integral da entrada de 1.800,00 €.
2. O planeamento digital de todo o tratamento é feito desde o início, com a definição de todas as fases previstas. O que fica condicionado ao pagamento é a entrega: cada conjunto de alinhadores só é entregue ao PACIENTE depois de paga a fase anterior e de estarem liquidados todos os valores vencidos até essa data, o que abre a entrega da fase seguinte.
3. Cada conjunto de alinhadores só é entregue ao PACIENTE se todos os valores vencidos até essa data estiverem pagos.
4. Os alinhadores fabricados e ainda não entregues ficam à guarda da CLÍNICA, que os pode reter até ao pagamento correspondente. A CLÍNICA não é responsável por atrasos no tratamento ou perda de resultados decorrentes da não entrega por falta de pagamento.
5. A contenção e a alta ortodôntica só são entregues após a liquidação total do preço do tratamento e dos valores referidos na cláusula 3.ª, n.º 3.

Cláusula 6.ª (Incumprimento do pagamento)
1. Em caso de atraso superior a 15 dias em qualquer pagamento, a CLÍNICA pode suspender o tratamento até à regularização, sem que a suspensão lhe seja imputável.
2. Durante a suspensão, a CLÍNICA não é responsável por atrasos no tratamento, movimentos dentários indesejados, perda de resultados ou necessidade de novos alinhadores, que podem implicar custos adicionais, orçamentados à parte.
3. Se o PACIENTE não comparecer para levantar e pagar a fase seguinte no prazo de 30 dias após a data indicada pelo médico dentista, a CLÍNICA notifica-o por escrito. Na falta de resposta em 15 dias, aplica-se a cláusula de abandono do tratamento.
4. Sobre os valores em atraso são devidos juros de mora à taxa legal em vigor, bem como as despesas de cobrança comprovadamente suportadas pela CLÍNICA.
5. Se o incumprimento se mantiver por mais de 30 dias após notificação escrita da CLÍNICA, esta pode fazer cessar o contrato nos termos da cláusula de cessação, aplicando-se as regras da desistência quanto aos valores devidos.
6. A retoma do tratamento após suspensão pode exigir nova digitalização, novos alinhadores e novo orçamento, a cargo do PACIENTE, se a evolução dentária impedir a continuação do plano em curso.

Cláusula 7.ª (Obrigações do paciente)
1. Usar os alinhadores durante o tempo diário indicado pelo médico dentista e trocar de alinhador apenas segundo as suas instruções.
2. Comparecer às consultas marcadas e cumprir as orientações clínicas e de higiene oral.
3. Guardar os alinhadores no estojo quando não estiverem em uso e não os alterar, cortar ou aquecer.
4. Informar a CLÍNICA de qualquer alteração do seu estado de saúde, medicação, gravidez, dor, lesão ou quebra de alinhador.
5. Manter os seus dados de contacto atualizados.

Cláusula 8.ª (Faltas e remarcações)
1. As consultas devem ser desmarcadas com pelo menos 24 horas de antecedência.
2. A falta não justificada com essa antecedência implica o pagamento de 10,00 € pela remarcação.
3. As faltas não suspendem as obrigações de pagamento previstas neste contrato.

Cláusula 9.ª (Resultado do tratamento)
1. A CLÍNICA compromete-se a usar os meios técnicos e científicos adequados, mas não pode garantir um resultado final determinado, uma vez que este depende de fatores biológicos próprios de cada pessoa e da colaboração do PACIENTE.
2. O prolongamento do tratamento por falta de uso dos alinhadores, faltas às consultas ou incumprimento das orientações não é responsabilidade da CLÍNICA e pode implicar custos adicionais, orçamentados à parte.

Cláusula 10.ª (Previsibilidade do tratamento, número de alinhadores e intercorrências)
1. A resposta de cada pessoa ao tratamento varia. Podem ocorrer intercorrências, como movimentos dentários mais lentos ou diferentes do previsto, perda de attachments, quebra ou perda de alinhadores, problemas de saúde oral, alterações do estado de saúde ou da medicação, gravidez, falta de uso dos alinhadores ou faltas às consultas, que obriguem a alterar o plano, a duração, o número de alinhadores ou o número de fases.
2. O médico dentista pode, em qualquer momento, aumentar, diminuir ou substituir alinhadores e fases, de acordo com a evolução clínica, informando o PACIENTE e registando a alteração no processo clínico.
3. Nenhuma intercorrência ou alteração ao plano, por si só, dá ao PACIENTE o direito de cancelar o contrato, suspender ou reduzir os pagamentos, sem prejuízo dos direitos que a lei lhe reconhece enquanto consumidor.
4. As alterações relevantes ao plano, à duração ou aos valores são comunicadas ao PACIENTE, que pode pedir os esclarecimentos que entender necessários.

Cláusula 11.ª (Refinamentos e tratamentos adicionais)
1. Os refinamentos, isto é, as séries adicionais de alinhadores necessárias após a conclusão do plano inicial, bem como os tratamentos complementares, são orçamentados à parte pela CLÍNICA e só são executados após aceitação do PACIENTE, salvo se o Anexo I indicar que um determinado número de refinamentos está incluído no preço.
2. Se o PACIENTE não aceitar o orçamento adicional, a CLÍNICA pode dar o tratamento por concluído nos termos do plano inicial, sem responsabilidade pelo resultado final.

Cláusula 12.ª (Fim do tratamento e contenção)
1. No final do tratamento ativo são realizadas a remoção dos attachments e a colocação da contenção superior e inferior, cobradas à parte de acordo com a tabela de preços em vigor.
2. A utilização da contenção conforme indicado pelo médico dentista é da responsabilidade do PACIENTE. A CLÍNICA não é responsável por recidivas (regresso dos dentes à posição anterior) resultantes da falta de uso, perda ou dano da contenção.

Cláusula 13.ª (Desistência do paciente)
1. O PACIENTE pode desistir do tratamento a todo o tempo, mediante comunicação escrita à CLÍNICA.
2. A entrada destina-se a cobrir o estudo, o planeamento digital e o fabrico dos alinhadores, pelo que não é reembolsável após o pedido de fabrico ao laboratório.
3. Os valores pagos correspondentes a fases já entregues e a atos já realizados não são reembolsáveis.
4. Caso existam alinhadores já fabricados e ainda não pagos, o PACIENTE fica obrigado a pagar o respetivo custo de fabrico, comprovado pela CLÍNICA, até ao limite do valor do tratamento ainda em falta.
5. São ainda devidos os valores vencidos e não pagos até à data da desistência.

Cláusula 14.ª (Abandono do tratamento)
1. Considera-se abandono do tratamento a ausência do PACIENTE por mais de 60 dias sem justificação, ou 3 faltas seguidas, desde que a CLÍNICA o notifique por escrito e este não responda no prazo de 15 dias.
2. O abandono produz os mesmos efeitos da desistência. A partir dessa data a CLÍNICA deixa de ser responsável pela evolução do tratamento, recidivas, cáries, descalcificações ou outros danos resultantes da interrupção.
3. O retomar do tratamento após abandono depende de nova avaliação clínica e de novo orçamento.

Cláusula 15.ª (Cessação pela clínica)
1. A CLÍNICA pode pôr fim ao contrato, por comunicação escrita, em caso de falta de pagamento não regularizada após a suspensão, de falta reiterada de colaboração que comprometa o tratamento, ou de comportamento ofensivo ou agressivo para com os profissionais da CLÍNICA.
2. Nesse caso aplicam-se as regras da desistência quanto aos valores devidos, e a CLÍNICA entrega ao PACIENTE, a pedido, a informação clínica necessária para a continuação do tratamento noutro local.

Cláusula 16.ª (Encerramento temporário ou força maior)
1. Em caso de encerramento temporário do estabelecimento (obras, determinação do centro comercial ou das autoridades, catástrofe ou outro motivo de força maior), as consultas são reagendadas ou realizadas noutra unidade da D. Amaral, Assistência e Prevenção Dentária, Lda.
2. Estas situações não conferem ao PACIENTE o direito de cancelar o contrato, suspender os pagamentos ou pedir indemnização, sendo os prazos do tratamento ajustados em conformidade.

Cláusula 17.ª (Pacientes menores)
Quando o PACIENTE for menor, o contrato é assinado pelo seu representante legal, que assume pessoal e solidariamente todas as obrigações de pagamento e declara que o outro progenitor tem conhecimento e está de acordo com o tratamento.

Cláusula 18.ª (Proteção de dados e registos clínicos)
1. Os dados pessoais e de saúde do PACIENTE são tratados pela CLÍNICA para a prestação dos cuidados de saúde, a gestão do processo clínico e o cumprimento de obrigações legais, nos termos do Regulamento Geral sobre a Proteção de Dados.
2. As fotografias, radiografias e digitalizações intraorais fazem parte do processo clínico. A sua utilização para divulgação só é feita com consentimento escrito e separado do PACIENTE.
3. O PACIENTE pode exercer os seus direitos de acesso, retificação e demais direitos através do e-mail clinicadentaria.colombo@gmail.com.

Cláusula 19.ª (Litígios)
1. Em caso de litígio de consumo, o PACIENTE pode recorrer ao Livro de Reclamações ou a uma entidade de resolução alternativa de litígios, como o Centro de Arbitragem de Conflitos de Consumo de Lisboa (www.centroarbitragemlisboa.pt) ou o CNIACC (www.cniacc.pt).
2. Para a resolução judicial de qualquer litígio é competente o foro da comarca de Lisboa, sem prejuízo das regras legais imperativas aplicáveis aos consumidores.

Cláusula 20.ª (Disposições finais)
1. Faz parte integrante deste contrato o consentimento informado para tratamento ortodôntico da CLÍNICA, assinado pelo PACIENTE.
2. Qualquer alteração a este contrato só é válida se for feita por escrito e assinada por ambas as partes.
3. O PACIENTE declara que leu o presente contrato, que o seu conteúdo lhe foi explicado, que esclareceu todas as dúvidas e que recebeu um exemplar assinado.

Lisboa, {{data}}

ANEXO I, PLANO DE TRATAMENTO
A PREENCHER PELO MÉDICO DENTISTA

Paciente: {{paciente.nome}}
Médico dentista: {{medico.nome}}
Refinamentos incluídos no preço: Nenhum, salvo indicação em contrário: ______
Tratamentos complementares: ________________
Contenção prevista: Superior e inferior
Observações: ________________

Valores por fase (preencher apenas se o número de fases for diferente de 4):
Fase: ______ · Valor: ______
Fase: ______ · Valor: ______

No final do tratamento são cobradas a remoção dos attachments e a contenção superior e inferior, de acordo com a tabela de preços em vigor nessa data.

Lisboa, {{data}}`,
  },
  {
    // Modalidades_Pagamento_Alinhadores_Colombo_4500.pdf
    key: 'alinhadores-modalidades-de-pagamento',
    kind: 'contrato',
    folder: 'ortodontia',
    title: 'Alinhadores — modalidades de pagamento (4 500 €)',
    requiresSignature: false,
    body: `MODALIDADES DE PAGAMENTO
Tratamento com alinhadores invisíveis, valor total de 4 500,00 €

Paciente: {{paciente.nome}}

Importante: antes de iniciar o tratamento, será assinado um contrato entre o paciente e o Centro Dentário Colombo, com a modalidade escolhida e as condições do tratamento, para que ambas as partes fiquem seguras.

OPÇÃO 1. PAGAMENTO POR FASE
O valor é dividido por fases, e cada uma é paga no momento da entrega do conjunto de alinhadores correspondente.
Momento · Descrição · Valor
Fase 1 · Entrada, aprovação do plano e entrega do 1.º conjunto · 1 800,00 €
Fase 2 · Entrega do 2.º conjunto de alinhadores · 900,00 €
Fase 3 · Entrega do 3.º conjunto de alinhadores · 900,00 €
Fase 4 · Entrega do 4.º conjunto de alinhadores · 900,00 €
Total · 4 500,00 €

OPÇÃO 2. ENTRADA E MENSALIDADES
Após a entrada, o restante é pago em 4 mensalidades iguais.
Momento · Descrição · Valor
Início · Entrada, aprovação do plano e entrega do 1.º conjunto · 2 500,00 €
Mês 1 · 1.ª mensalidade · 500,00 €
Mês 2 · 2.ª mensalidade · 500,00 €
Mês 3 · 3.ª mensalidade · 500,00 €
Mês 4 · 4.ª mensalidade · 500,00 €
Total · 4 500,00 €

OPÇÃO 3. PAGAMENTO DECRESCENTE POR FASE
Os valores diminuem ao longo do tratamento: o esforço é maior no início e mais leve nas fases finais.
Momento · Descrição · Valor
Fase 1 · Entrada, aprovação do plano e entrega do 1.º conjunto · 1 800,00 €
Fase 2 · Entrega do 2.º conjunto de alinhadores · 1 200,00 €
Fase 3 · Entrega do 3.º conjunto de alinhadores · 900,00 €
Fase 4 · Entrega do 4.º conjunto de alinhadores · 600,00 €
Total · 4 500,00 €

EM TODAS AS OPÇÕES
• Cada conjunto de alinhadores é entregue após o pagamento da fase correspondente.
• Os retentores (contenção) e a consulta de alta são entregues após a liquidação total do tratamento.

As condições completas constam do contrato a assinar.

Centro Dentário Colombo | Av. Lusíada, n.º 2, Loja 507, piso -1, 1500-392 Lisboa | 933 522 580`,
  },
];
