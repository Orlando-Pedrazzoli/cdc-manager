# CDC Manager

Sistema de gestão clínica full-stack para clínicas dentárias multi-unidade, desenvolvido para substituir integralmente um software de gestão legado (Dentoral). Cobre o ciclo completo de operação de duas clínicas de uma mesma entidade: pacientes, agenda, registo clínico, cobrança, faturação, recalls, stock e configurações — com dados clínicos globais e operação segregada por clínica.

## Índice

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Stack tecnológica](#stack-tecnológica)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Começar](#começar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Seed de demonstração](#seed-de-demonstração)
- [Convenções de domínio](#convenções-de-domínio)
- [Testes](#testes)
- [Deployment](#deployment)
- [Licença](#licença)

## Funcionalidades

**Gestão de pacientes** — Ficha global partilhada entre clínicas, com número de processo, NIF validado por dígito de controlo, consentimentos RGPD, anamnese (alergias, medicação e condições sistémicas com banner de alerta permanente nos ecrãs clínicos) e portal do paciente com convite por email.

**Agenda multi-clínica** — Motor de disponibilidade com grelha de 15 minutos, horários de funcionamento por clínica com múltiplos intervalos por dia, semana-tipo por profissional e por clínica, correção de DST (fuso Europe/Lisbon) e prevenção atómica de dupla marcação através de transações MongoDB. Marcações online públicas com políticas configuráveis de antecedência e horizonte.

**Registo clínico** — Área dedicada do profissional com fluxo de consulta orientado por máquina de estados (pending → confirmed → checked-in → in-progress → completed), registo de atos com snapshot imutável de preço e comissão, odontograma SVG de 32 dentes com diagrama de cinco faces e orientação anatómica correta (versionado e imutável), planos de tratamento com execução faseada e notas clínicas append-only.

**Cobrança e faturação** — Fila de cobrança por clínica com checkout no balcão, guarda transacional anti-dupla-cobrança, meios de pagamento múltiplos e NIF pré-preenchido. Listagem de documentos com navegação mensal, filtros por clínica e estado, e detalhe com linhas imutáveis. Preparado para emissão fiscal certificada via Moloni (documentos em estado `awaiting-emission` até à ativação da integração).

**Recalls** — Geração automática de ciclos de reativação na conclusão de atos com intervalo de recall configurado, com um único ciclo aberto por paciente e tipo de ato. Fila de gestão por clínica com promoção automática por data, registo de tentativas de contacto e máquina de transições validada.

**Tratamentos** — Catálogo de atos como entidade de gestão própria, com a matriz real de preços da clínica importada do sistema legado (749 atos em 22 categorias, com código interno, nomenclatura de entidade, categoria, custo e flags clínicas). Importação idempotente por script com dry-run e relatório de contagens; atos importados entram por confirmar e a clínica valida duração, preço e flags no próprio catálogo. Flags de paridade com o legado: «Controla Dente» (o registo do ato exige número de dente FDI — imposto no servidor e refletido na UI da consulta) e «Exige consentimento RX» (extraída automaticamente dos 31 atos de imagiologia cujo texto legal vinha embutido no nome). Cada ato pode definir a sua ficha técnica de materiais (BOM) com editor no próprio catálogo.

**Stock** — Catálogo de produtos com taxonomia emergente (famílias em texto livre com sugestão automática), existências por clínica materializadas a partir de um ledger imutável de movimentos, alertas de stock mínimo, entradas, saídas com motivo obrigatório em acertos e quebras, e transferências entre clínicas registadas como par atómico de movimentos numa única transação. **Baixa automática por BOM**: ao concluir a consulta, os materiais da ficha técnica de cada ato são consumidos no armazém principal da clínica (movimentos `consumption` valorizados ao custo corrente, rastreados ao procedimento); a anulação de um ato já consumido devolve o stock por estorno baseado nos movimentos reais. O consumo automático nunca bloqueia o fluxo clínico — saldo negativo é sinal de inventário a corrigir, visível no dashboard.

**Configurações** — Dados, políticas e horários de cada clínica (com aviso não destrutivo de marcações futuras afetadas por alterações de horário), gestão de utilizadores da equipa (convite de administradores e rececionistas por email com código de ativação de uso único, desativação sem apagar, guardas contra auto-bloqueio e contra remoção do último administrador) e segurança da própria conta (mudança de password com verificação da password atual).

**Notificações** — Emails transacionais de confirmação de marcação via Resend, condicionados ao consentimento RGPD do paciente e enviados em regime best-effort (uma falha de envio nunca reverte a operação principal).

**Administração transversal** — RBAC estrito (administração, receção com âmbito por clínica, profissionais com acesso apenas aos seus dados), trilho de auditoria em todas as escritas, relatórios mensais de produção e comissões calculados a partir de snapshots, e dashboard operacional em tempo real.

## Arquitetura

Princípios estruturais do sistema:

- **Multi-clínica com dados clínicos globais.** Pacientes e fichas são partilhados; agenda, capacidade, cobrança, faturação, recalls e stock são segregados por `clinicId` em todos os modelos operacionais. As interfaces geram colunas e seletores dinamicamente a partir da coleção de clínicas.
- **Imutabilidade financeira.** Valores monetários em cêntimos inteiros com arredondamento bancário; cada ato congela preço e taxa de comissão no momento do registo; alterações posteriores de tabela nunca afetam registos existentes.
- **Never delete.** Registos anulam-se com autor e motivo; o stock corrige-se com movimentos de acerto; o odontograma versiona-se; faturas anulam-se por nota de crédito.
- **Invariantes por transação.** Dupla marcação, dupla cobrança e saldo negativo de stock são prevenidos com transações MongoDB e atualizações condicionadas que abortam quando o estado diverge do esperado.
- **Regra de ouro dos horários.** Alterar horários de clínicas ou profissionais nunca cancela nem move marcações existentes; o sistema identifica conflitos e a remarcação é sempre uma decisão humana.
- **Fronteira cliente/servidor disciplinada.** Constantes de domínio partilhadas vivem em `src/lib/domain.ts` sem dependências; os modelos Mongoose importam-nas e reexportam-nas, garantindo que componentes de cliente nunca arrastam código de servidor.

## Stack tecnológica

| Camada                   | Tecnologia                                                  |
| ------------------------ | ----------------------------------------------------------- |
| Framework                | Next.js 16 (App Router, Turbopack)                          |
| Linguagem                | TypeScript (strict)                                         |
| Base de dados            | MongoDB Atlas com Mongoose 9                                |
| Autenticação             | NextAuth v5 (JWT) com RBAC                                  |
| Validação                | Zod 4                                                       |
| Estilos                  | Tailwind CSS v4 com propriedades críticas em estilos inline |
| Email transacional       | Resend (domínio dedicado, região UE)                        |
| Armazenamento de imagens | Cloudinary (assets privados, URLs assinados)                |
| Deployment               | Vercel                                                      |

## Estrutura do projeto

```
src/
  actions/          Server Actions (uma por domínio: agenda, cobrança,
                    faturação, recalls, stock, configurações, ...)
  app/
    admin/          Área de administração e receção
    doutor/         Área clínica dos profissionais
    marcar/         Fluxo público de marcação online
    portal/         Portal do paciente
  components/       Componentes por domínio + componentes de UI partilhados
  lib/
    domain.ts       Constantes de domínio partilhadas cliente/servidor
    availability.ts Motor de disponibilidade e utilitários de fuso horário
    validations/    Schemas Zod e máquinas de transição por domínio
    seed/           Seed de demonstração
  models/           Modelos Mongoose (20+, todos com clinicId quando
                    operacionais)
scripts/
  import-precos.ts  Importação idempotente da matriz real de preços
  data/             Fonte canónica versionada (JSON gerado do export legado)
```

## Começar

### Pré-requisitos

- Node.js 20 ou superior
- Acesso a um cluster MongoDB Atlas (ou instância MongoDB com suporte a replica set, necessário para transações)

### Instalação

```bash
git clone https://github.com/Orlando-Pedrazzoli/cdc-manager.git
cd cdc-manager
npm install
cp .env.example .env.local   # criar e preencher (ver tabela abaixo)
npm run dev
```

A aplicação fica disponível em `http://localhost:3000`.

## Variáveis de ambiente

Definidas em `.env.local` (nunca versionado):

| Variável                                                                 | Descrição                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `MONGODB_URI`                                                            | String de ligação ao MongoDB Atlas                           |
| `AUTH_SECRET`                                                            | Segredo do NextAuth (gerar com `npx auth secret`)            |
| `AUTH_URL`                                                               | URL base da aplicação                                        |
| `RESEND_API_KEY`                                                         | Chave da API do Resend                                       |
| `EMAIL_FROM`                                                             | Remetente dos emails transacionais (domínio verificado)      |
| `NEXT_PUBLIC_APP_URL`                                                    | URL pública usada nos links dos emails                       |
| `AUTH_TRUST_HOST`                                                        | `true` em produção atrás de proxy (Vercel)                   |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Credenciais Cloudinary (assets privados)                     |
| `CLOUDINARY_FOLDER`                                                      | Pasta raiz dos uploads do projeto                            |
| `SEED_DEMO_EMAIL`                                                        | Email que recebe as notificações no ambiente de demonstração |

## Seed de demonstração

O seed cria um ambiente de demonstração completo: profissionais com semanas-tipo nas duas clínicas, pacientes com NIFs válidos gerados, um paciente com histórico clínico rico (anamnese, odontograma versionado e plano de tratamento em curso), o dia corrente com marcações em estados relativos à hora de execução e uma fila de cobrança com valores.

```bash
# Dry-run (não escreve nada)
npx tsx --env-file=.env.local src/lib/seed/demo.ts

# Execução real
npx tsx --env-file=.env.local src/lib/seed/demo.ts --confirmar
```

O script aborta automaticamente se a base contiver mais de 100 pacientes, como proteção contra execução acidental sobre dados reais.

## Importação da matriz de preços

A tabela real de preços (export do sistema legado) vive versionada em `scripts/data/tab-precos-colombo.json` e importa-se com:

```bash
# Dry-run: valida o dataset (contagens, códigos, limites) e imprime o relatório
npx tsx --env-file=.env.local scripts/import-precos.ts --dry-run

# Import real: upsert idempotente por código interno; nunca apaga; não toca
# em atos já confirmados pela clínica
npx tsx --env-file=.env.local scripts/import-precos.ts
```

## Convenções de domínio

- Valores monetários armazenados em cêntimos inteiros; conversão de euros para cêntimos na fronteira de validação.
- Dentes identificados em notação FDI (definitivos 11–48; decíduos 51–85 suportados no modelo).
- Datas e horas de parede calculadas no fuso `Europe/Lisbon` com `Intl` nativo, incluindo correção de DST.
- Quantidades de stock sempre positivas; a direção do movimento é dada pelo tipo.
- Terminologia de interface: "Corpo Clínico" para o grupo e "profissional" para o indivíduo.
- Cada ficheiro entregue inclui o caminho de destino como comentário na primeira linha.

## Testes

A lógica pura (conversões monetárias, aritmética de datas com clamp de fim de mês, validação de horários e sobreposições, máquinas de transição, geração de slugs) é coberta por testes executados antes de cada entrega. A verificação de tipos (`npx tsc --noEmit`) é mantida sem erros em todos os commits.

## Deployment

O projeto está em produção na Vercel (build do preset Next.js, sem `vercel.json` — o ficheiro só será criado quando os cron jobs dos recalls o exigirem). Para replicar o deployment:

1. Importar o repositório na Vercel (preset Next.js).
2. Configurar as variáveis de ambiente da tabela acima (valores de produção próprios: `AUTH_SECRET` distinto do de desenvolvimento; `NEXT_PUBLIC_APP_URL` com o domínio real, sem barra final e sem aspas nos campos da UI).
3. Autorizar o acesso de rede da Vercel no MongoDB Atlas (Network Access).
4. Opcionalmente, configurar um domínio personalizado.

Antes de operar com dados reais, o cluster Atlas deve ser migrado para um tier com backups automáticos e point-in-time recovery.

## Licença

Software proprietário desenvolvido por Pedrazzoli Digital. Todos os direitos reservados. A utilização, cópia ou distribuição não autorizada não é permitida.
