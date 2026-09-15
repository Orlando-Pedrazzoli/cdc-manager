// 📄 src/lib/data/document-templates.ts
// =============================================================================
// CDC Manager — Modelos de documentos: defaults + placeholders (Fase 5A)
// -----------------------------------------------------------------------------
// E14 (Isabel): relatório médico, atestado médico, certificado de presença,
// certificado de presença de acompanhante. P14 (Victor): "modelos de
// documentos mais utilizados, prontos para editar e imprimir".
// Os textos são pontos de partida em PT-PT; a administração edita-os em
// /admin/modelos. Placeholders {{...}} são substituídos ao gerar; o texto
// resultante fica EDITÁVEL antes de emitir. Nunca contêm diagnóstico —
// esse escreve-o o médico no momento.
// =============================================================================

export const TEMPLATE_KINDS = [
  'atestado',
  'presenca',
  'acompanhante',
  'relatorio',
  'consentimento',
  'termo',
  'pos-operatorio',
  'autorizacao',
  'outro',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  atestado: 'Atestado médico',
  presenca: 'Certificado de presença',
  acompanhante: 'Certificado de presença de acompanhante',
  relatorio: 'Relatório médico',
  consentimento: 'Consentimento informado',
  termo: 'Termo de responsabilidade',
  'pos-operatorio': 'Instruções pós-operatórias',
  autorizacao: 'Autorização',
  outro: 'Outro',
};

import type { DocumentCategory } from '@/lib/domain';

/** Categoria do Document onde o PDF é arquivado, por tipo */
export const TEMPLATE_KIND_DOC_CATEGORY: Record<
  TemplateKind,
  DocumentCategory
> = {
  atestado: 'certificate',
  presenca: 'certificate',
  acompanhante: 'certificate',
  relatorio: 'report',
  consentimento: 'consent',
  termo: 'consent',
  'pos-operatorio': 'other',
  autorizacao: 'authorization',
  outro: 'other',
};

/** Placeholders disponíveis (mostrados no editor de modelos) */
export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'paciente.nome', label: 'Nome do paciente' },
  { key: 'paciente.nif', label: 'NIF do paciente' },
  { key: 'paciente.utente', label: 'Nº de utente' },
  { key: 'paciente.nascimento', label: 'Data de nascimento' },
  { key: 'paciente.processo', label: 'Nº de processo' },
  { key: 'medico.nome', label: 'Nome do médico' },
  { key: 'medico.cedula', label: 'Cédula profissional' },
  { key: 'clinica.nome', label: 'Nome da clínica' },
  { key: 'clinica.morada', label: 'Morada da clínica' },
  { key: 'data', label: 'Data de emissão (por extenso)' },
  { key: 'data.curta', label: 'Data de emissão (dd/mm/aaaa)' },
  { key: 'consulta.data', label: 'Data da consulta' },
  { key: 'consulta.inicio', label: 'Hora de início da consulta' },
  { key: 'consulta.fim', label: 'Hora de fim da consulta' },
  { key: 'acompanhante.nome', label: 'Nome do acompanhante' },
  { key: 'dias', label: 'Nº de dias (atestado)' },
  { key: 'tratamento', label: 'Tratamento / ato (livre)' },
];

export interface DefaultTemplate {
  key: string;
  kind: TemplateKind;
  title: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'atestado-medico',
    kind: 'atestado',
    title: 'Atestado médico',
    body: `ATESTADO MÉDICO

{{medico.nome}}, médico(a) dentista, cédula profissional n.º {{medico.cedula}}, a exercer em {{clinica.nome}}, atesta que {{paciente.nome}}, portador(a) do NIF {{paciente.nif}}, foi observado(a) em consulta no dia {{consulta.data}} e, pela sua situação clínica, necessita de repouso / dispensa das suas atividades por um período de {{dias}} dia(s), a contar desta data.

O presente atestado é emitido a pedido do(a) interessado(a) para os efeitos que julgar convenientes.

{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'certificado-presenca',
    kind: 'presenca',
    title: 'Certificado de presença',
    body: `CERTIFICADO DE PRESENÇA

Para os devidos efeitos se certifica que {{paciente.nome}}, portador(a) do NIF {{paciente.nif}}, esteve presente em {{clinica.nome}} no dia {{consulta.data}}, entre as {{consulta.inicio}} e as {{consulta.fim}}, para consulta de medicina dentária.

{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'certificado-acompanhante',
    kind: 'acompanhante',
    title: 'Certificado de presença de acompanhante',
    body: `CERTIFICADO DE PRESENÇA DE ACOMPANHANTE

Para os devidos efeitos se certifica que {{acompanhante.nome}} acompanhou o(a) paciente {{paciente.nome}} a consulta de medicina dentária em {{clinica.nome}}, no dia {{consulta.data}}, entre as {{consulta.inicio}} e as {{consulta.fim}}.

{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'relatorio-medico',
    kind: 'relatorio',
    title: 'Relatório médico',
    body: `RELATÓRIO MÉDICO

Paciente: {{paciente.nome}}
Data de nascimento: {{paciente.nascimento}} · NIF: {{paciente.nif}} · Processo n.º {{paciente.processo}}

Motivo da consulta:


Observação clínica e exames:


Diagnóstico / hipóteses:


Tratamento realizado e/ou proposto:


Recomendações:


{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'consentimento-endodontia',
    kind: 'consentimento',
    title: 'Consentimento informado — Endodontia',
    body: `CONSENTIMENTO INFORMADO — ENDODONTIA (TRATAMENTO DE CANAL)

Eu, {{paciente.nome}}, NIF {{paciente.nif}}, declaro que fui informado(a) pelo(a) Dr.(a) {{medico.nome}} sobre a natureza do tratamento endodôntico proposto.

O que é: a endodontia (desvitalização) é uma intervenção que procura conservar um dente que de outra forma teria de ser extraído. Consiste na remoção do tecido pulpar ("nervo") do interior das raízes, preservando a estrutura e a função do dente. Quase sempre necessita de anestesia local e de várias radiografias.

Fui informado(a) de que: será feito um breve historial médico; o tratamento pode necessitar de mais do que uma sessão; existe possibilidade de dor ou desconforto nos dias seguintes, controlável com medicação; em alguns casos o tratamento pode não ser bem-sucedido, podendo ser necessário retratamento, cirurgia apical ou extração; o dente tratado fica mais frágil e normalmente necessita de restauração ou coroa; a ausência de tratamento pode levar a infeção e perda do dente.

Tive oportunidade de colocar todas as questões e recebi respostas satisfatórias. Consinto na realização do tratamento.

{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'consentimento-cirurgia',
    kind: 'consentimento',
    title: 'Consentimento informado — Cirurgia oral / extração',
    body: `CONSENTIMENTO INFORMADO — CIRURGIA ORAL

Eu, {{paciente.nome}}, NIF {{paciente.nif}}, declaro que fui informado(a) pelo(a) Dr.(a) {{medico.nome}} sobre a intervenção cirúrgica proposta: {{tratamento}}.

Fui informado(a) dos riscos e complicações possíveis, nomeadamente: dor, inchaço e hematoma; hemorragia; infeção; limitação temporária da abertura da boca; alteração temporária ou, raramente, permanente da sensibilidade do lábio, língua ou queixo (nos dentes inferiores próximos do nervo); comunicação com o seio maxilar (nos dentes superiores posteriores); fratura de dentes vizinhos ou de restaurações.

Comprometo-me a seguir as instruções pós-operatórias e a informar sobre alergias, medicação e condições de saúde relevantes. Consinto na realização da intervenção.

{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'pos-operatorio-extracao',
    kind: 'pos-operatorio',
    title: 'Instruções pós-operatórias — Extração',
    body: `INSTRUÇÕES APÓS EXTRAÇÃO DENTÁRIA

Paciente: {{paciente.nome}} · Data: {{consulta.data}}

Nas primeiras 24 horas:
• Morda a compressa durante 30–45 minutos; troque-a se ficar encharcada.
• Não bocheche, não cuspa e não use palhinha — protege o coágulo.
• Não fume nem beba álcool.
• Aplique frio no exterior da face (10 minutos, com intervalos).
• Coma alimentos frios ou mornos e moles; evite o lado da extração.

Nos dias seguintes:
• Escove normalmente os outros dentes; na zona da extração, com cuidado, a partir do 2.º dia.
• A partir de 24 h, bochechos suaves com água morna e sal ou elixir indicado.
• Tome a medicação conforme prescrito.

Contacte a clínica se: a hemorragia não parar, a dor aumentar após o 3.º dia, tiver febre ou inchaço que piora.

{{clinica.nome}} · {{clinica.morada}}`,
  },
  {
    key: 'termo-responsabilidade',
    kind: 'termo',
    title: 'Termo de responsabilidade',
    body: `TERMO DE RESPONSABILIDADE

Eu, {{paciente.nome}}, NIF {{paciente.nif}}, declaro que fui esclarecido(a) pelo(a) Dr.(a) {{medico.nome}} sobre o tratamento proposto ({{tratamento}}), as alternativas existentes, os riscos e as consequências da sua não realização, e que decido, de forma livre e informada, assumir a responsabilidade pela opção tomada.

{{clinica.morada}}, {{data}}`,
  },
  {
    key: 'autorizacao-menor',
    kind: 'autorizacao',
    title: 'Autorização — tratamento de menor',
    body: `AUTORIZAÇÃO PARA TRATAMENTO DE MENOR

Eu, ________________________________, NIF _______________, na qualidade de ______________ (pai / mãe / tutor legal) do(a) menor {{paciente.nome}}, nascido(a) a {{paciente.nascimento}}, autorizo a realização dos tratamentos de medicina dentária considerados necessários pelo(a) Dr.(a) {{medico.nome}}, em {{clinica.nome}}, tendo sido informado(a) da sua natureza, riscos e alternativas.

{{clinica.morada}}, {{data}}`,
  },
];
